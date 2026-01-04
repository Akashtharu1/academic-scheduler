import { eq } from "drizzle-orm";
import { db } from "./db";
import { rooms, courses, timeSlots } from "@shared/schema";
import {
  FacultyPreferences,
  RoomPreference,
  TimePreference,
  SubjectPreference,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "@shared/faculty-preferences";
import {
  roomPreferenceSchema,
  timePreferenceSchema,
  subjectPreferenceSchema,
  RoomType,
  DayOfWeek,
} from "@shared/schema";

export class PreferenceValidator {
  /**
   * Validate room type preferences against available room types
   */
  async validateRoomTypePreferences(
    roomPreferences: RoomPreference[]
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const validRoomTypes: RoomType[] = ['lecture', 'lab', 'tutorial'];

    for (let index = 0; index < (roomPreferences?.length || 0); index++) {
      const pref = roomPreferences[index];

      // Validate room type if specified
      if (pref.roomType && !validRoomTypes.includes(pref.roomType)) {
        errors.push({
          field: `roomPreferences[${index}].roomType`,
          message: `Invalid room type: ${pref.roomType}. Must be one of: ${validRoomTypes.join(', ')}`,
          code: "INVALID_ROOM_TYPE",
        });
      }

      // Validate specific room exists if specified
      if (pref.roomId) {
        try {
          const roomExists = await db
            .select({ id: rooms.id, type: rooms.type })
            .from(rooms)
            .where(eq(rooms.id, pref.roomId))
            .limit(1);

          if (roomExists.length === 0) {
            errors.push({
              field: `roomPreferences[${index}].roomId`,
              message: `Room with ID ${pref.roomId} does not exist`,
              code: "ROOM_NOT_FOUND",
            });
          } else {
            // Check if room type matches if both are specified
            const room = roomExists[0];
            if (pref.roomType && room.type !== pref.roomType) {
              warnings.push({
                field: `roomPreferences[${index}]`,
                message: `Room ${pref.roomId} is of type '${room.type}' but preference specifies '${pref.roomType}'`,
                suggestion: "Remove room type specification or choose a room of the correct type",
              });
            }
          }
        } catch (error) {
          console.warn("Skipping room validation due to database error:", error);
        }
      }

      // Validate facilities if specified
      if (pref.facilities && pref.facilities.length > 0) {
        const validFacilities = ['projector', 'whiteboard', 'computer', 'audio_system', 'video_conference'];
        const invalidFacilities = pref.facilities.filter(f => !validFacilities.includes(f));
        
        if (invalidFacilities.length > 0) {
          warnings.push({
            field: `roomPreferences[${index}].facilities`,
            message: `Unknown facilities: ${invalidFacilities.join(', ')}`,
            suggestion: `Valid facilities are: ${validFacilities.join(', ')}`,
          });
        }
      }

      // Validate schema
      const schemaResult = roomPreferenceSchema.safeParse(pref);
      if (!schemaResult.success) {
        schemaResult.error.errors.forEach(err => {
          errors.push({
            field: `roomPreferences[${index}].${err.path.join('.')}`,
            message: err.message,
            code: "SCHEMA_VALIDATION",
          });
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate time slot preferences against standard time grid
   */
  async validateTimeSlotPreferences(
    timePreferences: TimePreference[]
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Get standard time slots from database
    let standardTimeSlots: { startTime: string; endTime: string; day: string }[] = [];
    try {
      standardTimeSlots = await db
        .select({ startTime: timeSlots.startTime, endTime: timeSlots.endTime, day: timeSlots.day })
        .from(timeSlots);
    } catch (error) {
      console.warn("Could not fetch standard time slots, using default validation");
    }

    const validDays: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let index = 0; index < (timePreferences?.length || 0); index++) {
      const pref = timePreferences[index];

      // Validate day
      if (!validDays.includes(pref.day)) {
        errors.push({
          field: `timePreferences[${index}].day`,
          message: `Invalid day: ${pref.day}. Must be one of: ${validDays.join(', ')}`,
          code: "INVALID_DAY",
        });
      }

      // Validate time format and logic
      const timeFormatRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      
      if (!timeFormatRegex.test(pref.startTime)) {
        errors.push({
          field: `timePreferences[${index}].startTime`,
          message: "Invalid time format. Use HH:MM format (24-hour)",
          code: "INVALID_TIME_FORMAT",
        });
      }

      if (!timeFormatRegex.test(pref.endTime)) {
        errors.push({
          field: `timePreferences[${index}].endTime`,
          message: "Invalid time format. Use HH:MM format (24-hour)",
          code: "INVALID_TIME_FORMAT",
        });
      }

      // Validate time logic (end after start)
      if (timeFormatRegex.test(pref.startTime) && timeFormatRegex.test(pref.endTime)) {
        const start = new Date(`1970-01-01T${pref.startTime}:00`);
        const end = new Date(`1970-01-01T${pref.endTime}:00`);

        if (start >= end) {
          errors.push({
            field: `timePreferences[${index}].endTime`,
            message: "End time must be after start time",
            code: "INVALID_TIME_RANGE",
          });
        }

        // Check if time slot aligns with standard grid
        if (standardTimeSlots.length > 0) {
          const matchesStandardSlot = standardTimeSlots.some(slot => 
            slot.startTime === pref.startTime && 
            slot.endTime === pref.endTime
          );

          if (!matchesStandardSlot) {
            warnings.push({
              field: `timePreferences[${index}]`,
              message: "Time slot does not match standard time grid",
              suggestion: "Consider using standard time slots for better scheduling compatibility",
            });
          }
        }

        // Warn about very long or very short slots
        const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
        if (durationMinutes < 30) {
          warnings.push({
            field: `timePreferences[${index}]`,
            message: "Very short time slot (less than 30 minutes)",
            suggestion: "Consider longer time slots for practical scheduling",
          });
        } else if (durationMinutes > 180) {
          warnings.push({
            field: `timePreferences[${index}]`,
            message: "Very long time slot (more than 3 hours)",
            suggestion: "Consider breaking into shorter sessions",
          });
        }
      }

      // Validate schema
      const schemaResult = timePreferenceSchema.safeParse(pref);
      if (!schemaResult.success) {
        schemaResult.error.errors.forEach(err => {
          errors.push({
            field: `timePreferences[${index}].${err.path.join('.')}`,
            message: err.message,
            code: "SCHEMA_VALIDATION",
          });
        });
      }
    }

    // Check for overlapping preferences
    this.validateTimeOverlaps(timePreferences, errors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate subject preferences against available courses
   */
  async validateSubjectPreferences(
    subjectPreferences: SubjectPreference[],
    facultyDepartment?: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (let index = 0; index < (subjectPreferences?.length || 0); index++) {
      const pref = subjectPreferences[index];

      // Validate course exists
      try {
        const courseExists = await db
          .select({ 
            code: courses.code, 
            name: courses.name, 
            department: courses.department,
            credits: courses.credits 
          })
          .from(courses)
          .where(eq(courses.code, pref.courseCode))
          .limit(1);

        if (courseExists.length === 0) {
          errors.push({
            field: `subjectPreferences[${index}].courseCode`,
            message: `Course ${pref.courseCode} does not exist`,
            code: "COURSE_NOT_FOUND",
          });
        } else {
          const course = courseExists[0];
          
          // Check department match
          if (facultyDepartment && course.department !== facultyDepartment) {
            warnings.push({
              field: `subjectPreferences[${index}].courseCode`,
              message: `Course ${pref.courseCode} is from ${course.department} department, but faculty is from ${facultyDepartment}`,
              suggestion: "Consider focusing on courses from your own department",
            });
          }

          // Validate expertise vs priority alignment
          if (pref.expertiseLevel === 'expert' && pref.priority === 'low') {
            warnings.push({
              field: `subjectPreferences[${index}]`,
              message: "Expert-level course with low priority seems unusual",
              suggestion: "Consider higher priority for courses where you have expertise",
            });
          }

          if (pref.expertiseLevel === 'basic' && pref.priority === 'high') {
            warnings.push({
              field: `subjectPreferences[${index}]`,
              message: "Basic-level course with high priority may need additional preparation",
              suggestion: "Consider medium priority or improve expertise level first",
            });
          }
        }
      } catch (error) {
        console.warn("Skipping course validation due to database error:", error);
      }

      // Validate schema
      const schemaResult = subjectPreferenceSchema.safeParse(pref);
      if (!schemaResult.success) {
        schemaResult.error.errors.forEach(err => {
          errors.push({
            field: `subjectPreferences[${index}].${err.path.join('.')}`,
            message: err.message,
            code: "SCHEMA_VALIDATION",
          });
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate hard and soft constraints
   */
  validateConstraints(preferences: FacultyPreferences): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check hard constraints don't conflict
    const hardTimeConstraints = (preferences.timePreferences || []).filter(pref => pref.isHardConstraint);
    
    // Calculate total hard constraint hours
    const totalHardHours = hardTimeConstraints.reduce((total, pref) => {
      const start = new Date(`1970-01-01T${pref.startTime}:00`);
      const end = new Date(`1970-01-01T${pref.endTime}:00`);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return total + hours;
    }, 0);

    if (totalHardHours > 40) {
      errors.push({
        field: "timePreferences",
        message: `Hard constraints total ${totalHardHours} hours per week, exceeding reasonable limit of 40 hours`,
        code: "EXCESSIVE_HARD_CONSTRAINTS",
      });
    }

    if (totalHardHours > 30) {
      warnings.push({
        field: "timePreferences",
        message: `Hard constraints total ${totalHardHours} hours per week, which may limit scheduling flexibility`,
        suggestion: "Consider reducing hard constraints or converting some to soft preferences",
      });
    }

    // Check preference weight distribution
    const allPreferences = [
      ...(preferences.roomPreferences || []),
      ...(preferences.timePreferences || []),
      ...(preferences.subjectPreferences || []),
    ];

    if (allPreferences.length > 0) {
      const highWeightCount = allPreferences.filter(pref => pref.weight > 80).length;
      const highWeightRatio = highWeightCount / allPreferences.length;

      if (highWeightRatio > 0.8) {
        warnings.push({
          field: "preferences",
          message: "Most preferences have very high weights (>80), which may make scheduling difficult",
          suggestion: "Consider using a mix of high, medium, and low weights for better flexibility",
        });
      }

      const veryLowWeightCount = allPreferences.filter(pref => pref.weight < 20).length;
      const veryLowWeightRatio = veryLowWeightCount / allPreferences.length;

      if (veryLowWeightRatio > 0.5) {
        warnings.push({
          field: "preferences",
          message: "Many preferences have very low weights (<20), which may not influence scheduling",
          suggestion: "Consider increasing weights for preferences that are important to you",
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Comprehensive validation of all preference types
   */
  async validateAllPreferences(
    preferences: FacultyPreferences,
    facultyDepartment?: string
  ): Promise<ValidationResult> {
    // First validate basic structure
    const structureErrors: ValidationError[] = [];
    
    if (!preferences) {
      structureErrors.push({
        field: 'preferences',
        message: 'Preferences object is required',
        code: 'MISSING_PREFERENCES'
      });
      return {
        isValid: false,
        errors: structureErrors,
        warnings: []
      };
    }

    if (!preferences.facultyId) {
      structureErrors.push({
        field: 'facultyId',
        message: 'Faculty ID is required',
        code: 'MISSING_FACULTY_ID'
      });
    }

    if (!Array.isArray(preferences.roomPreferences)) {
      structureErrors.push({
        field: 'roomPreferences',
        message: 'Room preferences must be an array',
        code: 'INVALID_ROOM_PREFERENCES'
      });
    }

    if (!Array.isArray(preferences.timePreferences)) {
      structureErrors.push({
        field: 'timePreferences',
        message: 'Time preferences must be an array',
        code: 'INVALID_TIME_PREFERENCES'
      });
    }

    if (!Array.isArray(preferences.subjectPreferences)) {
      structureErrors.push({
        field: 'subjectPreferences',
        message: 'Subject preferences must be an array',
        code: 'INVALID_SUBJECT_PREFERENCES'
      });
    }

    if (structureErrors.length > 0) {
      return {
        isValid: false,
        errors: structureErrors,
        warnings: []
      };
    }

    const results = await Promise.all([
      this.validateRoomTypePreferences(preferences.roomPreferences),
      this.validateTimeSlotPreferences(preferences.timePreferences),
      this.validateSubjectPreferences(preferences.subjectPreferences, facultyDepartment),
    ]);

    const constraintResult = this.validateConstraints(preferences);

    // Combine all results
    const allErrors = results.flatMap(r => r.errors).concat(constraintResult.errors);
    const allWarnings = results.flatMap(r => r.warnings).concat(constraintResult.warnings);

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * Check for overlapping time preferences
   */
  private validateTimeOverlaps(
    timePreferences: TimePreference[],
    errors: ValidationError[]
  ): void {
    for (let i = 0; i < (timePreferences?.length || 0); i++) {
      for (let j = i + 1; j < (timePreferences?.length || 0); j++) {
        const pref1 = timePreferences[i];
        const pref2 = timePreferences[j];

        if (pref1.day === pref2.day) {
          const start1 = new Date(`1970-01-01T${pref1.startTime}:00`);
          const end1 = new Date(`1970-01-01T${pref1.endTime}:00`);
          const start2 = new Date(`1970-01-01T${pref2.startTime}:00`);
          const end2 = new Date(`1970-01-01T${pref2.endTime}:00`);

          if (start1 < end2 && end1 > start2) {
            errors.push({
              field: `timePreferences[${j}]`,
              message: `Time preference overlaps with another preference on ${pref1.day} (${pref1.startTime}-${pref1.endTime})`,
              code: "TIME_OVERLAP",
            });
          }
        }
      }
    }
  }
}

// Export singleton instance
export const preferenceValidator = new PreferenceValidator();