import { Room, RoomType } from '@shared/schema';
import { 
  RoomAnalyzer, 
  CourseRequirements, 
  SuitabilityScore, 
  AllocationConfig,
  DEFAULT_ALLOCATION_CONFIG 
} from '@shared/room-allocation';

export class RoomAnalyzerImpl implements RoomAnalyzer {
  private config: AllocationConfig;

  constructor(config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG) {
    this.config = config;
  }

  evaluateRoomSuitability(room: Room, requirements: CourseRequirements): SuitabilityScore {
    const capacityScore = this.calculateCapacityMatch(room.capacity, requirements.expectedSize);
    const typeScore = this.calculateTypeMatch(room.type as RoomType, requirements.requiredRoomType);
    const facilityScore = this.calculateFacilityMatch(room, requirements);
    
    // Calculate weighted overall score
    const overallScore = 
      (capacityScore * this.config.weights.capacity) +
      (typeScore * this.config.weights.roomType) +
      (facilityScore * this.config.weights.facilities);

    return {
      capacityScore,
      typeScore,
      facilityScore,
      overallScore: Math.round(overallScore * 100) / 100, // Round to 2 decimal places
    };
  }

  calculateCapacityMatch(roomCapacity: number, expectedSize: number): number {
    if (expectedSize <= 0 || roomCapacity <= 0) {
      return 0;
    }

    const utilization = expectedSize / roomCapacity;
    
    // Optimal utilization is between 60% and 90%
    if (utilization >= 0.6 && utilization <= 0.9) {
      // Perfect range - score based on how close to 75% (ideal)
      const idealUtilization = 0.75;
      const deviation = Math.abs(utilization - idealUtilization);
      return Math.max(0, 100 - (deviation * 200)); // Scale deviation to score
    }
    
    // Acceptable range 40% to 95%
    if (utilization >= 0.4 && utilization <= 0.95) {
      if (utilization < 0.6) {
        // Under-utilized: score decreases as utilization gets lower
        return 60 + ((utilization - 0.4) / 0.2) * 30; // 60-90 score range
      } else {
        // Over-utilized: score decreases as utilization gets higher
        return 90 - ((utilization - 0.9) / 0.05) * 30; // 90-60 score range
      }
    }
    
    // Outside acceptable range
    if (utilization > 0.95) {
      // Overcrowded - very low score but not zero (might be emergency option)
      return Math.max(10, 60 - ((utilization - 0.95) * 500));
    }
    
    // Under-utilized (less than 40%) - low score for waste
    return Math.max(5, utilization * 150); // Scale up to max 60 for very low utilization
  }

  checkFacilityRequirements(room: Room, requirements: CourseRequirements): boolean {
    if (!requirements.requiredFacilities || requirements.requiredFacilities.length === 0) {
      return true; // No specific requirements
    }

    const roomFacilities = room.facilities || [];
    
    // Check if all required facilities are available
    return requirements.requiredFacilities.every(required => 
      roomFacilities.some(available => 
        available.toLowerCase().includes(required.toLowerCase()) ||
        required.toLowerCase().includes(available.toLowerCase())
      )
    );
  }

  checkRoomTypeCompatibility(roomType: RoomType, requiredTypes: RoomType[]): boolean {
    if (!requiredTypes || requiredTypes.length === 0) {
      return true; // No specific type requirements
    }

    // Direct match
    if (requiredTypes.includes(roomType)) {
      return true;
    }

    // Compatibility rules:
    // - Lecture rooms can be used for tutorials (but not ideal)
    // - Lab rooms are only for lab courses
    // - Tutorial rooms can be used for small lectures
    
    if (roomType === 'lecture') {
      return requiredTypes.includes('tutorial'); // Lecture room can host tutorials
    }
    
    if (roomType === 'tutorial') {
      return requiredTypes.includes('lecture'); // Tutorial room can host small lectures
    }
    
    // Lab rooms are strict - only for lab courses
    return false;
  }

  private calculateTypeMatch(roomType: RoomType, requiredTypes: RoomType[]): number {
    if (!requiredTypes || requiredTypes.length === 0) {
      return 100; // No specific requirements
    }

    // Perfect match
    if (requiredTypes.includes(roomType)) {
      return 100;
    }

    // Check compatibility with reduced score
    if (this.checkRoomTypeCompatibility(roomType, requiredTypes)) {
      // Compatible but not ideal
      if (roomType === 'lecture' && requiredTypes.includes('tutorial')) {
        return 70; // Lecture room for tutorial - acceptable but not ideal
      }
      if (roomType === 'tutorial' && requiredTypes.includes('lecture')) {
        return 60; // Tutorial room for lecture - less ideal due to capacity
      }
    }

    // Incompatible
    if (this.config.preferences.strictTypeMatching) {
      return 0; // Strict mode - no incompatible assignments
    }
    
    return 20; // Lenient mode - very low score but possible
  }

