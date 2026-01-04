import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FacultyPreferences } from '@shared/faculty-preferences';

// Mock the database module to avoid connection issues in tests
jest.mock('./db', () => ({
  db: {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    transaction: jest.fn(),
    delete: jest.fn(),
    insert: jest.fn(),
  },
}));

// Import after mocking
import { PreferenceManager } from './preference-manager';

describe('PreferenceManager', () => {
  let preferenceManager: PreferenceManager;

  beforeEach(() => {
    preferenceManager = new PreferenceManager();
  });

  describe('validatePreferences', () => {
    it('should validate basic preference structure', async () => {
      const validPreferences: FacultyPreferences = {
        facultyId: 'test-faculty-id',
        roomPreferences: [
          {
            roomType: 'lecture',
            priority: 'high',
            weight: 80,
          },
        ],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '09:00',
            endTime: '10:00',
            priority: 'medium',
            weight: 60,
            isHardConstraint: false,
          },
        ],
        subjectPreferences: [
          {
            courseCode: 'CS101',
            expertiseLevel: 'expert',
            priority: 'high',
            weight: 90,
          },
        ],
        constraints: [],
        lastUpdated: new Date(),
      };

      const result = await preferenceManager.validatePreferences(validPreferences);
      
      // Should pass basic validation (though may have warnings about non-existent courses/rooms)
      expect(result.errors.filter(e => e.code === 'SCHEMA_VALIDATION')).toHaveLength(0);
    });

    it('should detect time preference overlaps', async () => {
      const overlappingPreferences: FacultyPreferences = {
        facultyId: 'test-faculty-id',
        roomPreferences: [],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '09:00',
            endTime: '11:00',
            priority: 'high',
            weight: 80,
            isHardConstraint: false,
          },
          {
            day: 'Mon',
            startTime: '10:00',
            endTime: '12:00',
            priority: 'medium',
            weight: 60,
            isHardConstraint: false,
          },
        ],
        subjectPreferences: [],
        constraints: [],
        lastUpdated: new Date(),
      };

      const result = await preferenceManager.validatePreferences(overlappingPreferences);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'TIME_OVERLAP')).toBe(true);
    });

    it('should detect excessive hard constraints', async () => {
      const excessiveConstraints: FacultyPreferences = {
        facultyId: 'test-faculty-id',
        roomPreferences: [],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '08:00',
            endTime: '18:00',
            priority: 'high',
            weight: 100,
            isHardConstraint: true,
          },
          {
            day: 'Tue',
            startTime: '08:00',
            endTime: '18:00',
            priority: 'high',
            weight: 100,
            isHardConstraint: true,
          },
          {
            day: 'Wed',
            startTime: '08:00',
            endTime: '18:00',
            priority: 'high',
            weight: 100,
            isHardConstraint: true,
          },
          {
            day: 'Thu',
            startTime: '08:00',
            endTime: '18:00',
            priority: 'high',
            weight: 100,
            isHardConstraint: true,
          },
          {
            day: 'Fri',
            startTime: '08:00',
            endTime: '18:00',
            priority: 'high',
            weight: 100,
            isHardConstraint: true,
          },
        ],
        subjectPreferences: [],
        constraints: [],
        lastUpdated: new Date(),
      };

      const result = await preferenceManager.validatePreferences(excessiveConstraints);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'EXCESSIVE_HARD_CONSTRAINTS')).toBe(true);
    });

    it('should warn about high weight preferences', async () => {
      const highWeightPreferences: FacultyPreferences = {
        facultyId: 'test-faculty-id',
        roomPreferences: [
          { roomType: 'lecture', priority: 'high', weight: 95 },
          { roomType: 'lab', priority: 'high', weight: 90 },
        ],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '09:00',
            endTime: '10:00',
            priority: 'high',
            weight: 85,
            isHardConstraint: false,
          },
        ],
        subjectPreferences: [
          { courseCode: 'CS101', expertiseLevel: 'expert', priority: 'high', weight: 95 },
        ],
        constraints: [],
        lastUpdated: new Date(),
      };

      const result = await preferenceManager.validatePreferences(highWeightPreferences);
      
      expect(result.warnings.some(w => w.field === 'preferences')).toBe(true);
    });
  });

  describe('time validation', () => {
    it('should validate time format', async () => {
      const invalidTimePreferences: FacultyPreferences = {
        facultyId: 'test-faculty-id',
        roomPreferences: [],
        timePreferences: [
          {
            day: 'Mon',
            startTime: '25:00', // Invalid hour
            endTime: '10:00',
            priority: 'medium',
            weight: 60,
            isHardConstraint: false,
          },
        ],
        subjectPreferences: [],
        constraints: [],
        lastUpdated: new Date(),
      };

      const result = await preferenceManager.validatePreferences(invalidTimePreferences);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'SCHEMA_VALIDATION')).toBe(true);
    });
  });
});