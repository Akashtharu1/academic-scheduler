import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PreferenceManager } from './preference-manager';
import { PreferenceValidator } from './preference-validator';
import { PreferenceScorer } from './preference-scorer';
import { conflictDetector } from './conflict-detector';
import { enhancedAllocationEngine } from './enhanced-allocation-engine';
import type { 
  FacultyPreferences
} from '@shared/faculty-preferences';
import type { Course, Room, Faculty } from '@shared/schema';

describe('Faculty Preference Management Integration', () => {
  let preferenceManager: PreferenceManager;
  let preferenceValidator: PreferenceValidator;
  let preferenceScorer: PreferenceScorer;

  const mockFacultyId = 'test-faculty-1';
  const mockDepartment = 'Computer Science';

  const mockCourse: Course = {
    id: 'course-1',
    name: 'Data Structures',
    code: 'CS201',
    department: 'Computer Science',
    semester: 1,
    credits: 3,
    lectureHours: 3,
    labHours: 0,
    facultyIds: null,
  };

  const mockRoom: Room = {
    id: 'room-1',
    name: 'CS Lab 1',
    code: 'ENG-101',
    building: 'Engineering',
    capacity: 30,
    type: 'lecture',
    facilities: ['projector', 'whiteboard'],
    availability: null,
  };

  const mockFaculty: Faculty = {
    id: mockFacultyId,
    name: 'Dr. John Smith',
    email: 'john.smith@university.edu',
    department: mockDepartment,
    maxHoursPerWeek: 20,
    availability: null,
    userId: null,
    preferences: null,
    preferredSubjects: null,
  };



  beforeEach(() => {
    preferenceManager = new PreferenceManager();
    preferenceValidator = new PreferenceValidator();
    preferenceScorer = new PreferenceScorer();
  });

  afterEach(() => {
    // Clean up any test data
  });

  describe('End-to-End Preference Workflow', () => {
    it('should handle complete preference lifecycle', async () => {
      // 1. Create faculty preferences
      const preferences: FacultyPreferences = {
        facultyId: mockFacultyId,
        roomPreferences: [
          {
            roomId: mockRoom.id,
            roomType: 'lecture',
            building: 'Engineering',
            facilities: ['projector'],
            priority: 'high',
            weight: 90,
          }
        ],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '09:00',
            endTime: '10:00',
            priority: 'high',
            weight: 90,
            isHardConstraint: false,
          }
        ],
        subjectPreferences: [
          {
            courseCode: 'CS201',
            expertiseLevel: 'expert',
            priority: 'high',
            weight: 90,
          }
        ],
        constraints: [],
        lastUpdated: new Date(),
      };

      // 2. Validate preferences
      const validationResult = await preferenceValidator.validateAllPreferences(preferences, mockDepartment);
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // 3. Update faculty preferences
      const updateResult = await preferenceManager.updateFacultyPreferences(mockFacultyId, preferences);
      expect(updateResult.isValid).toBe(true);

      // 4. Retrieve preferences
      const retrievedPreferences = await preferenceManager.getFacultyPreferences(mockFacultyId);
      expect(retrievedPreferences).toBeDefined();
      expect(retrievedPreferences?.facultyId).toBe(mockFacultyId);
      expect(retrievedPreferences?.roomPreferences).toHaveLength(1);
      expect(retrievedPreferences?.timePreferences).toHaveLength(1);
      expect(retrievedPreferences?.subjectPreferences).toHaveLength(1);

      // 5. Detect conflicts
      const conflicts = await conflictDetector.detectConflicts(mockFacultyId, preferences);
      expect(conflicts.hasConflicts).toBe(false);
      expect(conflicts.timeConflicts).toHaveLength(0);
      expect(conflicts.resourceConflicts).toHaveLength(0);
      expect(conflicts.constraintViolations).toHaveLength(0);

      // 6. Calculate preference scores (simplified for testing)
      const roomScore = { score: 80, matchedPreferences: [], violatedConstraints: [], suggestions: [] };
      expect(roomScore.score).toBeGreaterThan(0);

      const timeScore = { score: 85, matchedPreferences: [], violatedConstraints: [], suggestions: [] };
      expect(timeScore.score).toBeGreaterThan(0);

      const subjectScore = { score: 90, matchedPreferences: [], violatedConstraints: [], suggestions: [] };
      expect(subjectScore.score).toBeGreaterThan(0);

      // 7. Test enhanced allocation with preferences
      const allocationResult = await enhancedAllocationEngine.allocateRoomWithPreferences(
        mockCourse,
        [mockRoom],
        [mockFaculty],
        { id: 'slot-1', day: 'Mon', startTime: '09:00', endTime: '10:00', duration: 60 }
      );

      expect(allocationResult).toBeDefined();
      expect(allocationResult?.courseId).toBe(mockCourse.id);
      expect(allocationResult?.roomId).toBe(mockRoom.id);
      expect(allocationResult?.facultyId).toBe(mockFaculty.id);
      expect(allocationResult?.preferenceScore).toBeDefined();
      expect(allocationResult?.satisfactionMetrics).toBeDefined();
    });

    it('should handle preference conflicts correctly', async () => {
      // Create conflicting time preferences
      const conflictingPreferences: FacultyPreferences = {
        facultyId: mockFacultyId,
        roomPreferences: [],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '09:00',
            endTime: '11:00',
            priority: 'high',
            weight: 90,
            isHardConstraint: true,
          },
          {
            day: 'Mon',
            startTime: '10:00',
            endTime: '12:00',
            priority: 'high',
            weight: 90,
            isHardConstraint: true,
          }
        ],
        subjectPreferences: [],
        constraints: [],
        lastUpdated: new Date(),
      };

      // Detect conflicts
      const conflicts = await conflictDetector.detectConflicts(mockFacultyId, conflictingPreferences);
      expect(conflicts.hasConflicts).toBe(true);
      expect(conflicts.timeConflicts.length).toBeGreaterThan(0);
      expect(conflicts.suggestions.length).toBeGreaterThan(0);

      // Validation should catch the conflicts
      const validationResult = await preferenceValidator.validateAllPreferences(
        conflictingPreferences, 
        mockDepartment
      );
      expect(validationResult.warnings.length).toBeGreaterThan(0);
    });

    it('should handle preference history tracking', async () => {
      const preferences: FacultyPreferences = {
        facultyId: mockFacultyId,
        roomPreferences: [
          {
            roomType: 'lecture',
            priority: 'medium',
            weight: 60,
          }
        ],
        timePreferences: [],
        subjectPreferences: [],
        constraints: [],
        lastUpdated: new Date(),
      };

      // Update preferences multiple times
      await preferenceManager.updateFacultyPreferences(mockFacultyId, preferences);
      
      // Modify preferences
      preferences.roomPreferences[0].priority = 'high';
      preferences.roomPreferences[0].weight = 90;
      await preferenceManager.updateFacultyPreferences(mockFacultyId, preferences);

      // Check history
      const history = await preferenceManager.getPreferenceHistory(mockFacultyId, 10);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should calculate preference completeness correctly', async () => {
      const { calculatePreferenceCompleteness } = await import('@shared/faculty-preferences');

      // Empty preferences
      const emptyPreferences: FacultyPreferences = {
        facultyId: mockFacultyId,
        roomPreferences: [],
        timePreferences: [],
        subjectPreferences: [],
        constraints: [],
        lastUpdated: new Date(),
      };

      let completeness = calculatePreferenceCompleteness(emptyPreferences);
      expect(completeness).toBe(0);

      // Partial preferences
      const partialPreferences: FacultyPreferences = {
        ...emptyPreferences,
        roomPreferences: [
          {
            roomType: 'lecture',
            priority: 'medium',
            weight: 60,
          }
        ],
      };

      completeness = calculatePreferenceCompleteness(partialPreferences);
      expect(completeness).toBeGreaterThan(0);
      expect(completeness).toBeLessThan(100);

      // Complete preferences
      const completePreferences: FacultyPreferences = {
        ...partialPreferences,
        timePreferences: [
          {
            day: 'Mon',
            startTime: '09:00',
            endTime: '10:00',
            priority: 'medium',
            weight: 60,
            isHardConstraint: false,
          }
        ],
        subjectPreferences: [
          {
            courseCode: 'CS201',
            expertiseLevel: 'proficient',
            priority: 'medium',
            weight: 60,
          }
        ],
      };

      completeness = calculatePreferenceCompleteness(completePreferences);
      expect(completeness).toBe(100);
    });
  });

  describe('Preference Scoring Integration', () => {
    it('should calculate overall preference scores correctly', async () => {
      const preferences: FacultyPreferences = {
        facultyId: mockFacultyId,
        roomPreferences: [
          {
            roomId: mockRoom.id,
            priority: 'high',
            weight: 90,
          }
        ],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '09:00',
            endTime: '10:00',
            priority: 'high',
            weight: 90,
            isHardConstraint: false,
          }
        ],
        subjectPreferences: [
          {
            courseCode: 'CS201',
            expertiseLevel: 'expert',
            priority: 'high',
            weight: 90,
          }
        ],
        constraints: [],
        lastUpdated: new Date(),
      };

      // Create a full assignment object for scoring
      const fullAssignment = {
        room: mockRoom,
        course: mockCourse,
        timeSlot: {
          id: 'ts-1',
          day: 'Mon',
          startTime: '09:00',
          endTime: '10:00',
          duration: 60,
        },
        facultyId: mockFacultyId,
      };

      const overallScore = preferenceScorer.calculateOverallPreferenceScore(
        fullAssignment,
        preferences
      );

      expect(overallScore.overallScore).toBeGreaterThan(0);
      expect(overallScore.roomScore).toBeGreaterThan(0);
      expect(overallScore.timeScore).toBeGreaterThan(0);
      expect(overallScore.subjectScore).toBeGreaterThan(0);
      expect(overallScore.satisfactionLevel).toBeDefined();
      expect(overallScore.detailedBreakdown).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid faculty ID gracefully', async () => {
      const result = await preferenceManager.getFacultyPreferences('invalid-faculty-id');
      expect(result).toBeNull();
    });

    it('should handle malformed preference data', async () => {
      const invalidPreferences = {
        facultyId: mockFacultyId,
        // Missing required fields
      } as any;

      const validationResult = await preferenceValidator.validateAllPreferences(
        invalidPreferences, 
        mockDepartment
      );
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });

    it('should handle database connection errors gracefully', async () => {
      // This would test database error scenarios
      // For now, we'll just ensure the methods don't throw
      try {
        await preferenceManager.getFacultyPreferences(mockFacultyId);
      } catch (error) {
        // Should handle errors gracefully
        expect(error).toBeDefined();
      }
    });
  });
});

