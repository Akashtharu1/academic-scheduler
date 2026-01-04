# Design Document

## Overview

The efficient room allocation system will replace the current naive room selection algorithm with an intelligent, multi-criteria decision system. The new algorithm will balance room utilization, match room capacity to class size, consider room type and facilities, and minimize scheduling conflicts through smart allocation strategies.

## Architecture

The room allocation system will be implemented as a modular component within the existing timetable generation service. It will consist of several key components:

1. **Room Analyzer**: Evaluates room suitability based on capacity, type, and facilities
2. **Utilization Tracker**: Monitors and balances room usage across the scheduling period
3. **Conflict Resolver**: Handles scheduling conflicts and suggests alternatives
4. **Allocation Engine**: Core decision-making component that selects optimal rooms
5. **Metrics Collector**: Gathers statistics and generates reports

## Components and Interfaces

### Room Analyzer
```typescript
interface RoomAnalyzer {
  evaluateRoomSuitability(room: Room, course: Course): SuitabilityScore;
  calculateCapacityMatch(roomCapacity: number, expectedSize: number): number;
  checkFacilityRequirements(room: Room, course: Course): boolean;
}

interface SuitabilityScore {
  capacityScore: number;    // 0-100, higher is better match
  typeScore: number;        // 0-100, room type appropriateness
  facilityScore: number;    // 0-100, facility match quality
  overallScore: number;     // Weighted combination
}
```

### Utilization Tracker
```typescript
interface UtilizationTracker {
  getCurrentUtilization(roomId: string): number;
  getUtilizationBalance(): UtilizationBalance;
  updateUtilization(roomId: string, timeSlot: TimeSlot): void;
  getLowestUtilizedRooms(count: number): Room[];
}

interface UtilizationBalance {
  maxUtilization: number;
  minUtilization: number;
  averageUtilization: number;
  standardDeviation: number;
  isBalanced: boolean;
}
```

### Allocation Engine
```typescript
interface AllocationEngine {
  allocateRoom(course: Course, timeSlot: TimeSlot, availableRooms: Room[]): AllocationResult;
  findBestRoom(candidates: RoomCandidate[]): Room | null;
  handleNoAvailableRooms(course: Course, timeSlot: TimeSlot): ConflictResolution;
}

interface AllocationResult {
  selectedRoom: Room | null;
  confidence: number;
  alternativeRooms: Room[];
  conflicts: Conflict[];
  reasoning: string;
}
```

## Data Models

### Enhanced Room Model
```typescript
interface Room {
  id: string;
  code: string;
  name: string;
  building: string;
  capacity: number;
  type: RoomType;
  facilities: string[];
  availability: AvailabilitySlot[];
  // New fields for allocation
  utilizationScore?: number;
  lastAssignedTime?: Date;
  preferredCapacityRange?: [number, number];
}
```

### Course Requirements Model
```typescript
interface CourseRequirements {
  expectedSize: number;
  requiredRoomType: RoomType[];
  requiredFacilities: string[];
  preferredCapacityRange: [number, number];
  priority: 'high' | 'medium' | 'low';
}
```

