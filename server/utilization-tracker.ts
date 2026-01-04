import { Room } from '@shared/schema';
import { 
  UtilizationTracker, 
  UtilizationBalance, 
  TimeSlot,
  AllocationConfig,
  DEFAULT_ALLOCATION_CONFIG 
} from '@shared/room-allocation';

export class UtilizationTrackerImpl implements UtilizationTracker {
  private roomUtilization: Map<string, number> = new Map();
  private roomSlotCount: Map<string, number> = new Map();
  private totalSlots: number = 0;
  private rooms: Room[] = [];
  private config: AllocationConfig;

  constructor(rooms: Room[], totalTimeSlots: number, config: AllocationConfig = DEFAULT_ALLOCATION_CONFIG) {
    this.rooms = rooms;
    this.totalSlots = totalTimeSlots;
    this.config = config;
    this.initializeUtilization();
  }

  private initializeUtilization(): void {
    // Initialize all rooms with 0 utilization
    for (const room of this.rooms) {
      this.roomUtilization.set(room.id, 0);
      this.roomSlotCount.set(room.id, 0);
    }
  }

  getCurrentUtilization(roomId: string): number {
    return this.roomUtilization.get(roomId) || 0;
  }

  getUtilizationBalance(): UtilizationBalance {
    const utilizations = Array.from(this.roomUtilization.values());
    
    if (utilizations.length === 0) {
      return {
        maxUtilization: 0,
        minUtilization: 0,
        averageUtilization: 0,
        standardDeviation: 0,
        isBalanced: true,
      };
    }

    const maxUtilization = Math.max(...utilizations);
    const minUtilization = Math.min(...utilizations);
    const averageUtilization = utilizations.reduce((sum, util) => sum + util, 0) / utilizations.length;
    
    // Calculate standard deviation
    const variance = utilizations.reduce((sum, util) => {
      return sum + Math.pow(util - averageUtilization, 2);
    }, 0) / utilizations.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Check if balanced according to configuration
    const utilizationSpread = maxUtilization - minUtilization;
    const isBalanced = utilizationSpread <= this.config.thresholds.maxUtilizationSpread;

    return {
      maxUtilization,
      minUtilization,
      averageUtilization,
      standardDeviation,
      isBalanced,
    };
  }

  updateUtilization(roomId: string, _: TimeSlot): void {
    const currentCount = this.roomSlotCount.get(roomId) || 0;
    const newCount = currentCount + 1;
    
    this.roomSlotCount.set(roomId, newCount);
    
    // Calculate utilization as percentage of total available slots
    const utilization = this.totalSlots > 0 ? (newCount / this.totalSlots) * 100 : 0;
    this.roomUtilization.set(roomId, utilization);
  }

  getLowestUtilizedRooms(count: number): Room[] {
    // Sort rooms by utilization (lowest first)
    const sortedRooms = this.rooms
      .map(room => ({
        room,
        utilization: this.getCurrentUtilization(room.id),
      }))
      .sort((a, b) => a.utilization - b.utilization)
      .slice(0, count)
      .map(item => item.room);

    return sortedRooms;
  }

  resetUtilization(): void {
    this.roomUtilization.clear();
    this.roomSlotCount.clear();
    this.initializeUtilization();
  }

  getUtilizationStats(): Map<string, number> {
    return new Map(this.roomUtilization);
  }

  // Get rooms that are underutilized (below average)
  getUnderutilizedRooms(): Room[] {
    const balance = this.getUtilizationBalance();
    const threshold = balance.averageUtilization;
    
    return this.rooms.filter(room => {
      const utilization = this.getCurrentUtilization(room.id);
      return utilization < threshold;
    });
  }

  // Get rooms that are overutilized (above average + threshold)
  getOverutilizedRooms(): Room[] {
    const balance = this.getUtilizationBalance();
    const threshold = balance.averageUtilization + (this.config.thresholds.maxUtilizationSpread / 2);
    
    return this.rooms.filter(room => {
      const utilization = this.getCurrentUtilization(room.id);
      return utilization > threshold;
    });
  }

  // Select room based on utilization balancing strategy
  selectRoomForBalancing(availableRooms: Room[]): Room | null {
    if (availableRooms.length === 0) {
      return null;
    }

    if (availableRooms.length === 1) {
      return availableRooms[0];
    }

    // If balancing is enabled, prefer rooms with lower utilization
    if (this.config.preferences.balanceUtilization) {
      const roomsWithUtilization = availableRooms.map(room => ({
        room,
        utilization: this.getCurrentUtilization(room.id),
      }));

      // Sort by utilization (lowest first)
      roomsWithUtilization.sort((a, b) => a.utilization - b.utilization);
      
      // Check if there's a significant difference in utilization
      const lowestUtilization = roomsWithUtilization[0].utilization;
      const highestUtilization = roomsWithUtilization[roomsWithUtilization.length - 1].utilization;
      
      if (highestUtilization - lowestUtilization > 10) {
        // Significant difference - prefer lowest utilized
        return roomsWithUtilization[0].room;
      }
      
      // Similar utilization - rotate among lowest utilized rooms
      const similarUtilizationRooms = roomsWithUtilization.filter(
        item => item.utilization <= lowestUtilization + 5
      );
      
      // Simple rotation based on room ID hash
      const index = this.getRotationIndex(similarUtilizationRooms.length);
      return similarUtilizationRooms[index].room;
    }

    // No balancing - return first available
    return availableRooms[0];
  }

  private getRotationIndex(count: number): number {
    // Simple rotation based on current time to ensure different selections
    return Math.floor(Date.now() / 1000) % count;
  }

  // Get utilization efficiency score for a room
  getUtilizationEfficiency(roomId: string): number {
    const utilization = this.getCurrentUtilization(roomId);
    const balance = this.getUtilizationBalance();
    
    // Efficiency is higher when utilization is close to average
    const deviation = Math.abs(utilization - balance.averageUtilization);
    const maxDeviation = Math.max(
      balance.maxUtilization - balance.averageUtilization,
      balance.averageUtilization - balance.minUtilization
    );
    
    if (maxDeviation === 0) {
      return 100; // Perfect balance
    }
    
    return Math.max(0, 100 - (deviation / maxDeviation) * 100);
  }

  // Check if rebalancing is needed
  needsRebalancing(): boolean {
    const balance = this.getUtilizationBalance();
    return !balance.isBalanced || balance.standardDeviation > 15;
  }

  // Get rebalancing suggestions
  getRebalancingSuggestions(): {
    overutilizedRooms: Room[];
    underutilizedRooms: Room[];
    suggestedActions: string[];
  } {
    const overutilized = this.getOverutilizedRooms();
    const underutilized = this.getUnderutilizedRooms();
    const balance = this.getUtilizationBalance();
    
    const suggestedActions: string[] = [];
    
    if (overutilized.length > 0) {
      suggestedActions.push(
        `Consider moving some sessions from overutilized rooms: ${overutilized.map(r => r.name).join(', ')}`
      );
    }
    
    if (underutilized.length > 0) {
      suggestedActions.push(
        `Consider scheduling more sessions in underutilized rooms: ${underutilized.map(r => r.name).join(', ')}`
      );
    }
    
    if (balance.standardDeviation > 20) {
      suggestedActions.push(
        'High utilization variance detected. Consider redistributing sessions for better balance.'
      );
    }

    return {
      overutilizedRooms: overutilized,
      underutilizedRooms: underutilized,
      suggestedActions,
    };
  }
}