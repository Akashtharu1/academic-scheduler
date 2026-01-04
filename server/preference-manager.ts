import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import {
  facultyRoomPreferences,
  facultyTimePreferences,
  facultySubjectPreferences,
  preferenceHistory,
  faculty,
  rooms,
  courses,
  FacultyRoomPreference,
  FacultyTimePreference,
  FacultySubjectPreference,
  PreferenceHistory,
  InsertFacultyRoomPreference,
  InsertFacultyTimePreference,
  InsertFacultySubjectPreference,
  InsertPreferenceHistory,
  facultyPreferencesSchema,
  preferenceValidationSchema,
  PreferenceValidationInput,
} from "@shared/schema";
import {
  FacultyPreferences,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  aggregateFacultyPreferences,
  convertFromRoomPreference,
  convertFromTimePreference,
  convertFromSubjectPreference,
} from "@shared/faculty-preferences";
import { preferenceValidator } from "./preference-validator";

export class PreferenceManager {
  /**
   * Get all preferences for a faculty member
   */
  async getFacultyPreferences(facultyId: string): Promise<FacultyPreferences | null> {
    try {
      // Verify faculty exists
      const facultyExists = await db
        .select({ id: faculty.id })
        .from(faculty)
        .where(eq(faculty.id, facultyId))
        .limit(1);

      if (facultyExists.length === 0) {
        return null;
      }

      // Fetch all preference types
      const [roomPrefs, timePrefs, subjectPrefs] = await Promise.all([
        db
          .select()
          .from(facultyRoomPreferences)
          .where(eq(facultyRoomPreferences.facultyId, facultyId)),
        db
          .select()
          .from(facultyTimePreferences)
          .where(eq(facultyTimePreferences.facultyId, facultyId)),
        db
          .select()
          .from(facultySubjectPreferences)
          .where(eq(facultySubjectPreferences.facultyId, facultyId)),
      ]);

      return aggregateFacultyPreferences(roomPrefs, timePrefs, subjectPrefs, facultyId);
    } catch (error) {
      console.error("Error fetching faculty preferences:", error);
      throw new Error("Failed to fetch faculty preferences");
    }
  }

