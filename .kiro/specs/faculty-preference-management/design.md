# Design Document

## Overview

The Faculty Preference Management system will extend the existing timetable generation system to incorporate faculty preferences into the room allocation and scheduling process. This system will provide a comprehensive preference management interface for faculty members and integrate seamlessly with the existing AllocationEngine to optimize assignments based on faculty satisfaction while maintaining system efficiency.

## Architecture

The faculty preference system will be implemented as an extension to the existing room allocation architecture, adding new components while integrating with existing services:

1. **Preference Manager**: Core component for managing faculty preferences
2. **Preference Scorer**: Calculates preference satisfaction scores for assignments
3. **Preference Integrator**: Integrates preference data with the existing AllocationEngine
4. **Preference UI Components**: Frontend interfaces for preference management
5. **Preference Analytics**: Reporting and analysis of preference satisfaction

The system will extend the existing database schema and integrate with the current RoomAllocationService and AllocationEngine components.

## Components and Interfaces

### Preference Manager
```typescript
interface PreferenceManager {
  getFacultyPreferences(facultyId: string): FacultyPreferences;
  updateFacultyPreferences(facultyId: string, preferences: FacultyPreferences): Promise<void>;
  validatePreferences(preferences: FacultyPreferences): ValidationResult;
  getPreferenceHistory(facultyId: string): PreferenceHistory[];
}

interface FacultyPreferences {
  facultyId: string;
  roomPreferences: RoomPreference[];
  timePreferences: TimePreference[];
  subjectPreferences: SubjectPreference[];
  constraints: PreferenceConstraint[];
  lastUpdated: Date;
}

interface RoomPreference {
  roomId?: string;
  roomType?: RoomType;
  building?: string;
  facilities?: string[];
  priority: PreferencePriority;
  weight: number; // 0-100
}

interface TimePreference {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  priority: PreferencePriority;
  weight: number; // 0-100
  isHardConstraint: boolean;
}

interface SubjectPreference {
  courseCode: string;
  expertiseLevel: ExpertiseLevel;
  priority: PreferencePriority;
  weight: number; // 0-100
}
```

### Preference Scorer
```typescript
interface PreferenceScorer {
  calculateRoomPreferenceScore(assignment: RoomAssignment, preferences: FacultyPreferences): PreferenceScore;
  calculateTimePreferenceScore(assignment: TimeAssignment, preferences: FacultyPreferences): PreferenceScore;
  calculateSubjectPreferenceScore(assignment: SubjectAssignment, preferences: FacultyPreferences): PreferenceScore;
  calculateOverallPreferenceScore(assignment: FullAssignment, preferences: FacultyPreferences): OverallPreferenceScore;
}

interface PreferenceScore {
  score: number; // 0-100
  matchedPreferences: string[];
  violatedConstraints: string[];
  suggestions: string[];
}

interface OverallPreferenceScore {
  roomScore: number;
  timeScore: number;
  subjectScore: number;
  overallScore: number;
  satisfactionLevel: SatisfactionLevel;
  detailedBreakdown: PreferenceBreakdown;
}
```

### Enhanced Allocation Engine Integration
```typescript
interface EnhancedAllocationEngine extends AllocationEngine {
  allocateRoomWithPreferences(
    requirements: CourseRequirements,
    facultyPreferences: FacultyPreferences,
    timeSlot: TimeSlot,
    availableRooms: Room[]
  ): PreferenceAwareAllocationResult;
}

interface PreferenceAwareAllocationResult extends AllocationResult {
  preferenceScore: OverallPreferenceScore;
  facultyId: string;
  preferenceViolations: PreferenceViolation[];
  alternativeAssignments: AlternativeAssignment[];
}
```

## Data Models

### Enhanced Faculty Schema Extension
```typescript
interface EnhancedFaculty extends Faculty {
  roomPreferences: RoomPreference[];
  timePreferences: TimePreference[];
  subjectPreferences: SubjectPreference[];
  preferenceConstraints: PreferenceConstraint[];
  preferenceProfile: PreferenceProfile;
}

interface PreferenceProfile {
  flexibilityScore: number; // How flexible the faculty is with preferences
  priorityWeights: {
    room: number;
    time: number;
    subject: number;
  };
  lastPreferenceUpdate: Date;
  preferenceCompleteness: number; // Percentage of preferences filled out
}
```

