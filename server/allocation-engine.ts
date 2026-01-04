import { Room, RoomType } from '@shared/schema';
import { 
  AllocationEngine, 
  CourseRequirements, 
  TimeSlot, 
  AllocationResult, 
  RoomCandidate, 
  AllocationMetrics,
  AllocationConflict,
  AllocationConfig,
  DEFAULT_ALLOCATION_CONFIG 
} from '@shared/room-allocation';
import { RoomAnalyzerImpl } from './room-analyzer';
import { UtilizationTrackerImpl } from './utilization-tracker';

export class AllocationEngineImpl implements AllocationEngine {
  private analyzer: RoomAnalyzerImpl;
  private tracker: UtilizationTrackerImpl;
  private config: AllocationConfig;
  private allocatedSlots: Map<string, string> = new Map(); // roomId-timeSlot -> courseId
  private allocationHistory: AllocationResult[] = [];

  constructor(
    rooms: Room[], 
    totalTimeSlots: number, 
    config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG
  ) {
    this.config = config;
    this.analyzer = new RoomAnalyzerImpl(config);
    this.tracker = new UtilizationTrackerImpl(rooms, totalTimeSlots, config);
  }

  allocateRoom(
    requirements: CourseRequirements, 
    timeSlot: TimeSlot, 
    availableRooms: Room[]
  ): AllocationResult {
    // Filter out rooms that are already allocated for this time slot
    const freeRooms = availableRooms.filter(room => {
      const slotKey = this.getSlotKey(room.id, timeSlot);
      return !this.allocatedSlots.has(slotKey);
    });

    if (freeRooms.length === 0) {
      return this.handleNoAvailableRooms(requirements, timeSlot);
    }

    // Evaluate all available rooms
    const candidates = this.evaluateRoomCandidates(freeRooms, requirements, timeSlot);
    
    // Select the best room
    const selectedRoom = this.findBestRoom(candidates);
    
    if (!selectedRoom) {
      return this.handleNoAvailableRooms(requirements, timeSlot);
    }

    // Check for any conflicts
    const conflicts = this.detectPotentialConflicts(selectedRoom, requirements, timeSlot);
    
    // Calculate confidence based on suitability score and conflicts
    const candidate = candidates.find(c => c.room.id === selectedRoom.id);
    const confidence = this.calculateConfidence(candidate!, conflicts);
    
    // Record the allocation
    const slotKey = this.getSlotKey(selectedRoom.id, timeSlot);
    this.allocatedSlots.set(slotKey, requirements.courseId);
    this.tracker.updateUtilization(selectedRoom.id, timeSlot);
    
    // Get alternative rooms (top 3 other candidates)
    const alternativeRooms = candidates
      .filter(c => c.room.id !== selectedRoom.id)
      .sort((a, b) => b.suitabilityScore.overallScore - a.suitabilityScore.overallScore)
      .slice(0, 3)
      .map(c => c.room);

    const result: AllocationResult = {
      selectedRoom,
      confidence,
      alternativeRooms,
      conflicts,
      reasoning: this.generateReasoning(candidate!, conflicts),
    };

    this.allocationHistory.push(result);
    return result;
  }

  findBestRoom(candidates: RoomCandidate[]): Room | null {
    if (candidates.length === 0) {
      return null;
    }

    // Filter out unavailable rooms
    const availableCandidates = candidates.filter(c => c.isAvailable);
    
    if (availableCandidates.length === 0) {
      return null;
    }

    // Sort by combined score (suitability + utilization balance)
    const scoredCandidates = availableCandidates.map(candidate => {
      const suitabilityScore = candidate.suitabilityScore.overallScore;
      const utilizationScore = this.calculateUtilizationScore(candidate.currentUtilization);
      
      // Combine scores with weights
      const combinedScore = 
        (suitabilityScore * 0.7) + 
        (utilizationScore * 0.3);

      return {
        ...candidate,
        combinedScore,
      };
    });

    // Sort by combined score (highest first)
    scoredCandidates.sort((a, b) => b.combinedScore - a.combinedScore);
    
    return scoredCandidates[0].room;
  }

  handleNoAvailableRooms(requirements: CourseRequirements, timeSlot: TimeSlot): AllocationResult {
    const conflicts: AllocationConflict[] = [{
      type: 'room_unavailable',
      severity: 'high',
      description: 'No suitable rooms available for the requested time slot',
      suggestion: 'Consider alternative time slots or room modifications',
      affectedTimeSlot: timeSlot,
    }];

    return {
      selectedRoom: null,
      confidence: 0,
      alternativeRooms: [],
      conflicts,
      reasoning: 'No rooms available that meet the requirements for this time slot',
    };
  }

