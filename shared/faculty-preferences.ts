import { 
  FacultyRoomPreference, 
  FacultyTimePreference, 
  FacultySubjectPreference,
  PreferenceHistory,
  PreferencePriority,
  ExpertiseLevel,
  SatisfactionLevel,
  RoomType,
  DayOfWeek 
} from './schema';

// Re-export types for external use
export type { PreferencePriority, ExpertiseLevel, SatisfactionLevel, RoomType, DayOfWeek };

// Core preference interfaces from design document
export interface FacultyPreferences {
  facultyId: string;
  roomPreferences: RoomPreference[];
  timePreferences: TimePreference[];
  subjectPreferences: SubjectPreference[];
  constraints: PreferenceConstraint[];
  lastUpdated: Date;
}

export interface RoomPreference {
  roomId?: string;
  roomType?: RoomType;
  building?: string;
  facilities?: string[];
  priority: PreferencePriority;
  weight: number; // 0-100
}

export interface TimePreference {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  priority: PreferencePriority;
  weight: number; // 0-100
  isHardConstraint: boolean;
}

export interface SubjectPreference {
  courseCode: string;
  expertiseLevel: ExpertiseLevel;
  priority: PreferencePriority;
  weight: number; // 0-100
}

export interface PreferenceConstraint {
  id: string;
  type: ConstraintType;
  description: string;
  isHardConstraint: boolean;
  priority: number;
  conditions: ConstraintCondition[];
}

export type ConstraintType = 'time_unavailable' | 'room_incompatible' | 'subject_expertise' | 'workload_limit';

export interface ConstraintCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: any;
}

// Preference scoring interfaces
export interface PreferenceScore {
  score: number; // 0-100
  matchedPreferences: string[];
  violatedConstraints: string[];
  suggestions: string[];
}

export interface OverallPreferenceScore {
  roomScore: number;
  timeScore: number;
  subjectScore: number;
  overallScore: number;
  satisfactionLevel: SatisfactionLevel;
  detailedBreakdown: PreferenceBreakdown;
}

export interface PreferenceBreakdown {
  roomMatches: number;
  timeMatches: number;
  subjectMatches: number;
  totalPreferences: number;
  constraintViolations: number;
}

// Enhanced faculty profile
export interface PreferenceProfile {
  flexibilityScore: number; // How flexible the faculty is with preferences
  priorityWeights: {
    room: number;
    time: number;
    subject: number;
  };
  lastPreferenceUpdate: Date;
  preferenceCompleteness: number; // Percentage of preferences filled out
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// Preference analytics interfaces
export interface PreferenceAnalytics {
  facultyId: string;
  satisfactionMetrics: SatisfactionMetrics;
  preferenceUtilization: PreferenceUtilization;
  conflictAnalysis: ConflictAnalysis;
  improvementSuggestions: ImprovementSuggestion[];
}

export interface SatisfactionMetrics {
  overallSatisfaction: number;
  roomSatisfaction: number;
  timeSatisfaction: number;
  subjectSatisfaction: number;
  trendData: SatisfactionTrend[];
}

export interface SatisfactionTrend {
  date: string;
  satisfaction: number;
  category: 'room' | 'time' | 'subject' | 'overall';
}

export interface PreferenceUtilization {
  roomPreferencesUsed: number;
  timePreferencesUsed: number;
  subjectPreferencesUsed: number;
  totalPreferences: number;
  utilizationRate: number;
}

export interface ConflictAnalysis {
  totalConflicts: number;
  conflictsByType: Record<string, number>;
  resolutionSuggestions: string[];
}

export interface ImprovementSuggestion {
  type: 'preference' | 'constraint' | 'flexibility';
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionRequired: string;
}

// Database model conversion utilities
export function convertToRoomPreference(dbPreference: FacultyRoomPreference): RoomPreference {
  return {
    roomId: dbPreference.roomId || undefined,
    roomType: dbPreference.roomType as RoomType || undefined,
    building: dbPreference.building || undefined,
    facilities: dbPreference.facilities || undefined,
    priority: dbPreference.priority as PreferencePriority,
    weight: dbPreference.weight,
  };
}

export function convertToTimePreference(dbPreference: FacultyTimePreference): TimePreference {
  return {
    day: dbPreference.day as DayOfWeek,
    startTime: dbPreference.startTime,
    endTime: dbPreference.endTime,
    priority: dbPreference.priority as PreferencePriority,
    weight: dbPreference.weight,
    isHardConstraint: dbPreference.isHardConstraint,
  };
}

export function convertToSubjectPreference(dbPreference: FacultySubjectPreference): SubjectPreference {
  return {
    courseCode: dbPreference.courseCode,
    expertiseLevel: dbPreference.expertiseLevel as ExpertiseLevel,
    priority: dbPreference.priority as PreferencePriority,
    weight: dbPreference.weight,
  };
}

// Reverse conversion utilities (for saving to database)
export function convertFromRoomPreference(preference: RoomPreference, facultyId: string): Omit<FacultyRoomPreference, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    facultyId,
    roomId: preference.roomId || null,
    roomType: preference.roomType || null,
    building: preference.building || null,
    facilities: preference.facilities || null,
    priority: preference.priority,
    weight: preference.weight,
  };
}

export function convertFromTimePreference(preference: TimePreference, facultyId: string): Omit<FacultyTimePreference, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    facultyId,
    day: preference.day,
    startTime: preference.startTime,
    endTime: preference.endTime,
    priority: preference.priority,
    weight: preference.weight,
    isHardConstraint: preference.isHardConstraint,
  };
}

export function convertFromSubjectPreference(preference: SubjectPreference, facultyId: string): Omit<FacultySubjectPreference, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    facultyId,
    courseCode: preference.courseCode,
    expertiseLevel: preference.expertiseLevel,
    priority: preference.priority,
    weight: preference.weight,
  };
}

// Preference aggregation utility
export function aggregateFacultyPreferences(
  roomPrefs: FacultyRoomPreference[],
  timePrefs: FacultyTimePreference[],
  subjectPrefs: FacultySubjectPreference[],
  facultyId: string
): FacultyPreferences {
  return {
    facultyId,
    roomPreferences: roomPrefs.map(convertToRoomPreference),
    timePreferences: timePrefs.map(convertToTimePreference),
    subjectPreferences: subjectPrefs.map(convertToSubjectPreference),
    constraints: [], // Will be populated by constraint system
    lastUpdated: new Date(),
  };
}

// Preference completeness calculator
export function calculatePreferenceCompleteness(preferences: FacultyPreferences): number {
  const totalCategories = 3; // room, time, subject
  let completedCategories = 0;
  
  if (preferences.roomPreferences.length > 0) completedCategories++;
  if (preferences.timePreferences.length > 0) completedCategories++;
  if (preferences.subjectPreferences.length > 0) completedCategories++;
  
  return Math.round((completedCategories / totalCategories) * 100);
}