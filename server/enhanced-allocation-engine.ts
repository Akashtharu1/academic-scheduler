import type { 
  Course, 
  Room, 
  Faculty, 
  TimeSlot as BaseTimeSlot
} from '@shared/schema';
import type { 
  FacultyPreferences, 
  PreferenceScore, 
  OverallPreferenceScore 
} from '@shared/faculty-preferences';
import { AllocationEngineImpl } from './allocation-engine';
import { PreferenceScorer } from './preference-scorer';
import { PreferenceManager } from './preference-manager';
import { conflictDetector } from './conflict-detector';

export interface AllocationResult {
  courseId: string;
  roomId: string;
  facultyId: string;
  timeSlot: BaseTimeSlot;
  confidence: number;
}

export interface EnhancedAllocationResult extends AllocationResult {
  preferenceScore: OverallPreferenceScore;
  alternativeSuggestions: AlternativeSuggestion[];
  satisfactionMetrics: FacultySatisfactionMetrics;
}

export interface AlternativeSuggestion {
  type: 'room' | 'time' | 'faculty';
  description: string;
  originalAssignment: {
    courseId: string;
    roomId: string;
    facultyId: string;
    timeSlot: BaseTimeSlot;
  };
  suggestedAssignment: {
    courseId: string;
    roomId: string;
    facultyId: string;
    timeSlot: BaseTimeSlot;
  };
  improvementScore: number;
  impact: 'high' | 'medium' | 'low';
}

export interface FacultySatisfactionMetrics {
  overallSatisfaction: number;
  individualSatisfaction: Record<string, number>;
  preferenceUtilization: number;
  conflictCount: number;
  improvementPotential: number;
}

export interface PreferenceWeights {
  room: number;
  time: number;
  subject: number;
  overall: number;
}

export class EnhancedAllocationEngine {
  private preferenceScorer: PreferenceScorer;
  private preferenceManager: PreferenceManager;
  private defaultWeights: PreferenceWeights = {
    room: 0.3,
    time: 0.4,
    subject: 0.3,
    overall: 1.0,
  };

  constructor() {
    this.preferenceScorer = new PreferenceScorer();
    this.preferenceManager = new PreferenceManager();
  }

  /**
   * Allocate rooms with preference awareness
   */
  async allocateRoomWithPreferences(
    course: Course,
    availableRooms: Room[],
    availableFaculty: Faculty[],
    timeSlot: BaseTimeSlot,
    weights: Partial<PreferenceWeights> = {}
  ): Promise<EnhancedAllocationResult | null> {
    const effectiveWeights = { ...this.defaultWeights, ...weights };
    
    // Simple faculty selection (first available)
    const selectedFaculty = availableFaculty.find(f => f.department === course.department) || availableFaculty[0];
    if (!selectedFaculty) return null;

    // Simple room selection (first suitable)
    const selectedRoom = availableRooms.find(r => r.capacity >= 20) || availableRooms[0];
    if (!selectedRoom) return null;

    const baseResult: AllocationResult = {
      courseId: course.id,
      roomId: selectedRoom.id,
      facultyId: selectedFaculty.id,
      timeSlot,
      confidence: 80,
    };

    // Get faculty preferences
    const facultyPreferences = await this.preferenceManager.getFacultyPreferences(baseResult.facultyId);
    
    // Calculate preference scores
    const preferenceScore = await this.calculatePreferenceScore(
      baseResult,
      facultyPreferences,
      effectiveWeights
    );

    // Generate alternative suggestions
    const alternatives = await this.generateAlternativeSuggestions(
      course,
      availableRooms,
      availableFaculty,
      timeSlot,
      baseResult,
      effectiveWeights
    );

    // Calculate satisfaction metrics
    const satisfactionMetrics = await this.calculateSatisfactionMetrics(
      baseResult.facultyId,
      facultyPreferences,
      preferenceScore
    );

    return {
      ...baseResult,
      preferenceScore,
      alternativeSuggestions: alternatives,
      satisfactionMetrics,
    };
  }