### Allocation Metrics Model
```typescript
interface AllocationMetrics {
  roomUtilization: Map<string, number>;
  capacityEfficiency: Map<string, number>;
  typeMatchAccuracy: number;
  facilityMatchRate: number;
  conflictRate: number;
  balanceScore: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Even Distribution Across Rooms
*For any* set of rooms and courses, the allocation algorithm should distribute sessions so that the utilization variance across rooms is minimized
**Validates: Requirements 1.1**

### Property 2: Utilization Spread Constraint
*For any* allocation result, no room should exceed 80% utilization while others remain below 20%
**Validates: Requirements 1.2**

### Property 3: Lowest Utilization Selection
*For any* time slot with multiple available rooms, the algorithm should select the room with the lowest current utilization
**Validates: Requirements 1.3**

### Property 4: Capacity Matching Optimization
*For any* course assignment, when multiple suitable rooms are available, the algorithm should prefer the room with capacity closest to the expected class size
**Validates: Requirements 2.2**

### Property 5: Overall Capacity Efficiency
*For any* complete allocation, the average capacity utilization efficiency should be at least 60%
**Validates: Requirements 2.5**

### Property 6: Lab Course Room Type Constraint
*For any* course requiring laboratory facilities, the assigned room must have type "lab"
**Validates: Requirements 3.1**

### Property 7: Lecture Course Room Type Preference
*For any* standard lecture course, the assigned room should have type "lecture" or "tutorial"
**Validates: Requirements 3.2**

### Property 8: Facility Requirement Matching
*For any* course with specific facility requirements, the assigned room should provide all required facilities
**Validates: Requirements 3.3**

### Property 9: Facility Superset Fallback
*For any* course where no exact facility match exists, the assigned room should have a superset of required facilities
**Validates: Requirements 3.4**

### Property 10: Room Type Compatibility
*For any* course assignment, the room type should never be incompatible with the course requirements
**Validates: Requirements 3.5**

### Property 11: Conflict Detection Accuracy
*For any* room assignment attempt, the algorithm should correctly detect existing time slot conflicts
**Validates: Requirements 4.1**

### Property 12: Alternative Room Selection
*For any* scenario where the preferred room is unavailable, the algorithm should select the next best alternative based on utilization and suitability scores
**Validates: Requirements 4.2**

### Property 13: Conflict Flagging Completeness
*For any* impossible assignment scenario, the algorithm should flag it as a conflict with detailed reasoning
**Validates: Requirements 4.3**

### Property 14: Overall Conflict Rate Limit
*For any* generated timetable, the total conflict rate should be less than 10% of all scheduled sessions
**Validates: Requirements 4.5**

### Property 15: Statistics Generation Completeness
*For any* completed allocation process, utilization statistics should be generated for every room in the system
**Validates: Requirements 5.1**

### Property 16: Capacity Efficiency Calculation
*For any* room assignment, the capacity efficiency ratio should be calculated and available in the metrics
**Validates: Requirements 5.2**

## Error Handling

### Room Unavailability
- **Detection**: Check room availability before assignment
- **Response**: Find alternative rooms with similar characteristics
- **Fallback**: Flag as conflict with suggested resolution

### Capacity Mismatch
- **Detection**: Compare expected class size with room capacity
- **Response**: Prefer rooms with appropriate capacity range
- **Fallback**: Accept suboptimal capacity with efficiency warning

### Facility Requirements Not Met
- **Detection**: Validate required facilities against room facilities
- **Response**: Find rooms with required or compatible facilities
- **Fallback**: Assign best available room with facility conflict flag

### Utilization Imbalance
- **Detection**: Monitor utilization variance during allocation
- **Response**: Redirect assignments to underutilized rooms
- **Fallback**: Accept imbalance with rebalancing suggestions

## Testing Strategy

### Unit Testing
- Test room suitability scoring algorithms
- Verify utilization tracking accuracy
- Validate conflict detection logic
- Test capacity matching calculations

### Property-Based Testing
- **Framework**: fast-check (JavaScript property testing library)
- **Test Configuration**: Minimum 100 iterations per property
- **Property Tests**: Each correctness property will be implemented as a separate property-based test

**Property Test 1: Room Utilization Balance**
```typescript
// **Feature: efficient-room-allocation, Property 1: Room Utilization Balance**
test('room utilization balance property', () => {
  fc.assert(fc.property(
    fc.array(courseGenerator, {minLength: 5, maxLength: 20}),
    fc.array(roomGenerator, {minLength: 3, maxLength: 10}),
    (courses, rooms) => {
      const result = allocateRooms(courses, rooms);
      const utilizations = result.roomUtilization;
      const max = Math.max(...utilizations.values());
      const min = Math.min(...utilizations.values());
      return (max - min) <= 30;
    }
  ));
});
```

**Property Test 2: Capacity Efficiency**
```typescript
// **Feature: efficient-room-allocation, Property 2: Capacity Efficiency**
test('capacity efficiency property', () => {
  fc.assert(fc.property(
    fc.array(courseWithSizeGenerator),
    fc.array(roomWithCapacityGenerator),
    (courses, rooms) => {
      const allocations = allocateRooms(courses, rooms);
      return allocations.every(allocation => {
        const efficiency = allocation.course.expectedSize / allocation.room.capacity;
        return efficiency >= 0.4 && efficiency <= 0.95;
      });
    }
  ));
});
```

### Integration Testing
- Test complete allocation workflow
- Verify database integration
- Test API endpoint responses
- Validate metrics generation

### Performance Testing
- Measure allocation time for large datasets
- Test memory usage with multiple concurrent allocations
- Validate scalability with increasing room/course counts