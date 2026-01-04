import type { 
  TimePreference, 
  RoomPreference, 
  SubjectPreference,
  FacultyPreferences,
  ValidationResult,
  ValidationError,
  ValidationWarning 
} from '@shared/faculty-preferences';
import type { Course, Room, Faculty } from '@shared/schema';
import { db } from './db';
import { courses, rooms, faculty } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  timeConflicts: TimeConflict[];
  resourceConflicts: ResourceConflict[];
  constraintViolations: ConstraintViolation[];
  suggestions: ConflictSuggestion[];
}

export interface TimeConflict {
  type: 'overlap' | 'unavailable' | 'overcommitment';
  description: string;
  conflictingPreferences: string[];
  severity: 'high' | 'medium' | 'low';
  affectedTimeSlots: Array<{
    day: string;
    startTime: string;
    endTime: string;
  }>;
}

export interface ResourceConflict {
  type: 'room_unavailable' | 'facility_missing' | 'capacity_insufficient';
  description: string;
  conflictingResources: string[];
  severity: 'high' | 'medium' | 'low';
  affectedRooms: string[];
}

export interface ConstraintViolation {
  type: 'hard_constraint' | 'soft_constraint' | 'business_rule';
  description: string;
  violatedConstraints: string[];
  severity: 'high' | 'medium' | 'low';
  recommendedAction: string;
}

export interface ConflictSuggestion {
  type: 'alternative_time' | 'alternative_room' | 'preference_adjustment';
  description: string;
  suggestedChanges: string[];
  impact: 'high' | 'medium' | 'low';
}

export class ConflictDetector {
  /**
   * Detect all types of conflicts for faculty preferences
   */
  async detectConflicts(
    facultyId: string,
    preferences: FacultyPreferences
  ): Promise<ConflictDetectionResult> {
    const timeConflicts = await this.detectTimeConflicts(facultyId, preferences.timePreferences);
    const resourceConflicts = await this.detectResourceConflicts(preferences.roomPreferences);
    const constraintViolations = await this.detectConstraintViolations(facultyId, preferences);
    const suggestions = this.generateConflictSuggestions(timeConflicts, resourceConflicts, constraintViolations);

    return {
      hasConflicts: timeConflicts.length > 0 || resourceConflicts.length > 0 || constraintViolations.length > 0,
      timeConflicts,
      resourceConflicts,
      constraintViolations,
      suggestions,
    };
  }

  /**
   * Detect time-related conflicts
   */
  private async detectTimeConflicts(
    facultyId: string,
    timePreferences: TimePreference[]
  ): Promise<TimeConflict[]> {
    const conflicts: TimeConflict[] = [];

    // Check for overlapping time preferences
    const overlaps = this.findOverlappingTimeSlots(timePreferences);
    overlaps.forEach(overlap => {
      conflicts.push({
        type: 'overlap',
        description: `Overlapping time preferences on ${overlap.day}`,
        conflictingPreferences: overlap.preferences,
        severity: 'medium',
        affectedTimeSlots: overlap.timeSlots,
      });
    });

    // Check for conflicts with existing commitments
    const existingCommitments = await this.getExistingCommitments(facultyId);
    const commitmentConflicts = this.findCommitmentConflicts(timePreferences, existingCommitments);
    conflicts.push(...commitmentConflicts);

    // Check for overcommitment (too many hours)
    const overcommitment = await this.checkOvercommitment(facultyId, timePreferences);
    if (overcommitment) {
      conflicts.push(overcommitment);
    }

    return conflicts;
  }