  private calculateFacilityMatch(room: Room, requirements: CourseRequirements): number {
    if (!requirements.requiredFacilities || requirements.requiredFacilities.length === 0) {
      return 100; // No specific requirements
    }

    const roomFacilities = room.facilities || [];
    const requiredFacilities = requirements.requiredFacilities;
    
    if (requiredFacilities.length === 0) {
      return 100;
    }

    let matchedFacilities = 0;
    let partialMatches = 0;

    for (const required of requiredFacilities) {
      let matched = false;
      
      for (const available of roomFacilities) {
        const reqLower = required.toLowerCase();
        const availLower = available.toLowerCase();
        
        // Exact match or contains
        if (availLower === reqLower || availLower.includes(reqLower)) {
          matchedFacilities++;
          matched = true;
          break;
        }
        
        // Partial match (required contains available or vice versa)
        if (reqLower.includes(availLower)) {
          partialMatches++;
          matched = true;
          break;
        }
      }
    }

    // Calculate score based on matches
    const exactMatchScore = (matchedFacilities / requiredFacilities.length) * 100;
    const partialMatchScore = (partialMatches / requiredFacilities.length) * 50;
    
    return Math.min(100, exactMatchScore + partialMatchScore);
  }

  // Helper method to get course requirements from course data
  static getCourseRequirements(course: any): CourseRequirements {
    // Estimate class size based on course level and type
    let expectedSize = 30; // Default
    
    // Estimate based on course code patterns
    if (course.code) {
      const courseNumber = parseInt(course.code.replace(/\D/g, ''));
      if (courseNumber < 200) {
        expectedSize = 60; // Introductory courses are larger
      } else if (courseNumber < 300) {
        expectedSize = 40; // Intermediate courses
      } else if (courseNumber < 400) {
        expectedSize = 30; // Advanced courses
      } else {
        expectedSize = 25; // Senior/graduate courses are smaller
      }
    }

    // Check if this is a lab course (multiple detection methods)
    const isLabCourse = this.isLabCourse(course);
    
    // Adjust for lab courses
    if (isLabCourse) {
      expectedSize = Math.min(expectedSize, 30); // Lab courses are typically smaller
    }

    // Determine required room type based on course characteristics
    let requiredRoomType: RoomType[] = ['lecture'];
    let requiredFacilities: string[] = [];

    if (isLabCourse) {
      requiredRoomType = ['lab'];
      // Determine specific lab facilities based on course department/name
      requiredFacilities = this.getLabFacilities(course);
    } else if (expectedSize <= 25) {
      requiredRoomType = ['tutorial', 'lecture'];
    } else if (expectedSize <= 40) {
      requiredRoomType = ['lecture', 'tutorial'];
    }

    // Set priority based on course level and type
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (course.code) {
      const courseNumber = parseInt(course.code.replace(/\D/g, ''));
      if (courseNumber < 200) {
        priority = 'high'; // Core introductory courses
      } else if (courseNumber >= 400) {
        priority = 'high'; // Senior courses
      }
    }
    
    // Lab courses get higher priority (harder to schedule)
    if (isLabCourse) {
      priority = 'high';
    }

    return {
      courseId: course.id,
      expectedSize,
      requiredRoomType,
      requiredFacilities,
      preferredCapacityRange: [
        Math.floor(expectedSize * 0.6), // Allow more flexibility on lower bound
        Math.ceil(expectedSize * 1.8)   // Allow more flexibility on upper bound
      ],
      priority,
    };
  }

  // Determine if a course is a lab course
  private static isLabCourse(course: any): boolean {
    // Check labHours field
    if (course.labHours && course.labHours > 0) {
      return true;
    }
    
    // Check course code for lab indicators
    if (course.code) {
      const codeLower = course.code.toLowerCase();
      if (codeLower.includes('lab') || codeLower.includes('l') && /\d+l$/i.test(course.code)) {
        return true;
      }
    }
    
    // Check course name for lab indicators
    if (course.name) {
      const nameLower = course.name.toLowerCase();
      if (nameLower.includes('lab') || nameLower.includes('laboratory') || 
          nameLower.includes('practical') || nameLower.includes('workshop')) {
        return true;
      }
    }
    
    return false;
  }

  // Get appropriate lab facilities based on course department/name
  private static getLabFacilities(course: any): string[] {
    const facilities: string[] = [];
    const nameLower = (course.name || '').toLowerCase();
    const deptLower = (course.department || '').toLowerCase();
    
    // Computer/IT related labs
    if (deptLower.includes('computer') || deptLower.includes('ise') || 
        deptLower.includes('it') || deptLower.includes('software') ||
        nameLower.includes('programming') || nameLower.includes('software') ||
        nameLower.includes('web') || nameLower.includes('database')) {
      facilities.push('computers', 'software', 'internet');
    }
    // Physics labs
    else if (deptLower.includes('physics') || nameLower.includes('physics')) {
      facilities.push('physics equipment', 'oscilloscopes');
    }
    // Chemistry labs
    else if (deptLower.includes('chemistry') || nameLower.includes('chemistry')) {
      facilities.push('fume hoods', 'safety equipment');
    }
    // Biology labs
    else if (deptLower.includes('biology') || deptLower.includes('bio') ||
             nameLower.includes('biology') || nameLower.includes('microbiology')) {
      facilities.push('microscopes', 'incubators');
    }
    // Electronics labs
    else if (nameLower.includes('electronics') || nameLower.includes('circuit')) {
      facilities.push('electronics equipment', 'oscilloscopes');
    }
    // Default lab facilities
    else {
      facilities.push('equipment');
    }
    
    return facilities;
  }
}