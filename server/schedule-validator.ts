import { Course, Faculty, Room, ScheduledSlot } from '@shared/schema';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  type: 'faculty_conflict' | 'room_conflict' | 'capacity_overflow' | 'missing_requirements';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedSlots: string[];
}

export interface ValidationWarning {
  type: 'suboptimal_capacity' | 'room_type_mismatch' | 'faculty_overload';
  description: string;
  affectedSlots: string[];
}

export class ScheduleValidator {
  
  /**
   * Validate a complete timetable for conflicts and issues
   */
  static validateTimetable(
    slots: ScheduledSlot[],
    courses: Course[],
    faculty: Faculty[],
    rooms: Room[]
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check for faculty conflicts (same faculty, same time)
    const facultyConflicts = this.checkFacultyConflicts(slots);
    errors.push(...facultyConflicts);

    // Check for room conflicts (same room, same time)
    const roomConflicts = this.checkRoomConflicts(slots);
    errors.push(...roomConflicts);

    // Check capacity issues
    const capacityIssues = this.checkCapacityIssues(slots, courses, rooms);
    errors.push(...capacityIssues.errors);
    warnings.push(...capacityIssues.warnings);

    // Check faculty workload
    const workloadIssues = this.checkFacultyWorkload(slots, faculty);
    warnings.push(...workloadIssues);

    // Check room type matching
    const roomTypeIssues = this.checkRoomTypeMatching(slots, courses, rooms);
    warnings.push(...roomTypeIssues);

    // Generate suggestions
    if (errors.length > 0) {
      suggestions.push('Resolve conflicts before finalizing the timetable');
    }
    if (warnings.length > 5) {
      suggestions.push('Consider adjusting room assignments for better optimization');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  private static checkFacultyConflicts(slots: ScheduledSlot[]): ValidationError[] {
    const conflicts: ValidationError[] = [];
    const facultyTimeMap = new Map<string, string[]>();

    slots.forEach(slot => {
      const timeKey = `${slot.day}-${slot.startTime}`;
      const facultySlots = facultyTimeMap.get(slot.facultyId) || [];
      
      if (facultySlots.includes(timeKey)) {
        conflicts.push({
          type: 'faculty_conflict',
          severity: 'high',
          description: `Faculty member has conflicting assignments at ${slot.day} ${slot.startTime}`,
          affectedSlots: [slot.id, ...facultySlots]
        });
      } else {
        facultySlots.push(timeKey);
        facultyTimeMap.set(slot.facultyId, facultySlots);
      }
    });

    return conflicts;
  }

  private static checkRoomConflicts(slots: ScheduledSlot[]): ValidationError[] {
    const conflicts: ValidationError[] = [];
    const roomTimeMap = new Map<string, string[]>();

    slots.forEach(slot => {
      const timeKey = `${slot.day}-${slot.startTime}`;
      const roomSlots = roomTimeMap.get(slot.roomId) || [];
      
      if (roomSlots.includes(timeKey)) {
        conflicts.push({
          type: 'room_conflict',
          severity: 'high',
          description: `Room has conflicting bookings at ${slot.day} ${slot.startTime}`,
          affectedSlots: [slot.id, ...roomSlots]
        });
      } else {
        roomSlots.push(timeKey);
        roomTimeMap.set(slot.roomId, roomSlots);
      }
    });

    return conflicts;
  }

  private static checkCapacityIssues(
    slots: ScheduledSlot[], 
    courses: Course[], 
    rooms: Room[]
  ): { errors: ValidationError[], warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    slots.forEach(slot => {
      const course = courses.find(c => c.id === slot.courseId);
      const room = rooms.find(r => r.id === slot.roomId);
      
      if (!course || !room) return;

      // Estimate class size based on course level
      const estimatedSize = this.estimateClassSize(course);
      
      if (estimatedSize > room.capacity) {
        errors.push({
          type: 'capacity_overflow',
          severity: 'high',
          description: `Course ${course.code} (${estimatedSize} students) exceeds room capacity (${room.capacity})`,
          affectedSlots: [slot.id]
        });
      } else if (estimatedSize < room.capacity * 0.3) {
        warnings.push({
          type: 'suboptimal_capacity',
          description: `Course ${course.code} significantly underutilizes room capacity`,
          affectedSlots: [slot.id]
        });
      }
    });

    return { errors, warnings };
  }

  private static checkFacultyWorkload(slots: ScheduledSlot[], faculty: Faculty[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const facultyHours = new Map<string, number>();

    // Count hours per faculty
    slots.forEach(slot => {
      const current = facultyHours.get(slot.facultyId) || 0;
      facultyHours.set(slot.facultyId, current + 1);
    });

    // Check against max hours
    faculty.forEach(f => {
      const assignedHours = facultyHours.get(f.id) || 0;
      if (assignedHours > f.maxHoursPerWeek) {
        warnings.push({
          type: 'faculty_overload',
          description: `${f.name} assigned ${assignedHours} hours, exceeds maximum of ${f.maxHoursPerWeek}`,
          affectedSlots: slots.filter(s => s.facultyId === f.id).map(s => s.id)
        });
      }
    });

    return warnings;
  }

  private static checkRoomTypeMatching(
    slots: ScheduledSlot[], 
    courses: Course[], 
    rooms: Room[]
  ): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    slots.forEach(slot => {
      const course = courses.find(c => c.id === slot.courseId);
      const room = rooms.find(r => r.id === slot.roomId);
      
      if (!course || !room) return;

      // Check if lab course is in lab room
      if (course.labHours && course.labHours > 0 && room.type !== 'lab') {
        warnings.push({
          type: 'room_type_mismatch',
          description: `Lab course ${course.code} scheduled in non-lab room ${room.name}`,
          affectedSlots: [slot.id]
        });
      }
    });

    return warnings;
  }

  private static estimateClassSize(course: Course): number {
    // Estimate based on course level and type
    const courseNumber = parseInt(course.code.replace(/\D/g, ''));
    
    if (courseNumber < 200) return 60; // Introductory courses
    if (courseNumber < 300) return 40; // Intermediate courses
    if (courseNumber < 400) return 30; // Advanced courses
    return 20; // Senior/graduate courses
  }

  /**
   * Quick validation for a single slot
   */
  static validateSlot(
    slot: ScheduledSlot,
    course: Course,
    faculty: Faculty,
    room: Room,
    existingSlots: ScheduledSlot[]
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for conflicts with existing slots
    const timeKey = `${slot.day}-${slot.startTime}`;
    
    const facultyConflict = existingSlots.find(s => 
      s.facultyId === slot.facultyId && 
      s.day === slot.day && 
      s.startTime === slot.startTime
    );
    
    if (facultyConflict) {
      errors.push({
        type: 'faculty_conflict',
        severity: 'high',
        description: `Faculty ${faculty.name} already assigned at this time`,
        affectedSlots: [slot.id, facultyConflict.id]
      });
    }

    const roomConflict = existingSlots.find(s => 
      s.roomId === slot.roomId && 
      s.day === slot.day && 
      s.startTime === slot.startTime
    );
    
    if (roomConflict) {
      errors.push({
        type: 'room_conflict',
        severity: 'high',
        description: `Room ${room.name} already booked at this time`,
        affectedSlots: [slot.id, roomConflict.id]
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions: errors.length > 0 ? ['Choose different time slot or room'] : []
    };
  }
}