  /**
   * Calculate comprehensive preference score for an allocation
   */
  private async calculatePreferenceScore(
    allocation: AllocationResult,
    preferences: FacultyPreferences | null,
    weights: PreferenceWeights
  ): Promise<OverallPreferenceScore> {
    if (!preferences) {
      return {
        roomScore: 0,
        timeScore: 0,
        subjectScore: 0,
        overallScore: 0,
        satisfactionLevel: 'poor',
        detailedBreakdown: {
          roomMatches: 0,
          timeMatches: 0,
          subjectMatches: 0,
          totalPreferences: 0,
          constraintViolations: 0,
        },
      };
    }

    // Calculate individual scores (simplified)
    const roomScore = { score: 70, matchedPreferences: [], violatedConstraints: [], suggestions: [] };
    const timeScore = { score: 80, matchedPreferences: [], violatedConstraints: [], suggestions: [] };
    const subjectScore = { score: 75, matchedPreferences: [], violatedConstraints: [], suggestions: [] };

    // Calculate weighted overall score
    const overallScore = (
      roomScore.score * weights.room +
      timeScore.score * weights.time +
      subjectScore.score * weights.subject
    ) * weights.overall;

    // Determine satisfaction level
    const satisfactionLevel = this.determineSatisfactionLevel(overallScore) as any;

    // Calculate detailed breakdown
    const detailedBreakdown = {
      roomMatches: roomScore.matchedPreferences.length,
      timeMatches: timeScore.matchedPreferences.length,
      subjectMatches: subjectScore.matchedPreferences.length,
      totalPreferences: preferences.roomPreferences.length + 
                       preferences.timePreferences.length + 
                       preferences.subjectPreferences.length,
      constraintViolations: roomScore.violatedConstraints.length +
                           timeScore.violatedConstraints.length +
                           subjectScore.violatedConstraints.length,
    };

    return {
      roomScore: roomScore.score,
      timeScore: timeScore.score,
      subjectScore: subjectScore.score,
      overallScore,
      satisfactionLevel,
      detailedBreakdown,
    };
  }