  /**
   * Detect resource-related conflicts
   */
  private async detectResourceConflicts(
    roomPreferences: RoomPreference[]
  ): Promise<ResourceConflict[]> {
    const conflicts: ResourceConflict[] = [];

    for (const preference of roomPreferences) {
      // Check if specific room exists and is available
      if (preference.roomId) {
        const room = await db.select().from(rooms).where(eq(rooms.id, preference.roomId)).limit(1);
        if (room.length === 0) {
          conflicts.push({
            type: 'room_unavailable',
            description: `Preferred room ${preference.roomId} does not exist`,
            conflictingResources: [preference.roomId],
            severity: 'high',
            affectedRooms: [preference.roomId],
          });
        }
      }

      // Check if required facilities are available
      if (preference.facilities && preference.facilities.length > 0) {
        const facilityConflicts = await this.checkFacilityAvailability(preference);
        conflicts.push(...facilityConflicts);
      }

      // Check room type compatibility
      if (preference.roomType) {
        const typeConflicts = await this.checkRoomTypeAvailability(preference);
        conflicts.push(...typeConflicts);
      }
    }

    return conflicts;
  }

  /**
   * Detect constraint violations
   */
  private async detectConstraintViolations(
    facultyId: string,
    preferences: FacultyPreferences
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    // Check hard time constraints
    const hardTimeViolations = this.checkHardTimeConstraints(preferences.timePreferences);
    violations.push(...hardTimeViolations);

    // Check subject expertise constraints
    const expertiseViolations = await this.checkSubjectExpertiseConstraints(
      facultyId,
      preferences.subjectPreferences
    );
    violations.push(...expertiseViolations);

    // Check workload constraints
    const workloadViolations = await this.checkWorkloadConstraints(facultyId, preferences);
    violations.push(...workloadViolations);

    return violations;
  }

  /**
   * Find overlapping time slots within preferences
   */
  private findOverlappingTimeSlots(timePreferences: TimePreference[]): Array<{
    day: string;
    preferences: string[];
    timeSlots: Array<{ day: string; startTime: string; endTime: string }>;
  }> {
    const overlaps: Array<{
      day: string;
      preferences: string[];
      timeSlots: Array<{ day: string; startTime: string; endTime: string }>;
    }> = [];

    const groupedByDay = timePreferences.reduce((acc, pref, index) => {
      if (!acc[pref.day]) acc[pref.day] = [];
      acc[pref.day].push({ ...pref, index });
      return acc;
    }, {} as Record<string, Array<TimePreference & { index: number }>>);

    Object.entries(groupedByDay).forEach(([day, prefs]) => {
      for (let i = 0; i < prefs.length; i++) {
        for (let j = i + 1; j < prefs.length; j++) {
          const pref1 = prefs[i];
          const pref2 = prefs[j];

          if (this.timeRangesOverlap(
            pref1.startTime, pref1.endTime,
            pref2.startTime, pref2.endTime
          )) {
            overlaps.push({
              day,
              preferences: [`Preference ${pref1.index + 1}`, `Preference ${pref2.index + 1}`],
              timeSlots: [
                { day, startTime: pref1.startTime, endTime: pref1.endTime },
                { day, startTime: pref2.startTime, endTime: pref2.endTime },
              ],
            });
          }
        }
      }
    });

    return overlaps;
  }

  /**
   * Check if two time ranges overlap
   */
  private timeRangesOverlap(
    start1: string, end1: string,
    start2: string, end2: string
  ): boolean {
    return start1 < end2 && start2 < end1;
  }