  generateMetrics(): AllocationMetrics {
    const utilizationStats = this.tracker.getUtilizationStats();
    const balance = this.tracker.getUtilizationBalance();
    
    // Calculate capacity efficiency
    const capacityEfficiency = new Map<string, number>();
    for (const result of this.allocationHistory) {
      if (result.selectedRoom) {
        const roomId = result.selectedRoom.id;
        // This would need course size data to calculate actual efficiency
        // For now, use a placeholder based on suitability scores
        capacityEfficiency.set(roomId, 75); // Placeholder
      }
    }

    // Calculate type match accuracy
    const typeMatches = this.allocationHistory.filter(result => 
      result.selectedRoom && result.conflicts.length === 0
    ).length;
    const typeMatchAccuracy = this.allocationHistory.length > 0 
      ? (typeMatches / this.allocationHistory.length) * 100 
      : 100;

    // Calculate facility match rate
    const facilityMatches = this.allocationHistory.filter(result => 
      result.selectedRoom && !result.conflicts.some(c => c.type === 'facility_missing')
    ).length;
    const facilityMatchRate = this.allocationHistory.length > 0 
      ? (facilityMatches / this.allocationHistory.length) * 100 
      : 100;

    // Calculate conflict rate
    const conflictedAllocations = this.allocationHistory.filter(result => 
      result.conflicts.length > 0
    ).length;
    const conflictRate = this.allocationHistory.length > 0 
      ? (conflictedAllocations / this.allocationHistory.length) * 100 
      : 0;

    // Calculate balance score
    const balanceScore = balance.isBalanced ? 100 - balance.standardDeviation : 50;

    return {
      roomUtilization: utilizationStats,
      capacityEfficiency,
      typeMatchAccuracy,
      facilityMatchRate,
      conflictRate,
      balanceScore,
      totalAllocations: this.allocationHistory.length,
      successfulAllocations: this.allocationHistory.filter(r => r.selectedRoom !== null).length,
    };
  }

  private evaluateRoomCandidates(rooms: Room[], requirements: CourseRequirements, timeSlot?: TimeSlot): RoomCandidate[] {
    return rooms.map(room => {
      const suitabilityScore = this.analyzer.evaluateRoomSuitability(room, requirements);
      const currentUtilization = this.tracker.getCurrentUtilization(room.id);
      // Check availability for specific time slot if provided
      const isAvailable = timeSlot ? !this.isRoomOccupied(room.id, timeSlot) : !this.isRoomOccupied(room.id);

      return {
        room,
        suitabilityScore,
        currentUtilization,
        isAvailable,
      };
    });
  }

  private isRoomOccupied(roomId: string, timeSlot?: TimeSlot): boolean {
    // Check if room is occupied during any time that would conflict
    if (timeSlot) {
      const slotKey = this.getSlotKey(roomId, timeSlot);
      return this.allocatedSlots.has(slotKey);
    }
    // Check if room has any allocations
    const keys = Array.from(this.allocatedSlots.keys());
    for (const key of keys) {
      if (key.startsWith(`${roomId}-`)) {
        return true;
      }
    }
    return false;
  }