### Preference Constraint Model
```typescript
interface PreferenceConstraint {
  id: string;
  type: ConstraintType;
  description: string;
  isHardConstraint: boolean;
  priority: number;
  conditions: ConstraintCondition[];
}

type ConstraintType = 'time_unavailable' | 'room_incompatible' | 'subject_expertise' | 'workload_limit';

interface ConstraintCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: any;
}
```

### Preference Analytics Model
```typescript
interface PreferenceAnalytics {
  facultyId: string;
  satisfactionMetrics: SatisfactionMetrics;
  preferenceUtilization: PreferenceUtilization;
  conflictAnalysis: ConflictAnalysis;
  improvementSuggestions: ImprovementSuggestion[];
}

interface SatisfactionMetrics {
  overallSatisfaction: number;
  roomSatisfaction: number;
  timeSatisfaction: number;
  subjectSatisfaction: number;
  trendData: SatisfactionTrend[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Room Preference Persistence
*For any* faculty member and room preference selection, storing the preferences should result in the data being immediately retrievable with correct priority levels
**Validates: Requirements 1.2**

### Property 2: Room Type Validation
*For any* room type preference input, the validation should correctly accept valid room types and reject invalid ones based on available room types in the system
**Validates: Requirements 1.3**

### Property 3: Preference Data Persistence
*For any* preference data being saved, the system should persist the data to the database and make it immediately retrievable
**Validates: Requirements 1.4**

### Property 4: Preference History Maintenance
*For any* preference update operation, the system should maintain a complete audit trail of changes with timestamps and previous values
**Validates: Requirements 1.5**

### Property 5: Time Conflict Detection
*For any* time preference that conflicts with existing commitments, the system should correctly identify and flag the conflict
**Validates: Requirements 2.2**

### Property 6: Hard Constraint Marking
*For any* unavailable time slot specification, the system should mark it as a hard constraint that cannot be violated during allocation
**Validates: Requirements 2.3**

### Property 7: Time Slot Validation
*For any* time preference input, the system should validate it against the standard time slot grid and reject invalid time ranges
**Validates: Requirements 2.4**

### Property 8: Priority Ranking Functionality
*For any* set of multiple preferences, the system should allow and maintain priority rankings consistently
**Validates: Requirements 2.5**

### Property 9: Subject Preference Ranking
*For any* set of selected subject preferences, the system should maintain and apply preference level rankings correctly
**Validates: Requirements 3.2**

### Property 10: Expertise Level Storage
*For any* expertise level specification, the system should store competency ratings and associate them correctly with subjects
**Validates: Requirements 3.3**

### Property 11: Course Addition Notifications
*For any* new course added to the system, relevant faculty members should receive notifications to update their preferences
**Validates: Requirements 3.4**

### Property 12: Immediate Profile Updates
*For any* subject preference modification, the faculty profile should be updated immediately and reflect the changes
**Validates: Requirements 3.5**

### Property 13: Conflict Highlighting
*For any* detected preference conflicts, the system should highlight them with appropriate severity indicators
**Validates: Requirements 4.2**

### Property 14: Administrative Overrides
*For any* administrative override attempt, the system should allow temporary overrides with required justification documentation
**Validates: Requirements 4.3**

### Property 15: Statistics Report Generation
*For any* request for preference statistics, the system should generate comprehensive reports on preference satisfaction rates
**Validates: Requirements 4.4**

### Property 16: Batch Modification Support
*For any* bulk preference update operation, the system should process all modifications correctly and maintain data consistency
**Validates: Requirements 4.5**

### Property 17: Structured Preference Data Provision
*For any* allocation engine request for preference data, the system should provide complete and correctly structured preference information
**Validates: Requirements 5.1**

### Property 18: Preference Match Rating Calculation
*For any* assignment scenario, the system should compute accurate preference match ratings based on faculty preferences
**Validates: Requirements 5.2**

### Property 19: Alternative Suggestion Generation
*For any* scenario where preferences cannot be satisfied, the system should provide viable alternative suggestions
**Validates: Requirements 5.3**

### Property 20: Configurable Weight Application
*For any* preference weight configuration, the system should apply the weights correctly across different preference types
**Validates: Requirements 5.4**

### Property 21: Satisfaction Metrics Calculation
*For any* allocation result, the system should calculate comprehensive preference satisfaction metrics
**Validates: Requirements 5.5**

### Property 22: Individual Satisfaction Scoring
*For any* generated timetable, the system should calculate accurate individual preference satisfaction scores for each faculty member
**Validates: Requirements 6.1**

### Property 23: Preference Violation Explanations
*For any* unsatisfied preference, the system should provide clear explanations for why the preference could not be met
**Validates: Requirements 6.2**

### Property 24: Alternative Preference Suggestions
*For any* preference conflict scenario, the system should suggest viable alternative preferences that could be accommodated
**Validates: Requirements 6.3**

### Property 25: Change Impact Notifications
*For any* timetable change that affects faculty preferences, the system should notify all affected faculty members
**Validates: Requirements 6.4**

### Property 26: Detailed Analysis Report Generation
*For any* preference satisfaction report request, the system should generate comprehensive analysis reports with detailed breakdowns
**Validates: Requirements 6.5**

## Error Handling

### Preference Validation Errors
- **Detection**: Validate all preference inputs against system constraints and available options
- **Response**: Provide clear error messages with specific validation failures
- **Fallback**: Allow partial preference saving with warnings for invalid entries

### Preference Conflict Resolution
- **Detection**: Identify conflicts between faculty preferences and system constraints
- **Response**: Present conflict details with severity levels and suggested resolutions
- **Fallback**: Allow temporary conflict acceptance with administrator approval

### Database Persistence Failures
- **Detection**: Monitor database operations for failures during preference storage
- **Response**: Retry operations with exponential backoff and user notification
- **Fallback**: Cache preferences locally and sync when database becomes available

### Integration Failures with Allocation Engine
- **Detection**: Monitor communication between preference system and allocation engine
- **Response**: Provide degraded service with basic allocation without preference optimization
- **Fallback**: Log failures and notify administrators for manual intervention

## Testing Strategy

### Unit Testing
- Test preference validation logic with various input combinations
- Verify preference scoring algorithms with known preference scenarios
- Test database operations for preference storage and retrieval
- Validate notification systems for preference-related events

### Property-Based Testing
- **Framework**: fast-check (JavaScript property testing library)
- **Test Configuration**: Minimum 100 iterations per property
- **Property Tests**: Each correctness property will be implemented as a separate property-based test

**Property Test 1: Room Preference Persistence**
```typescript
// **Feature: faculty-preference-management, Property 1: Room Preference Persistence**
test('room preference persistence property', () => {
  fc.assert(fc.property(
    fc.record({
      facultyId: fc.string(),
      roomPreferences: fc.array(roomPreferenceGenerator)
    }),
    async (data) => {
      await preferenceManager.updateRoomPreferences(data.facultyId, data.roomPreferences);
      const retrieved = await preferenceManager.getFacultyPreferences(data.facultyId);
      return retrieved.roomPreferences.length === data.roomPreferences.length &&
             retrieved.roomPreferences.every(pref => pref.priority !== undefined);
    }
  ));
});
```

**Property Test 2: Time Conflict Detection**
```typescript
// **Feature: faculty-preference-management, Property 5: Time Conflict Detection**
test('time conflict detection property', () => {
  fc.assert(fc.property(
    fc.record({
      existingCommitments: fc.array(timeSlotGenerator),
      newPreference: timePreferenceGenerator
    }),
    (data) => {
      const conflicts = preferenceManager.detectTimeConflicts(
        data.newPreference, 
        data.existingCommitments
      );
      const hasOverlap = data.existingCommitments.some(commitment => 
        timeRangesOverlap(commitment, data.newPreference)
      );
      return hasOverlap === (conflicts.length > 0);
    }
  ));
});
```

### Integration Testing
- Test complete preference workflow from UI to database
- Verify integration with existing allocation engine
- Test notification systems across different user roles
- Validate preference impact on timetable generation

### Performance Testing
- Measure preference calculation performance with large faculty datasets
- Test concurrent preference updates and conflict detection
- Validate system responsiveness during bulk preference operations
- Test scalability with increasing numbers of preferences and constraints