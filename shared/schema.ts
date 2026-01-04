import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export type UserRole = 'admin' | 'faculty' | 'student';
export type RoomType = 'lecture' | 'lab' | 'tutorial';
export type TimetableStatus = 'draft' | 'active' | 'archived';
export type ConflictType = 'room' | 'faculty' | 'student' | 'preference';
export type ConflictSeverity = 'high' | 'medium' | 'low';
export type SlotStatus = 'ok' | 'conflict' | 'warning';
export type GenerationMethod = 'GA' | 'DRL' | 'OR';
export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

// Faculty Preference Types
export type PreferencePriority = 'high' | 'medium' | 'low';
export type ExpertiseLevel = 'expert' | 'proficient' | 'basic' | 'willing';
export type SatisfactionLevel = 'excellent' | 'good' | 'acceptable' | 'poor';

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default('student'),
  department: text("department"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  facultyProfile: one(faculty, {
    fields: [users.id],
    references: [faculty.userId],
  }),
}));

export const faculty = pgTable("faculty", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department").notNull(),
  maxHoursPerWeek: integer("max_hours_per_week").notNull().default(20),
  preferences: text("preferences").array(),
  preferredSubjects: text("preferred_subjects").array(), // Course codes the faculty prefers to teach
  availability: jsonb("availability"),
});

export const facultyRelations = relations(faculty, ({ one, many }) => ({
  user: one(users, {
    fields: [faculty.userId],
    references: [users.id],
  }),
  roomPreferences: many(facultyRoomPreferences),
  timePreferences: many(facultyTimePreferences),
  subjectPreferences: many(facultySubjectPreferences),
  preferenceHistory: many(preferenceHistory),
}));

export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  semester: integer("semester").notNull(),
  credits: integer("credits").notNull(),
  lectureHours: integer("lecture_hours").notNull(),
  labHours: integer("lab_hours"),
  facultyIds: text("faculty_ids").array(),
});

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  building: text("building").notNull(),
  capacity: integer("capacity").notNull(),
  type: text("type").notNull().default('lecture'),
  facilities: text("facilities").array(),
  availability: jsonb("availability"),
});

export const timeSlots = pgTable("time_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  day: text("day").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  duration: integer("duration").notNull(),
});

export const timetables = pgTable("timetables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  versionId: text("version_id").notNull(),
  department: text("department").notNull(),
  semester: integer("semester").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  status: text("status").notNull().default('draft'),
  conflictCount: integer("conflict_count").default(0),
  roomUtilization: integer("room_utilization").default(0),
  teacherLoad: integer("teacher_load").default(0),
});

export const timetablesRelations = relations(timetables, ({ one, many }) => ({
  creator: one(users, {
    fields: [timetables.createdBy],
    references: [users.id],
  }),
  scheduledSlots: many(scheduledSlots),
}));

export const scheduledSlots = pgTable("scheduled_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timetableId: varchar("timetable_id").references(() => timetables.id, { onDelete: 'cascade' }).notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  facultyId: varchar("faculty_id").references(() => faculty.id, { onDelete: 'cascade' }).notNull(),
  roomId: varchar("room_id").references(() => rooms.id, { onDelete: 'cascade' }).notNull(),
  day: text("day").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status").notNull().default('ok'),
  conflicts: jsonb("conflicts"),
});

export const scheduledSlotsRelations = relations(scheduledSlots, ({ one }) => ({
  timetable: one(timetables, {
    fields: [scheduledSlots.timetableId],
    references: [timetables.id],
  }),
  course: one(courses, {
    fields: [scheduledSlots.courseId],
    references: [courses.id],
  }),
  facultyMember: one(faculty, {
    fields: [scheduledSlots.facultyId],
    references: [faculty.id],
  }),
  room: one(rooms, {
    fields: [scheduledSlots.roomId],
    references: [rooms.id],
  }),
}));

