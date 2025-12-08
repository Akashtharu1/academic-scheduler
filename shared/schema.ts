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

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default('student'),
  department: text("department"),
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
  availability: jsonb("availability"),
});

export const facultyRelations = relations(faculty, ({ one }) => ({
  user: one(users, {
    fields: [faculty.userId],
    references: [users.id],
  }),
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

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

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