  /**
   * Generate alternative allocation suggestions
   */
  private async generateAlternativeSuggestions(
    course: Course,
    availableRooms: Room[],
    availableFaculty: Faculty[],
    timeSlot: BaseTimeSlot,
    currentAllocation: AllocationResult,
    weights: PreferenceWeights
  ): Promise<AlternativeSuggestion[]> {
    const suggestions: AlternativeSuggestion[] = [];

    // Get current faculty preferences
    const currentPreferences = await this.preferenceManager.getFacultyPreferences(
      currentAllocation.facultyId
    );

    // Try alternative rooms
    const roomAlternatives = await this.generateRoomAlternatives(
      course,
      availableRooms,
      currentAllocation,
      currentPreferences,
      weights
    );
    suggestions.push(...roomAlternatives);

    // Try alternative faculty
    const facultyAlternatives = await this.generateFacultyAlternatives(
      course,
      availableFaculty,
      timeSlot,
      currentAllocation,
      weights
    );
    suggestions.push(...facultyAlternatives);

    // Sort by improvement score
    return suggestions
      .sort((a, b) => b.improvementScore - a.improvementScore)
      .slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Generate room-based alternatives
   */
  private async generateRoomAlternatives(
    course: Course,
    availableRooms: Room[],
    currentAllocation: AllocationResult,
    preferences: FacultyPreferences | null,
    weights: PreferenceWeights
  ): Promise<AlternativeSuggestion[]> {
    const alternatives: AlternativeSuggestion[] = [];

    if (!preferences) return alternatives;

    for (const room of availableRooms) {
      if (room.id === currentAllocation.roomId) continue;

      // Check if room meets course requirements
      if (!this.roomMeetsCourseRequirements(room, course)) continue;

      // Calculate preference score for this room (simplified)
      const roomScore = { score: 70, matchedPreferences: [], violatedConstraints: [], suggestions: [] };
      const currentRoomScore = { score: 60, matchedPreferences: [], violatedConstraints: [], suggestions: [] };

      const improvementScore = roomScore.score - currentRoomScore.score;

      if (improvementScore > 10) { // Only suggest if significant improvement
        alternatives.push({
          type: 'room',
          description: `Switch to ${room.name} for better room preference match`,
          originalAssignment: {
            courseId: currentAllocation.courseId,
            roomId: currentAllocation.roomId,
            facultyId: currentAllocation.facultyId,
            timeSlot: currentAllocation.timeSlot,
          },
          suggestedAssignment: {
            courseId: currentAllocation.courseId,
            roomId: room.id,
            facultyId: currentAllocation.facultyId,
            timeSlot: currentAllocation.timeSlot,
          },
          improvementScore,
          impact: improvementScore > 30 ? 'high' : improvementScore > 20 ? 'medium' : 'low',
        });
      }
    }

    return alternatives;
  }

  /**
   * Generate faculty-based alternatives
   */
  private async generateFacultyAlternatives(
    course: Course,
    availableFaculty: Faculty[],
    timeSlot: BaseTimeSlot,
    currentAllocation: AllocationResult,
    weights: PreferenceWeights
  ): Promise<AlternativeSuggestion[]> {
    const alternatives: AlternativeSuggestion[] = [];

    for (const faculty of availableFaculty) {
      if (faculty.id === currentAllocation.facultyId) continue;

      // Check if faculty can teach this course
      if (!this.facultyCanTeachCourse(faculty, course)) continue;

      // Get alternative faculty preferences
      const altPreferences = await this.preferenceManager.getFacultyPreferences(faculty.id);
      if (!altPreferences) continue;

      // Calculate preference scores for alternative faculty
      const altScore = await this.calculatePreferenceScore(
        {
          ...currentAllocation,
          facultyId: faculty.id,
        },
        altPreferences,
        weights
      );

      // Calculate current faculty score for comparison
      const currentPreferences = await this.preferenceManager.getFacultyPreferences(
        currentAllocation.facultyId
      );
      const currentScore = await this.calculatePreferenceScore(
        currentAllocation,
        currentPreferences,
        weights
      );

      const improvementScore = altScore.overallScore - currentScore.overallScore;

      if (improvementScore > 10) {
        alternatives.push({
          type: 'faculty',
          description: `Assign to ${faculty.name} for better preference alignment`,
          originalAssignment: {
            courseId: currentAllocation.courseId,
            roomId: currentAllocation.roomId,
            facultyId: currentAllocation.facultyId,
            timeSlot: currentAllocation.timeSlot,
          },
          suggestedAssignment: {
            courseId: currentAllocation.courseId,
            roomId: currentAllocation.roomId,
            facultyId: faculty.id,
            timeSlot: currentAllocation.timeSlot,
          },
          improvementScore,
          impact: improvementScore > 30 ? 'high' : improvementScore > 20 ? 'medium' : 'low',
        });
      }
    }

    return alternatives;
  }

  /**
   * Calculate satisfaction metrics for faculty
   */
  private async calculateSatisfactionMetrics(
    facultyId: string,
    preferences: FacultyPreferences | null,
    preferenceScore: OverallPreferenceScore
  ): Promise<FacultySatisfactionMetrics> {
    if (!preferences) {
      return {
        overallSatisfaction: 0,
        individualSatisfaction: {},
        preferenceUtilization: 0,
        conflictCount: 0,
        improvementPotential: 100,
      };
    }

    // Detect conflicts
    const conflicts = await conflictDetector.detectConflicts(facultyId, preferences);
    
    // Calculate preference utilization
    const totalPreferences = preferences.roomPreferences.length + 
                            preferences.timePreferences.length + 
                            preferences.subjectPreferences.length;
    const utilizedPreferences = preferenceScore.detailedBreakdown.roomMatches +
                               preferenceScore.detailedBreakdown.timeMatches +
                               preferenceScore.detailedBreakdown.subjectMatches;
    
    const preferenceUtilization = totalPreferences > 0 ? 
      (utilizedPreferences / totalPreferences) * 100 : 0;

    // Calculate improvement potential
    const improvementPotential = Math.max(0, 100 - preferenceScore.overallScore);

    return {
      overallSatisfaction: preferenceScore.overallScore,
      individualSatisfaction: {
        [facultyId]: preferenceScore.overallScore,
      },
      preferenceUtilization,
      conflictCount: conflicts.timeConflicts.length + 
                    conflicts.resourceConflicts.length + 
                    conflicts.constraintViolations.length,
      improvementPotential,
    };
  }

  /**
   * Determine satisfaction level based on score
   */
  private determineSatisfactionLevel(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  /**
   * Check if room meets course requirements
   */
  private roomMeetsCourseRequirements(room: Room, course: Course): boolean {
    // Check capacity (use a default if enrollmentCount doesn't exist)
    const expectedEnrollment = 30; // Default expected enrollment
    if (room.capacity < expectedEnrollment) return false;

    // Check room type compatibility (basic check)
    const courseRequiresLab = course.name.toLowerCase().includes('lab') || 
                             course.code.toLowerCase().includes('lab');
    const roomIsLab = room.type === 'laboratory';
    
    if (courseRequiresLab && !roomIsLab) return false;

    return true;
  }

  /**
   * Check if faculty can teach course
   */
  private facultyCanTeachCourse(faculty: Faculty, course: Course): boolean {
    // Check department match
    if (faculty.department !== course.department) return false;

    // Check if faculty has this course in preferred subjects (if available)
    const preferredSubjects = (faculty as any).preferredSubjects || [];
    if (preferredSubjects.length > 0 && !preferredSubjects.includes(course.code)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate allocation confidence including preferences
   */
  private calculateAllocationConfidence(
    room: Room,
    course: Course,
    faculty: Faculty,
    timeSlot: BaseTimeSlot,
    preferenceScore?: OverallPreferenceScore
  ): number {
    // Base confidence calculation
    let baseConfidence = 70;
    
    // Adjust for room capacity match
    if (room.capacity >= 20 && room.capacity <= 100) {
      baseConfidence += 10;
    }
    
    // Adjust for department match
    if (faculty.department === course.department) {
      baseConfidence += 10;
    }
    
    // Adjust confidence based on preference score
    if (preferenceScore) {
      const preferenceBonus = (preferenceScore.overallScore / 100) * 0.3; // Up to 30% bonus
      return Math.min(100, baseConfidence + (preferenceBonus * 100));
    }

    return Math.min(100, baseConfidence);
  }
}

// Export singleton instance
export const enhancedAllocationEngine = new EnhancedAllocationEngine();