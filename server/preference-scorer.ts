import {
  FacultyPreferences,
  RoomPreference,
  TimePreference,
  SubjectPreference,
  PreferenceScore,
  OverallPreferenceScore,
  PreferenceBreakdown,
  SatisfactionLevel,
} from "@shared/faculty-preferences";
import { Room, Course, TimeSlot, RoomType, DayOfWeek } from "@shared/schema";

export interface RoomAssignment {
  room: Room;
  course: Course;
  timeSlot: TimeSlot;
}

export interface TimeAssignment {
  timeSlot: TimeSlot;
  course: Course;
}

export interface SubjectAssignment {
  course: Course;
  facultyId: string;
}

export interface FullAssignment {
  room: Room;
  course: Course;
  timeSlot: TimeSlot;
  facultyId: string;
}

export class PreferenceScorer {
  /**
   * Calculate room preference score for an assignment
   */
  calculateRoomPreferenceScore(
    assignment: RoomAssignment,
    preferences: FacultyPreferences
  ): PreferenceScore {
    const { room } = assignment;
    const roomPreferences = preferences.roomPreferences;
    
    if (roomPreferences.length === 0) {
      return {
        score: 50, // Neutral score when no preferences
        matchedPreferences: [],
        violatedConstraints: [],
        suggestions: ["Consider setting room preferences for better allocation"],
      };
    }

    let bestScore = 0;
    const matchedPreferences: string[] = [];
    const violatedConstraints: string[] = [];
    const suggestions: string[] = [];

    for (const pref of roomPreferences) {
      let prefScore = 0;
      let matches = false;

      // Check specific room match
      if (pref.roomId && pref.roomId === room.id) {
        prefScore = 100;
        matches = true;
        matchedPreferences.push(`Specific room match: ${room.name}`);
      }
      // Check room type match
      else if (pref.roomType && pref.roomType === room.type) {
        prefScore = 80;
        matches = true;
        matchedPreferences.push(`Room type match: ${room.type}`);
      }
      // Check building match
      else if (pref.building && pref.building === room.building) {
        prefScore = 60;
        matches = true;
        matchedPreferences.push(`Building match: ${room.building}`);
      }
      // Check facility matches
      else if (pref.facilities && pref.facilities.length > 0) {
        const roomFacilities = room.facilities || [];
        const matchedFacilities = pref.facilities.filter(f => roomFacilities.includes(f));
        
        if (matchedFacilities.length > 0) {
          prefScore = (matchedFacilities.length / pref.facilities.length) * 70;
          matches = true;
          matchedPreferences.push(`Facility matches: ${matchedFacilities.join(', ')}`);
        }
      }

      // Apply preference weight and priority
      if (matches) {
        const weightMultiplier = pref.weight / 100;
        const priorityMultiplier = this.getPriorityMultiplier(pref.priority);
        prefScore = prefScore * weightMultiplier * priorityMultiplier;
        bestScore = Math.max(bestScore, prefScore);
      }
    }

    // Check for constraint violations
    for (const pref of roomPreferences) {
      if (pref.roomType && pref.roomType !== room.type && pref.priority === 'high') {
        violatedConstraints.push(`High priority room type preference (${pref.roomType}) not met`);
      }
    }

    // Generate suggestions
    if (bestScore < 50) {
      suggestions.push("Consider updating room preferences to better match available rooms");
    }
    if (violatedConstraints.length > 0) {
      suggestions.push("Some high-priority room preferences could not be satisfied");
    }

    return {
      score: Math.min(100, bestScore),
      matchedPreferences,
      violatedConstraints,
      suggestions,
    };
  }

