import { Room, Course } from '@shared/schema';
import { 
  RoomAllocationService, 
  RoomAnalyzer, 
  UtilizationTracker, 
  AllocationEngine, 
  ConflictResolver,
  TimeSlot,
  AllocationResult,
  AllocationMetrics,
  AllocationConfig,
  DEFAULT_ALLOCATION_CONFIG 
} from '@shared/room-allocation';
import { RoomAnalyzerImpl } from './room-analyzer';
import { UtilizationTrackerImpl } from './utilization-tracker';
import { AllocationEngineImpl } from './allocation-engine';

export class RoomAllocationServiceImpl implements RoomAllocationService {
  public analyzer: RoomAnalyzer;
  public tracker: UtilizationTracker;
  public engine: AllocationEngine;
  public resolver: ConflictResolver;
  
  private config: AllocationConfig;
  private rooms: Room[];

  constructor(
    rooms: Room[], 
    timeSlots: TimeSlot[], 
    config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG
  ) {
    this.config = config;
    this.rooms = rooms;
    
    // Initialize components
    this.analyzer = new RoomAnalyzerImpl(config);
    this.tracker = new UtilizationTrackerImpl(rooms, timeSlots.length, config);
    this.engine = new AllocationEngineImpl(rooms, timeSlots.length, config);
    
    // Simple conflict resolver implementation
    this.resolver = {
      detectConflicts: (room, timeSlot, existingAllocations) => {
        // Basic conflict detection
        const slotKey = `${room.id}-${timeSlot.day}-${timeSlot.startTime}`;
        if (existingAllocations.has(slotKey)) {
          return [{
            type: 'room_unavailable',
            severity: 'high',
            description: 'Room is already allocated for this time slot',
            affectedTimeSlot: timeSlot,
          }];
        }
        return [];
      },
      
      suggestAlternatives: (_, __, availableRooms) => {
        return {
          canResolve: availableRooms.length > 0,
          alternativeTimeSlots: [],
          alternativeRooms: availableRooms.slice(0, 3),
          suggestedActions: ['Try alternative rooms', 'Consider different time slots'],
        };
      },
      
      resolveConflict: (_) => {
        return {
          canResolve: false,
          alternativeTimeSlots: [],
          alternativeRooms: [],
          suggestedActions: ['Manual intervention required'],
        };
      },
    };
  }

  async allocateRoomsForTimetable(
    courses: Course[], 
    rooms: Room[], 
    timeSlots: TimeSlot[]
  ): Promise<AllocationResult[]> {
    const results: AllocationResult[] = [];
    
    // Reset allocation state
    this.reset();
    
    // Sort courses by priority (lecture hours descending, then by course level)
    const sortedCourses = this.sortCoursesByPriority(courses);
    
    // Track which time slots are used per course to avoid double-booking
    const courseTimeSlots = new Map<string, Set<string>>();
    
    for (const course of sortedCourses) {
      const requirements = RoomAnalyzerImpl.getCourseRequirements(course);
      // Schedule both lecture and lab hours
      const lectureHoursToSchedule = course.lectureHours || 0;
      const labHoursToSchedule = course.labHours || 0;
      
      // Initialize course time slot tracking
      if (!courseTimeSlots.has(course.id)) {
        courseTimeSlots.set(course.id, new Set());
      }
      const usedSlots = courseTimeSlots.get(course.id)!;
      
      let scheduledLectureHours = 0;
      let scheduledLabHours = 0;
      
      // Sort time slots deterministically (by day then time) instead of shuffling
      const sortedTimeSlots = this.sortTimeSlotsDeterministically([...timeSlots]);
      
      // First, schedule lecture hours
      if (lectureHoursToSchedule > 0) {
        const lectureRequirements = { ...requirements };
        // Lectures can use lecture or tutorial rooms
        lectureRequirements.requiredRoomType = ['lecture', 'tutorial'];
        lectureRequirements.requiredFacilities = [];
        
        for (const timeSlot of sortedTimeSlots) {
          if (scheduledLectureHours >= lectureHoursToSchedule) {
            break;
          }
          
          const slotKey = `${timeSlot.day}-${timeSlot.startTime}`;
          // Skip if this course already has a class at this time
          if (usedSlots.has(slotKey)) {
            continue;
          }
          
          // Get available rooms for this time slot (prefer lecture/tutorial rooms)
          const availableRooms = rooms.filter(room => 
            this.engine.isSlotAvailable(room.id, timeSlot) &&
            (room.type === 'lecture' || room.type === 'tutorial')
          );
          
          if (availableRooms.length === 0) {
            continue;
          }
          
          const result = this.engine.allocateRoom(lectureRequirements, timeSlot, availableRooms);
          
          if (result.selectedRoom) {
            scheduledLectureHours++;
            usedSlots.add(slotKey);
            results.push(result);
          }
        }
        
        if (scheduledLectureHours < lectureHoursToSchedule) {
          console.warn(`Course ${course.code} only scheduled ${scheduledLectureHours}/${lectureHoursToSchedule} lecture hours`);
        }
      }
      
      // Then, schedule lab hours (need lab rooms)
      if (labHoursToSchedule > 0) {
        const labRequirements = { ...requirements };
        labRequirements.requiredRoomType = ['lab'];
        labRequirements.requiredFacilities = ['computers', 'equipment'];
        labRequirements.expectedSize = Math.min(requirements.expectedSize, 30); // Labs are smaller
        
        for (const timeSlot of sortedTimeSlots) {
          if (scheduledLabHours >= labHoursToSchedule) {
            break;
          }
          
          const slotKey = `${timeSlot.day}-${timeSlot.startTime}`;
          if (usedSlots.has(slotKey)) {
            continue;
          }
          
          // Get available lab rooms only
          const availableLabRooms = rooms.filter(room => 
            this.engine.isSlotAvailable(room.id, timeSlot) &&
            room.type === 'lab'
          );
          
          if (availableLabRooms.length === 0) {
            continue;
          }
          
          const result = this.engine.allocateRoom(labRequirements, timeSlot, availableLabRooms);
          
          if (result.selectedRoom) {
            scheduledLabHours++;
            usedSlots.add(slotKey);
            results.push(result);
          }
        }
        
        if (scheduledLabHours < labHoursToSchedule) {
          console.warn(`Course ${course.code} only scheduled ${scheduledLabHours}/${labHoursToSchedule} lab hours`);
        }
      }
    }
    
    return results;
  }