// Faculty Preference Tables
export const facultyRoomPreferences = pgTable("faculty_room_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facultyId: varchar("faculty_id").references(() => faculty.id, { onDelete: 'cascade' }).notNull(),
  roomId: varchar("room_id").references(() => rooms.id, { onDelete: 'cascade' }),
  roomType: text("room_type"),
  building: text("building"),
  facilities: text("facilities").array(),
  priority: text("priority").notNull().default('medium'),
  weight: integer("weight").notNull().default(50),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const facultyTimePreferences = pgTable("faculty_time_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facultyId: varchar("faculty_id").references(() => faculty.id, { onDelete: 'cascade' }).notNull(),
  day: text("day").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  priority: text("priority").notNull().default('medium'),
  weight: integer("weight").notNull().default(50),
  isHardConstraint: boolean("is_hard_constraint").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const facultySubjectPreferences = pgTable("faculty_subject_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facultyId: varchar("faculty_id").references(() => faculty.id, { onDelete: 'cascade' }).notNull(),
  courseCode: text("course_code").notNull(),
  expertiseLevel: text("expertise_level").notNull().default('willing'),
  priority: text("priority").notNull().default('medium'),
  weight: integer("weight").notNull().default(50),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const preferenceHistory = pgTable("preference_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facultyId: varchar("faculty_id").references(() => faculty.id, { onDelete: 'cascade' }).notNull(),
  preferenceType: text("preference_type").notNull(), // 'room', 'time', 'subject'
  preferenceId: varchar("preference_id").notNull(), // ID of the specific preference record
  action: text("action").notNull(), // 'created', 'updated', 'deleted'
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  changedBy: varchar("changed_by").references(() => users.id),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

// Faculty Preference Relations
export const facultyRoomPreferencesRelations = relations(facultyRoomPreferences, ({ one }) => ({
  faculty: one(faculty, {
    fields: [facultyRoomPreferences.facultyId],
    references: [faculty.id],
  }),
  room: one(rooms, {
    fields: [facultyRoomPreferences.roomId],
    references: [rooms.id],
  }),
}));

export const facultyTimePreferencesRelations = relations(facultyTimePreferences, ({ one }) => ({
  faculty: one(faculty, {
    fields: [facultyTimePreferences.facultyId],
    references: [faculty.id],
  }),
}));

export const facultySubjectPreferencesRelations = relations(facultySubjectPreferences, ({ one }) => ({
  faculty: one(faculty, {
    fields: [facultySubjectPreferences.facultyId],
    references: [faculty.id],
  }),
}));

export const preferenceHistoryRelations = relations(preferenceHistory, ({ one }) => ({
  faculty: one(faculty, {
    fields: [preferenceHistory.facultyId],
    references: [faculty.id],
  }),
  changedByUser: one(users, {
    fields: [preferenceHistory.changedBy],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

// Faculty Preference Schemas
export const insertFacultyRoomPreferenceSchema = createInsertSchema(facultyRoomPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFacultyTimePreferenceSchema = createInsertSchema(facultyTimePreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFacultySubjectPreferenceSchema = createInsertSchema(facultySubjectPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPreferenceHistorySchema = createInsertSchema(preferenceHistory).omit({ id: true, createdAt: true });

export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({ id: true, createdAt: true });
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertFacultySchema = createInsertSchema(faculty).omit({ id: true });
export const insertCourseSchema = createInsertSchema(courses).omit({ id: true });
export const insertRoomSchema = createInsertSchema(rooms).omit({ id: true });
export const insertTimeSlotSchema = createInsertSchema(timeSlots).omit({ id: true });
export const insertTimetableSchema = createInsertSchema(timetables).omit({ id: true, createdAt: true });
export const insertScheduledSlotSchema = createInsertSchema(scheduledSlots).omit({ id: true });

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = insertUserSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Faculty Preference Validation Schemas
export const roomPreferenceSchema = z.object({
  roomId: z.string().optional(),
  roomType: z.enum(['lecture', 'lab', 'tutorial']).optional(),
  building: z.string().optional(),
  facilities: z.array(z.string()).optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  weight: z.number().min(0).max(100).default(50),
});

export const timePreferenceSchema = z.object({
  day: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  weight: z.number().min(0).max(100).default(50),
  isHardConstraint: z.boolean().default(false),
}).refine((data) => {
  const start = new Date(`1970-01-01T${data.startTime}:00`);
  const end = new Date(`1970-01-01T${data.endTime}:00`);
  return start < end;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

export const subjectPreferenceSchema = z.object({
  courseCode: z.string().min(1, "Course code is required"),
  expertiseLevel: z.enum(['expert', 'proficient', 'basic', 'willing']).default('willing'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  weight: z.number().min(0).max(100).default(50),
});

export const preferenceConstraintSchema = z.object({
  id: z.string(),
  type: z.enum(['time_unavailable', 'room_incompatible', 'subject_expertise', 'workload_limit']),
  description: z.string().min(1, "Description is required"),
  isHardConstraint: z.boolean().default(false),
  priority: z.number().min(1).max(10).default(5),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']),
    value: z.any(),
  })),
});

export const facultyPreferencesSchema = z.object({
  facultyId: z.string().min(1, "Faculty ID is required"),
  roomPreferences: z.array(roomPreferenceSchema).default([]),
  timePreferences: z.array(timePreferenceSchema).default([]),
  subjectPreferences: z.array(subjectPreferenceSchema).default([]),
  constraints: z.array(preferenceConstraintSchema).default([]),
  lastUpdated: z.date().optional(),
});

export const preferenceValidationSchema = z.object({
  roomPreferences: z.array(roomPreferenceSchema).optional(),
  timePreferences: z.array(timePreferenceSchema).optional(),
  subjectPreferences: z.array(subjectPreferenceSchema).optional(),
}).refine((data) => {
  // Ensure at least one preference type is provided
  const hasRoomPrefs = data.roomPreferences && data.roomPreferences.length > 0;
  const hasTimePrefs = data.timePreferences && data.timePreferences.length > 0;
  const hasSubjectPrefs = data.subjectPreferences && data.subjectPreferences.length > 0;
  return hasRoomPrefs || hasTimePrefs || hasSubjectPrefs;
}, {
  message: "At least one type of preference must be specified",
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertFaculty = z.infer<typeof insertFacultySchema>;
export type Faculty = typeof faculty.$inferSelect;

export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

export type InsertTimeSlot = z.infer<typeof insertTimeSlotSchema>;
export type TimeSlot = typeof timeSlots.$inferSelect;

export type InsertTimetable = z.infer<typeof insertTimetableSchema>;
export type Timetable = typeof timetables.$inferSelect;

export type InsertScheduledSlot = z.infer<typeof insertScheduledSlotSchema>;
export type ScheduledSlot = typeof scheduledSlots.$inferSelect;

// Faculty Preference Types
export type InsertFacultyRoomPreference = z.infer<typeof insertFacultyRoomPreferenceSchema>;
export type FacultyRoomPreference = typeof facultyRoomPreferences.$inferSelect;

export type InsertFacultyTimePreference = z.infer<typeof insertFacultyTimePreferenceSchema>;
export type FacultyTimePreference = typeof facultyTimePreferences.$inferSelect;

export type InsertFacultySubjectPreference = z.infer<typeof insertFacultySubjectPreferenceSchema>;
export type FacultySubjectPreference = typeof facultySubjectPreferences.$inferSelect;

export type InsertPreferenceHistory = z.infer<typeof insertPreferenceHistorySchema>;
export type PreferenceHistory = typeof preferenceHistory.$inferSelect;

// Enhanced Faculty interface with preferences
export interface FacultyWithPreferences extends Faculty {
  roomPreferences?: FacultyRoomPreference[];
  timePreferences?: FacultyTimePreference[];
  subjectPreferences?: FacultySubjectPreference[];
  preferenceHistory?: PreferenceHistory[];
  preferenceProfile?: PreferenceProfile;
}

export interface PreferenceProfile {
  flexibilityScore: number; // How flexible the faculty is with preferences (0-100)
  priorityWeights: {
    room: number;
    time: number;
    subject: number;
  };
  lastPreferenceUpdate: Date | null;
  preferenceCompleteness: number; // Percentage of preferences filled out (0-100)
}

// Preference validation types
export type RoomPreferenceInput = z.infer<typeof roomPreferenceSchema>;
export type TimePreferenceInput = z.infer<typeof timePreferenceSchema>;
export type SubjectPreferenceInput = z.infer<typeof subjectPreferenceSchema>;
export type FacultyPreferencesInput = z.infer<typeof facultyPreferencesSchema>;
export type PreferenceConstraintInput = z.infer<typeof preferenceConstraintSchema>;
export type PreferenceValidationInput = z.infer<typeof preferenceValidationSchema>;

export interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  description: string;
  suggestion?: string;
}

export interface GenerateParams {
  deptId: string;
  semester: number;
  weights: {
    hardPenalty: number;
    teacherPref: number;
    roomUtil: number;
  };
  method: GenerationMethod;
  seed?: number;
}

export interface Analytics {
  roomUtilization: {
    roomId: string;
    roomName: string;
    utilization: number;
    totalHours: number;
    usedHours: number;
  }[];
  teacherLoad: {
    facultyId: string;
    facultyName: string;
    hours: number;
    maxHours: number;
    percentage: number;
  }[];
  conflictStats: {
    total: number;
    byType: Record<string, number>;
    trend: { date: string; count: number }[];
  };
}