  /**
   * Calculate time preference score for an assignment
   */
  calculateTimePreferenceScore(
    assignment: TimeAssignment,
    preferences: FacultyPreferences
  ): PreferenceScore {
    const { timeSlot } = assignment;
    const timePreferences = preferences.timePreferences;
    
    if (timePreferences.length === 0) {
      return {
        score: 50, // Neutral score when no preferences
        matchedPreferences: [],
        violatedConstraints: [],
        suggestions: ["Consider setting time preferences for better scheduling"],
      };
    }

    let bestScore = 0;
    const matchedPreferences: string[] = [];
    const violatedConstraints: string[] = [];
    const suggestions: string[] = [];

    for (const pref of timePreferences) {
      let prefScore = 0;
      let matches = false;

      // Check if assignment time falls within preferred time
      if (pref.day === timeSlot.day) {
        const prefStart = new Date(`1970-01-01T${pref.startTime}:00`);
        const prefEnd = new Date(`1970-01-01T${pref.endTime}:00`);
        const slotStart = new Date(`1970-01-01T${timeSlot.startTime}:00`);
        const slotEnd = new Date(`1970-01-01T${timeSlot.endTime}:00`);

        // Check for exact match
        if (pref.startTime === timeSlot.startTime && pref.endTime === timeSlot.endTime) {
          prefScore = 100;
          matches = true;
          matchedPreferences.push(`Exact time match: ${pref.day} ${pref.startTime}-${pref.endTime}`);
        }
        // Check for overlap
        else if (slotStart < prefEnd && slotEnd > prefStart) {
          const overlapStart = new Date(Math.max(prefStart.getTime(), slotStart.getTime()));
          const overlapEnd = new Date(Math.min(prefEnd.getTime(), slotEnd.getTime()));
          const overlapDuration = overlapEnd.getTime() - overlapStart.getTime();
          const slotDuration = slotEnd.getTime() - slotStart.getTime();
          
          prefScore = (overlapDuration / slotDuration) * 80;
          matches = true;
          matchedPreferences.push(`Partial time overlap: ${pref.day} ${pref.startTime}-${pref.endTime}`);
        }
      }

      // Apply preference weight and priority
      if (matches) {
        const weightMultiplier = pref.weight / 100;
        const priorityMultiplier = this.getPriorityMultiplier(pref.priority);
        prefScore = prefScore * weightMultiplier * priorityMultiplier;
        bestScore = Math.max(bestScore, prefScore);
      }

      // Check for hard constraint violations
      if (pref.isHardConstraint && !matches && pref.day === timeSlot.day) {
        violatedConstraints.push(`Hard time constraint violated: ${pref.day} ${pref.startTime}-${pref.endTime}`);
      }
    }

    // Generate suggestions
    if (bestScore < 30) {
      suggestions.push("Time slot doesn't align well with preferences");
    }
    if (violatedConstraints.length > 0) {
      suggestions.push("Hard time constraints were violated - consider alternative time slots");
    }

    return {
      score: Math.min(100, bestScore),
      matchedPreferences,
      violatedConstraints,
      suggestions,
    };
  }

  /**
   * Calculate subject preference score for an assignment
   */
  calculateSubjectPreferenceScore(
    assignment: SubjectAssignment,
    preferences: FacultyPreferences
  ): PreferenceScore {
    const { course } = assignment;
    const subjectPreferences = preferences.subjectPreferences;
    
    if (subjectPreferences.length === 0) {
      return {
        score: 50, // Neutral score when no preferences
        matchedPreferences: [],
        violatedConstraints: [],
        suggestions: ["Consider setting subject preferences for courses you'd like to teach"],
      };
    }

    let bestScore = 0;
    const matchedPreferences: string[] = [];
    const violatedConstraints: string[] = [];
    const suggestions: string[] = [];

    // Find matching subject preference
    const matchingPref = subjectPreferences.find(pref => pref.courseCode === course.code);
    
    if (matchingPref) {
      // Calculate score based on expertise level
      let expertiseScore = 0;
      switch (matchingPref.expertiseLevel) {
        case 'expert':
          expertiseScore = 100;
          break;
        case 'proficient':
          expertiseScore = 80;
          break;
        case 'basic':
          expertiseScore = 60;
          break;
        case 'willing':
          expertiseScore = 40;
          break;
      }

      // Apply preference weight and priority
      const weightMultiplier = matchingPref.weight / 100;
      const priorityMultiplier = this.getPriorityMultiplier(matchingPref.priority);
      bestScore = expertiseScore * weightMultiplier * priorityMultiplier;

      matchedPreferences.push(
        `Course preference match: ${course.code} (${matchingPref.expertiseLevel} level, ${matchingPref.priority} priority)`
      );

      // Check for potential issues
      if (matchingPref.expertiseLevel === 'basic' && matchingPref.priority === 'high') {
        suggestions.push("Consider additional preparation for this high-priority course with basic expertise");
      }
    } else {
      // No specific preference for this course
      bestScore = 30; // Low but not zero score for unspecified courses
      suggestions.push(`No specific preference set for course ${course.code}`);
    }

    return {
      score: Math.min(100, bestScore),
      matchedPreferences,
      violatedConstraints,
      suggestions,
    };
  }