  /**
   * Update faculty preferences with validation and audit trail
   */
  async updateFacultyPreferences(
    facultyId: string,
    preferences: FacultyPreferences
  ): Promise<ValidationResult> {
    try {
      // Validate the preferences first
      const validationResult = await this.validatePreferences(preferences);
      if (!validationResult.isValid) {
        return validationResult;
      }

      // Get existing preferences for audit trail
      const existingPreferences = await this.getFacultyPreferences(facultyId);

      // Start transaction
      await db.transaction(async (tx) => {
        // Delete existing preferences
        await Promise.all([
          tx.delete(facultyRoomPreferences).where(eq(facultyRoomPreferences.facultyId, facultyId)),
          tx.delete(facultyTimePreferences).where(eq(facultyTimePreferences.facultyId, facultyId)),
          tx.delete(facultySubjectPreferences).where(eq(facultySubjectPreferences.facultyId, facultyId)),
        ]);

        // Insert new room preferences
        if (preferences.roomPreferences.length > 0) {
          const roomPrefsToInsert = preferences.roomPreferences.map((pref) =>
            convertFromRoomPreference(pref, facultyId)
          );
          await tx.insert(facultyRoomPreferences).values(roomPrefsToInsert);
        }

        // Insert new time preferences
        if (preferences.timePreferences.length > 0) {
          const timePrefsToInsert = preferences.timePreferences.map((pref) =>
            convertFromTimePreference(pref, facultyId)
          );
          await tx.insert(facultyTimePreferences).values(timePrefsToInsert);
        }

        // Insert new subject preferences
        if (preferences.subjectPreferences.length > 0) {
          const subjectPrefsToInsert = preferences.subjectPreferences.map((pref) =>
            convertFromSubjectPreference(pref, facultyId)
          );
          await tx.insert(facultySubjectPreferences).values(subjectPrefsToInsert);
        }

        // Create audit trail entries
        await this.createAuditTrail(
          tx,
          facultyId,
          existingPreferences,
          preferences,
          "updated"
        );
      });

      return {
        isValid: true,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      console.error("Error updating faculty preferences:", error);
      return {
        isValid: false,
        errors: [
          {
            field: "general",
            message: "Failed to update preferences due to a system error",
            code: "SYSTEM_ERROR",
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Validate preferences with comprehensive business rules
   */
  async validatePreferences(preferences: FacultyPreferences, facultyDepartment?: string): Promise<ValidationResult> {
    try {
      // Use the dedicated preference validator
      const result = await preferenceValidator.validateAllPreferences(preferences, facultyDepartment);
      
      // Add basic schema validation
      const schemaValidation = facultyPreferencesSchema.safeParse(preferences);
      if (!schemaValidation.success) {
        schemaValidation.error.errors.forEach((err) => {
          result.errors.push({
            field: err.path.join("."),
            message: err.message,
            code: "SCHEMA_VALIDATION",
          });
        });
      }

      return {
        isValid: result.errors.length === 0,
        errors: result.errors,
        warnings: result.warnings,
      };
    } catch (error) {
      console.error("Error validating preferences:", error);
      return {
        isValid: false,
        errors: [
          {
            field: "general",
            message: "Validation failed due to system error",
            code: "VALIDATION_ERROR",
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Get preference change history for a faculty member
   */
  async getPreferenceHistory(facultyId: string, limit: number = 50): Promise<PreferenceHistory[]> {
    try {
      const history = await db
        .select()
        .from(preferenceHistory)
        .where(eq(preferenceHistory.facultyId, facultyId))
        .orderBy(desc(preferenceHistory.createdAt))
        .limit(limit);

      return history;
    } catch (error) {
      console.error("Error fetching preference history:", error);
      throw new Error("Failed to fetch preference history");
    }
  }



  /**
   * Create audit trail entries for preference changes
   */
  private async createAuditTrail(
    tx: any,
    facultyId: string,
    oldPreferences: FacultyPreferences | null,
    newPreferences: FacultyPreferences,
    action: "created" | "updated" | "deleted"
  ): Promise<void> {
    const auditEntries: InsertPreferenceHistory[] = [];

    // Create audit entries for each preference type
    auditEntries.push({
      facultyId,
      preferenceType: "room",
      preferenceId: facultyId, // Using facultyId as grouping identifier
      action,
      oldValues: oldPreferences?.roomPreferences || null,
      newValues: newPreferences.roomPreferences,
      changedBy: null, // Will be set by API layer with actual user ID
      changeReason: `Bulk ${action} of room preferences`,
    });

    auditEntries.push({
      facultyId,
      preferenceType: "time",
      preferenceId: facultyId,
      action,
      oldValues: oldPreferences?.timePreferences || null,
      newValues: newPreferences.timePreferences,
      changedBy: null,
      changeReason: `Bulk ${action} of time preferences`,
    });

    auditEntries.push({
      facultyId,
      preferenceType: "subject",
      preferenceId: facultyId,
      action,
      oldValues: oldPreferences?.subjectPreferences || null,
      newValues: newPreferences.subjectPreferences,
      changedBy: null,
      changeReason: `Bulk ${action} of subject preferences`,
    });

    await tx.insert(preferenceHistory).values(auditEntries);
  }

  /**
   * Delete all preferences for a faculty member
   */
  async deleteFacultyPreferences(facultyId: string): Promise<void> {
    try {
      const existingPreferences = await this.getFacultyPreferences(facultyId);

      await db.transaction(async (tx) => {
        // Delete all preferences
        await Promise.all([
          tx.delete(facultyRoomPreferences).where(eq(facultyRoomPreferences.facultyId, facultyId)),
          tx.delete(facultyTimePreferences).where(eq(facultyTimePreferences.facultyId, facultyId)),
          tx.delete(facultySubjectPreferences).where(eq(facultySubjectPreferences.facultyId, facultyId)),
        ]);

        // Create audit trail
        if (existingPreferences) {
          await this.createAuditTrail(
            tx,
            facultyId,
            existingPreferences,
            {
              facultyId,
              roomPreferences: [],
              timePreferences: [],
              subjectPreferences: [],
              constraints: [],
              lastUpdated: new Date(),
            },
            "deleted"
          );
        }
      });
    } catch (error) {
      console.error("Error deleting faculty preferences:", error);
      throw new Error("Failed to delete faculty preferences");
    }
  }
}

// Export singleton instance
export const preferenceManager = new PreferenceManager();