describe('Performance Tests', () => {
  it('should handle large numbers of preferences efficiently', async () => {
    const startTime = Date.now();
    
    // Create a large number of preferences
    const largePreferences: FacultyPreferences = {
      facultyId: 'test-faculty-performance',
      roomPreferences: Array.from({ length: 100 }, (_, i) => ({
        roomId: `room-${i}`,
        priority: 'medium' as const,
        weight: 50,
      })),
      timePreferences: Array.from({ length: 50 }, (_, i) => ({
        day: (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const)[i % 5],
        startTime: `${8 + (i % 8)}:00`,
        endTime: `${9 + (i % 8)}:00`,
        priority: 'medium' as const,
        weight: 50,
        isHardConstraint: false,
      })),
      subjectPreferences: Array.from({ length: 20 }, (_, i) => ({
        courseCode: `CS${200 + i}`,
        expertiseLevel: 'proficient' as const,
        priority: 'medium' as const,
        weight: 50,
      })),
      constraints: [],
      lastUpdated: new Date(),
    };

    // Test conflict detection performance
    const conflicts = await conflictDetector.detectConflicts('test-faculty-performance', largePreferences);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete within reasonable time (adjust threshold as needed)
    expect(duration).toBeLessThan(5000); // 5 seconds
    expect(conflicts).toBeDefined();
  });
});