  getMetrics(): AllocationMetrics {
    return this.engine.generateMetrics();
  }

  reset(): void {
    this.engine.reset();
    this.tracker.resetUtilization();
  }

  // Helper method to sort courses by scheduling priority
  private sortCoursesByPriority(courses: Course[]): Course[] {
    return [...courses].sort((a, b) => {
      // First priority: courses with more lecture hours (harder to schedule)
      if (a.lectureHours !== b.lectureHours) {
        return b.lectureHours - a.lectureHours;
      }
      
      // Second priority: course level (lower level courses are typically larger)
      const aLevel = this.getCourseLevel(a.code);
      const bLevel = this.getCourseLevel(b.code);
      
      if (aLevel !== bLevel) {
        return aLevel - bLevel; // Lower level first
      }
      
      // Third priority: lab courses (need specific rooms)
      const aHasLab = (a.labHours || 0) > 0;
      const bHasLab = (b.labHours || 0) > 0;
      
      if (aHasLab && !bHasLab) return -1;
      if (!aHasLab && bHasLab) return 1;
      
      // Finally: alphabetical by course code
      return a.code.localeCompare(b.code);
    });
  }

  private getCourseLevel(courseCode: string): number {
    // Extract course level from course code (e.g., CS101 -> 100, CS301 -> 300)
    const match = courseCode.match(/(\d+)/);
    return match ? Math.floor(parseInt(match[1]) / 100) * 100 : 999;
  }

  // Sort time slots deterministically by day and time for consistent allocation
  private sortTimeSlotsDeterministically(timeSlots: TimeSlot[]): TimeSlot[] {
    const dayOrder: Record<string, number> = {
      'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6
    };
    
    return timeSlots.sort((a, b) => {
      // First sort by day
      const dayDiff = (dayOrder[a.day] ?? 7) - (dayOrder[b.day] ?? 7);
      if (dayDiff !== 0) return dayDiff;
      
      // Then sort by start time
      return a.startTime.localeCompare(b.startTime);
    });
  }

  // Fisher-Yates shuffle algorithm (kept for backward compatibility but not used by default)
  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Get detailed allocation report
  getDetailedReport(): {
    metrics: AllocationMetrics;
    utilizationBalance: any;
    rebalancingSuggestions: any;
    roomEfficiency: { roomId: string; roomName: string; efficiency: number }[];
  } {
    const metrics = this.getMetrics();
    const utilizationBalance = this.tracker.getUtilizationBalance();
    const rebalancingSuggestions = (this.tracker as UtilizationTrackerImpl).getRebalancingSuggestions();
    
    const roomEfficiency = this.rooms.map(room => ({
      roomId: room.id,
      roomName: room.name,
      efficiency: (this.tracker as UtilizationTrackerImpl).getUtilizationEfficiency(room.id),
    }));

    return {
      metrics,
      utilizationBalance,
      rebalancingSuggestions,
      roomEfficiency,
    };
  }


}