  /**
   * Calculate overall preference score for a complete assignment
   */
  calculateOverallPreferenceScore(
    assignment: FullAssignment,
    preferences: FacultyPreferences
  ): OverallPreferenceScore {
    // Calculate individual scores
    const roomScore = this.calculateRoomPreferenceScore(
      { room: assignment.room, course: assignment.course, timeSlot: assignment.timeSlot },
      preferences
    );

    const timeScore = this.calculateTimePreferenceScore(
      { timeSlot: assignment.timeSlot, course: assignment.course },
      preferences
    );

    const subjectScore = this.calculateSubjectPreferenceScore(
      { course: assignment.course, facultyId: assignment.facultyId },
      preferences
    );

    // Calculate weighted overall score
    const roomWeight = 0.3;
    const timeWeight = 0.4;
    const subjectWeight = 0.3;

    const overallScore = 
      (roomScore.score * roomWeight) +
      (timeScore.score * timeWeight) +
      (subjectScore.score * subjectWeight);

    // Determine satisfaction level
    const satisfactionLevel = this.getSatisfactionLevel(overallScore);

    // Create detailed breakdown
    const detailedBreakdown: PreferenceBreakdown = {
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
      overallScore: Math.round(overallScore),
      satisfactionLevel,
      detailedBreakdown,
    };
  }

  /**
   * Get priority multiplier for scoring
   */
  private getPriorityMultiplier(priority: 'high' | 'medium' | 'low'): number {
    switch (priority) {
      case 'high':
        return 1.2;
      case 'medium':
        return 1.0;
      case 'low':
        return 0.8;
      default:
        return 1.0;
    }
  }

  /**
   * Determine satisfaction level based on overall score
   */
  private getSatisfactionLevel(score: number): SatisfactionLevel {
    if (score >= 80) return 'excellent';
    if (score >= 65) return 'good';
    if (score >= 45) return 'acceptable';
    return 'poor';
  }

  /**
   * Calculate preference satisfaction for multiple assignments
   */
  calculateBatchPreferenceScores(
    assignments: FullAssignment[],
    facultyPreferences: Map<string, FacultyPreferences>
  ): Map<string, OverallPreferenceScore[]> {
    const results = new Map<string, OverallPreferenceScore[]>();

    for (const assignment of assignments) {
      const preferences = facultyPreferences.get(assignment.facultyId);
      if (preferences) {
        const score = this.calculateOverallPreferenceScore(assignment, preferences);
        
        if (!results.has(assignment.facultyId)) {
          results.set(assignment.facultyId, []);
        }
        results.get(assignment.facultyId)!.push(score);
      }
    }

    return results;
  }

  /**
   * Calculate average satisfaction score for a faculty member
   */
  calculateAverageSatisfaction(scores: OverallPreferenceScore[]): number {
    if (scores.length === 0) return 0;
    
    const total = scores.reduce((sum, score) => sum + score.overallScore, 0);
    return Math.round(total / scores.length);
  }
}

// Export singleton instance
export const preferenceScorer = new PreferenceScorer();