  private detectPotentialConflicts(
    room: Room, 
    requirements: CourseRequirements, 
    timeSlot: TimeSlot
  ): AllocationConflict[] {
    const conflicts: AllocationConflict[] = [];

    // Check capacity mismatch
    if (room.capacity < requirements.expectedSize) {
      conflicts.push({
        type: 'capacity_mismatch',
        severity: 'high',
        description: `Room capacity (${room.capacity}) is less than expected class size (${requirements.expectedSize})`,
        suggestion: 'Consider a larger room or split the class',
        affectedTimeSlot: timeSlot,
      });
    } else if (room.capacity > requirements.expectedSize * 2.5) {
      conflicts.push({
        type: 'capacity_mismatch',
        severity: 'low',
        description: `Room capacity (${room.capacity}) is significantly larger than needed (${requirements.expectedSize})`,
        suggestion: 'Consider a smaller room for better utilization',
        affectedTimeSlot: timeSlot,
      });
    }

    // Check room type compatibility
    const roomType = room.type as RoomType;
    if (requirements.requiredRoomType.length > 0 && 
        !requirements.requiredRoomType.includes(roomType)) {
      // Check if it's a strict incompatibility (lab course in non-lab room)
      const needsLab = requirements.requiredRoomType.includes('lab');
      if (needsLab && roomType !== 'lab') {
        conflicts.push({
          type: 'type_incompatible',
          severity: 'high',
          description: `Course requires a lab room but ${room.name} is a ${roomType} room`,
          suggestion: 'Allocate to a laboratory room',
          affectedTimeSlot: timeSlot,
        });
      } else if (!needsLab) {
        conflicts.push({
          type: 'type_incompatible',
          severity: 'medium',
          description: `Room type (${roomType}) doesn't match preferred types (${requirements.requiredRoomType.join(', ')})`,
          suggestion: 'Consider rooms of the preferred type',
          affectedTimeSlot: timeSlot,
        });
      }
    }

    // Check facility requirements
    if (requirements.requiredFacilities.length > 0) {
      const roomFacilities = room.facilities || [];
      const missingFacilities = requirements.requiredFacilities.filter(
        req => !roomFacilities.some(fac => 
          fac.toLowerCase().includes(req.toLowerCase()) ||
          req.toLowerCase().includes(fac.toLowerCase())
        )
      );
      
      if (missingFacilities.length > 0) {
        conflicts.push({
          type: 'facility_missing',
          severity: missingFacilities.length > 1 ? 'high' : 'medium',
          description: `Room is missing required facilities: ${missingFacilities.join(', ')}`,
          suggestion: 'Find a room with the required facilities',
          affectedTimeSlot: timeSlot,
        });
      }
    }

    return conflicts;
  }

  private calculateConfidence(candidate: RoomCandidate, conflicts: AllocationConflict[]): number {
    let confidence = candidate.suitabilityScore.overallScore;

    // Reduce confidence based on conflicts
    for (const conflict of conflicts) {
      switch (conflict.severity) {
        case 'high':
          confidence -= 30;
          break;
        case 'medium':
          confidence -= 15;
          break;
        case 'low':
          confidence -= 5;
          break;
      }
    }

    // Boost confidence for good utilization balance
    const utilizationScore = this.calculateUtilizationScore(candidate.currentUtilization);
    confidence += (utilizationScore - 50) * 0.2; // Small boost/penalty for utilization

    return Math.max(0, Math.min(100, confidence));
  }

  private calculateUtilizationScore(utilization: number): number {
    // Score based on how well this allocation helps balance utilization
    const balance = this.tracker.getUtilizationBalance();
    
    if (utilization < balance.averageUtilization) {
      // Below average - good for balancing
      return 100 - (balance.averageUtilization - utilization);
    } else {
      // Above average - less ideal for balancing
      return Math.max(0, 100 - (utilization - balance.averageUtilization) * 2);
    }
  }

  private generateReasoning(candidate: RoomCandidate, conflicts: AllocationConflict[]): string {
    const reasons: string[] = [];
    
    const score = candidate.suitabilityScore;
    
    if (score.overallScore >= 80) {
      reasons.push('Excellent match for course requirements');
    } else if (score.overallScore >= 60) {
      reasons.push('Good match for course requirements');
    } else {
      reasons.push('Acceptable match with some compromises');
    }

    if (score.capacityScore >= 80) {
      reasons.push('optimal room capacity for class size');
    } else if (score.capacityScore >= 60) {
      reasons.push('adequate room capacity');
    } else {
      reasons.push('suboptimal capacity match');
    }

    if (candidate.currentUtilization < 50) {
      reasons.push('helps balance room utilization');
    } else if (candidate.currentUtilization > 80) {
      reasons.push('room is heavily utilized');
    }

    if (conflicts.length > 0) {
      reasons.push(`${conflicts.length} potential conflict(s) identified`);
    }

    return reasons.join(', ');
  }

  private getSlotKey(roomId: string, timeSlot: TimeSlot): string {
    return `${roomId}-${timeSlot.day}-${timeSlot.startTime}`;
  }

  // Reset the allocation state
  reset(): void {
    this.allocatedSlots.clear();
    this.allocationHistory = [];
    this.tracker.resetUtilization();
  }

  // Get current allocation state
  getAllocatedSlots(): Map<string, string> {
    return new Map(this.allocatedSlots);
  }

  // Check if a specific slot is available
  isSlotAvailable(roomId: string, timeSlot: TimeSlot): boolean {
    const slotKey = this.getSlotKey(roomId, timeSlot);
    return !this.allocatedSlots.has(slotKey);
  }
}