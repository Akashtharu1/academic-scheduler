import { Room, Course, RoomType } from './schema';

// Time slot representation for allocation
export interface TimeSlot {
  day: string;
  startTime: string;
  endTime: string;
}

// Enhanced course requirements for allocation
export interface CourseRequirements {
  courseId: string;
  expectedSize: number;
  requiredRoomType: RoomType[];
  requiredFacilities: string[];
  preferredCapacityRange: [number, number];
  priority: 'high' | 'medium' | 'low';
}

// Room suitability scoring
export interface SuitabilityScore {
  capacityScore: number;    // 0-100, higher is better match
  typeScore: number;        // 0-100, room type appropriateness
  facilityScore: number;    // 0-100, facility match quality
  overallScore: number;     // Weighted combination
}

// Room utilization tracking
export interface UtilizationBalance {
  maxUtilization: number;
  minUtilization: number;
  averageUtilization: number;
  standardDeviation: number;
  isBalanced: boolean;
}

// Allocation result
export interface AllocationResult {
  selectedRoom: Room | null;
  confidence: number;
  alternativeRooms: Room[];
  conflicts: AllocationConflict[];
  reasoning: string;
}

// Enhanced conflict type for allocation
export interface AllocationConflict {
  type: 'room_unavailable' | 'capacity_mismatch' | 'facility_missing' | 'type_incompatible';
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion?: string;
  affectedTimeSlot?: TimeSlot;
}

// Room candidate for selection
export interface RoomCandidate {
  room: Room;
  suitabilityScore: SuitabilityScore;
  currentUtilization: number;
  isAvailable: boolean;
}

// Conflict resolution options
export interface ConflictResolution {
  canResolve: boolean;
  alternativeTimeSlots: TimeSlot[];
  alternativeRooms: Room[];
  suggestedActions: string[];
}

// Allocation metrics
export interface AllocationMetrics {
  roomUtilization: Map<string, number>;
  capacityEfficiency: Map<string, number>;
  typeMatchAccuracy: number;
  facilityMatchRate: number;
  conflictRate: number;
  balanceScore: number;
  totalAllocations: number;
  successfulAllocations: number;
}

// Room analyzer interface
export interface RoomAnalyzer {
  evaluateRoomSuitability(room: Room, requirements: CourseRequirements): SuitabilityScore;
  calculateCapacityMatch(roomCapacity: number, expectedSize: number): number;
  checkFacilityRequirements(room: Room, requirements: CourseRequirements): boolean;
  checkRoomTypeCompatibility(roomType: RoomType, requiredTypes: RoomType[]): boolean;
}

// Utilization tracker interface
export interface UtilizationTracker {
  getCurrentUtilization(roomId: string): number;
  getUtilizationBalance(): UtilizationBalance;
  updateUtilization(roomId: string, timeSlot: TimeSlot): void;
  getLowestUtilizedRooms(count: number): Room[];
  resetUtilization(): void;
  getUtilizationStats(): Map<string, number>;
}

// Allocation engine interface
export interface AllocationEngine {
  allocateRoom(
    requirements: CourseRequirements, 
    timeSlot: TimeSlot, 
    availableRooms: Room[]
  ): AllocationResult;
  findBestRoom(candidates: RoomCandidate[]): Room | null;
  handleNoAvailableRooms(
    requirements: CourseRequirements, 
    timeSlot: TimeSlot
  ): AllocationResult;
  generateMetrics(): AllocationMetrics;
  reset(): void;
  isSlotAvailable(roomId: string, timeSlot: TimeSlot): boolean;
}

// Conflict resolver interface
export interface ConflictResolver {
  detectConflicts(
    room: Room, 
    timeSlot: TimeSlot, 
    existingAllocations: Map<string, string>
  ): AllocationConflict[];
  suggestAlternatives(
    requirements: CourseRequirements, 
    timeSlot: TimeSlot, 
    availableRooms: Room[]
  ): ConflictResolution;
  resolveConflict(conflict: AllocationConflict): ConflictResolution;
}

// Main room allocation service interface
export interface RoomAllocationService {
  analyzer: RoomAnalyzer;
  tracker: UtilizationTracker;
  engine: AllocationEngine;
  resolver: ConflictResolver;
  
  allocateRoomsForTimetable(
    courses: Course[], 
    rooms: Room[], 
    timeSlots: TimeSlot[]
  ): Promise<AllocationResult[]>;
  
  getMetrics(): AllocationMetrics;
  reset(): void;
}

// Configuration for allocation algorithm
export interface AllocationConfig {
  weights: {
    capacity: number;      // Weight for capacity matching (0-1)
    roomType: number;      // Weight for room type matching (0-1)
    facilities: number;    // Weight for facility matching (0-1)
    utilization: number;   // Weight for utilization balancing (0-1)
  };
  thresholds: {
    maxUtilizationSpread: number;  // Max difference between highest and lowest utilization
    minCapacityEfficiency: number; // Minimum acceptable capacity efficiency
    maxConflictRate: number;       // Maximum acceptable conflict rate
  };
  preferences: {
    balanceUtilization: boolean;   // Whether to prioritize utilization balancing
    strictTypeMatching: boolean;   // Whether room type matching is strict
    allowCapacityOverflow: boolean; // Whether to allow classes larger than room capacity
  };
}

// Default configuration
export const DEFAULT_ALLOCATION_CONFIG: AllocationConfig = {
  weights: {
    capacity: 0.35,      // Higher weight for capacity matching
    roomType: 0.30,      // Higher weight for room type (important for labs)
    facilities: 0.25,    // Important for specialized courses
    utilization: 0.10,   // Lower weight to prioritize suitability over balance
  },
  thresholds: {
    maxUtilizationSpread: 25, // 25% max difference (tighter control)
    minCapacityEfficiency: 0.5, // 50% minimum efficiency (more flexible)
    maxConflictRate: 0.15, // 15% max conflicts (slightly more tolerant)
  },
  preferences: {
    balanceUtilization: true,
    strictTypeMatching: true,  // Strict for academic safety (labs need proper rooms)
    allowCapacityOverflow: false, // Don't allow overflow for safety reasons
  },
};