  /**
   * Get existing commitments for faculty member
   */
  private async getExistingCommitments(facultyId: string): Promise<Array<{
    day: string;
    startTime: string;
    endTime: string;
    type: string;
    description: string;
  }>> {
    // This would typically query the timetable/schedule database
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Find conflicts with existing commitments
   */
  private findCommitmentConflicts(
    timePreferences: TimePreference[],
    existingCommitments: Array<{
      day: string;
      startTime: string;
      endTime: string;
      type: string;
      description: string;
    }>
  ): TimeConflict[] {
    const conflicts: TimeConflict[] = [];

    timePreferences.forEach((pref, index) => {
      existingCommitments.forEach(commitment => {
        if (pref.day === commitment.day &&
            this.timeRangesOverlap(
              pref.startTime, pref.endTime,
              commitment.startTime, commitment.endTime
            )) {
          conflicts.push({
            type: 'unavailable',
            description: `Time preference conflicts with existing ${commitment.type}: ${commitment.description}`,
            conflictingPreferences: [`Preference ${index + 1}`],
            severity: pref.isHardConstraint ? 'high' : 'medium',
            affectedTimeSlots: [{
              day: pref.day,
              startTime: pref.startTime,
              endTime: pref.endTime,
            }],
          });
        }
      });
    });

    return conflicts;
  }

  /**
   * Check for overcommitment based on faculty max hours
   */
  private async checkOvercommitment(
    facultyId: string,
    timePreferences: TimePreference[]
  ): Promise<TimeConflict | null> {
    const facultyMember = await db.select().from(faculty).where(eq(faculty.id, facultyId)).limit(1);
    if (facultyMember.length === 0) return null;

    const maxHours = facultyMember[0].maxHoursPerWeek;
    const preferredHours = this.calculateTotalPreferredHours(timePreferences);

    if (preferredHours > maxHours) {
      return {
        type: 'overcommitment',
        description: `Total preferred hours (${preferredHours}) exceeds maximum allowed (${maxHours})`,
        conflictingPreferences: ['All time preferences'],
        severity: 'high',
        affectedTimeSlots: timePreferences.map(pref => ({
          day: pref.day,
          startTime: pref.startTime,
          endTime: pref.endTime,
        })),
      };
    }

    return null;
  }

  /**
   * Calculate total hours from time preferences
   */
  private calculateTotalPreferredHours(timePreferences: TimePreference[]): number {
    return timePreferences.reduce((total, pref) => {
      const start = new Date(`2000-01-01T${pref.startTime}`);
      const end = new Date(`2000-01-01T${pref.endTime}`);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return total + hours;
    }, 0);
  }

  /**
   * Check facility availability for room preferences
   */
  private async checkFacilityAvailability(
    preference: RoomPreference
  ): Promise<ResourceConflict[]> {
    const conflicts: ResourceConflict[] = [];

    if (!preference.facilities || preference.facilities.length === 0) {
      return conflicts;
    }

    // Query rooms that have the required facilities
    const availableRooms = await db.select().from(rooms);
    const roomsWithFacilities = availableRooms.filter(room => {
      const roomFacilities = room.facilities || [];
      return preference.facilities!.every(facility => 
        roomFacilities.includes(facility)
      );
    });

    if (roomsWithFacilities.length === 0) {
      conflicts.push({
        type: 'facility_missing',
        description: `No rooms available with required facilities: ${preference.facilities.join(', ')}`,
        conflictingResources: preference.facilities,
        severity: 'medium',
        affectedRooms: [],
      });
    }

    return conflicts;
  }

  /**
   * Check room type availability
   */
  private async checkRoomTypeAvailability(
    preference: RoomPreference
  ): Promise<ResourceConflict[]> {
    const conflicts: ResourceConflict[] = [];

    if (!preference.roomType) return conflicts;

    const availableRooms = await db.select().from(rooms).where(eq(rooms.type, preference.roomType));
    
    if (availableRooms.length === 0) {
      conflicts.push({
        type: 'room_unavailable',
        description: `No rooms available of type: ${preference.roomType}`,
        conflictingResources: [preference.roomType],
        severity: 'medium',
        affectedRooms: [],
      });
    }

    return conflicts;
  }

  /**
   * Check hard time constraints
   */
  private checkHardTimeConstraints(timePreferences: TimePreference[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    const hardConstraints = timePreferences.filter(pref => pref.isHardConstraint);
    
    // Check for conflicting hard constraints
    const overlappingHardConstraints = this.findOverlappingTimeSlots(hardConstraints);
    
    overlappingHardConstraints.forEach(overlap => {
      violations.push({
        type: 'hard_constraint',
        description: `Conflicting hard time constraints on ${overlap.day}`,
        violatedConstraints: overlap.preferences,
        severity: 'high',
        recommendedAction: 'Remove or modify one of the conflicting hard constraints',
      });
    });

    return violations;
  }

  /**
   * Check subject expertise constraints
   */
  private async checkSubjectExpertiseConstraints(
    facultyId: string,
    subjectPreferences: SubjectPreference[]
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    for (const pref of subjectPreferences) {
      // Check if course exists
      const course = await db.select().from(courses).where(eq(courses.code, pref.courseCode)).limit(1);
      
      if (course.length === 0) {
        violations.push({
          type: 'business_rule',
          description: `Course ${pref.courseCode} does not exist`,
          violatedConstraints: [pref.courseCode],
          severity: 'high',
          recommendedAction: 'Remove invalid course or verify course code',
        });
      }

      // Check expertise level appropriateness
      if (pref.expertiseLevel === 'basic' && pref.priority === 'high') {
        violations.push({
          type: 'soft_constraint',
          description: `High priority preference for ${pref.courseCode} with basic expertise level`,
          violatedConstraints: [pref.courseCode],
          severity: 'low',
          recommendedAction: 'Consider increasing expertise level or lowering priority',
        });
      }
    }

    return violations;
  }

  /**
   * Check workload constraints
   */
  private async checkWorkloadConstraints(
    facultyId: string,
    preferences: FacultyPreferences
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    const facultyMember = await db.select().from(faculty).where(eq(faculty.id, facultyId)).limit(1);
    if (facultyMember.length === 0) return violations;

    const maxHours = facultyMember[0].maxHoursPerWeek;
    const totalPreferredHours = this.calculateTotalPreferredHours(preferences.timePreferences);

    // Check if preferences exceed capacity
    if (totalPreferredHours > maxHours * 1.2) { // 20% buffer
      violations.push({
        type: 'business_rule',
        description: `Total preferred hours (${totalPreferredHours}) significantly exceeds capacity (${maxHours})`,
        violatedConstraints: ['workload_limit'],
        severity: 'medium',
        recommendedAction: 'Reduce time preferences or increase maximum hours per week',
      });
    }

    return violations;
  }

  /**
   * Generate suggestions to resolve conflicts
   */
  private generateConflictSuggestions(
    timeConflicts: TimeConflict[],
    resourceConflicts: ResourceConflict[],
    constraintViolations: ConstraintViolation[]
  ): ConflictSuggestion[] {
    const suggestions: ConflictSuggestion[] = [];

    // Suggestions for time conflicts
    timeConflicts.forEach(conflict => {
      if (conflict.type === 'overlap') {
        suggestions.push({
          type: 'alternative_time',
          description: 'Adjust overlapping time preferences to avoid conflicts',
          suggestedChanges: [
            'Modify one of the conflicting time slots',
            'Split the overlapping period between preferences',
            'Consider alternative days for one preference',
          ],
          impact: 'medium',
        });
      }
    });

    // Suggestions for resource conflicts
    resourceConflicts.forEach(conflict => {
      if (conflict.type === 'facility_missing') {
        suggestions.push({
          type: 'alternative_room',
          description: 'Consider rooms with different facility combinations',
          suggestedChanges: [
            'Review facility requirements and prioritize essential ones',
            'Look for rooms in different buildings',
            'Consider portable equipment as alternatives',
          ],
          impact: 'low',
        });
      }
    });

    // Suggestions for constraint violations
    constraintViolations.forEach(violation => {
      if (violation.type === 'hard_constraint') {
        suggestions.push({
          type: 'preference_adjustment',
          description: 'Resolve conflicting hard constraints',
          suggestedChanges: [
            'Convert some hard constraints to soft preferences',
            'Adjust time slots to eliminate overlaps',
            'Prioritize the most important constraints',
          ],
          impact: 'high',
        });
      }
    });

    return suggestions;
  }
}

// Export singleton instance
export const conflictDetector = new ConflictDetector();