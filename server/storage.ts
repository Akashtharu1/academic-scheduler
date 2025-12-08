import {
  users,
  faculty,
  courses,
  rooms,
  timetables,
  scheduledSlots,
  refreshTokens,
  type User,
  type InsertUser,
  type Faculty,
  type InsertFaculty,
  type Course,
  type InsertCourse,
  type Room,
  type InsertRoom,
  type Timetable,
  type InsertTimetable,
  type ScheduledSlot,
  type InsertScheduledSlot,
  type RefreshToken,
  type InsertRefreshToken,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  
  getAllFaculty(): Promise<Faculty[]>;
  getFaculty(id: string): Promise<Faculty | undefined>;
  createFaculty(data: InsertFaculty): Promise<Faculty>;
  updateFaculty(id: string, data: Partial<InsertFaculty>): Promise<Faculty | undefined>;
  deleteFaculty(id: string): Promise<boolean>;
  
  getAllCourses(): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  createCourse(data: InsertCourse): Promise<Course>;
  updateCourse(id: string, data: Partial<InsertCourse>): Promise<Course | undefined>;
  deleteCourse(id: string): Promise<boolean>;
  
  getAllRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | undefined>;
  createRoom(data: InsertRoom): Promise<Room>;
  updateRoom(id: string, data: Partial<InsertRoom>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<boolean>;
  
  getAllTimetables(): Promise<Timetable[]>;
  getTimetable(id: string): Promise<Timetable | undefined>;
  createTimetable(data: InsertTimetable): Promise<Timetable>;
  updateTimetable(id: string, data: Partial<InsertTimetable>): Promise<Timetable | undefined>;
  deleteTimetable(id: string): Promise<boolean>;
  
  getScheduledSlots(timetableId: string): Promise<ScheduledSlot[]>;
  createScheduledSlot(data: InsertScheduledSlot): Promise<ScheduledSlot>;
  deleteScheduledSlotsByTimetable(timetableId: string): Promise<boolean>;
  
  createRefreshToken(data: InsertRefreshToken): Promise<RefreshToken>;
  getValidRefreshToken(tokenHash: string): Promise<RefreshToken | undefined>;
  revokeRefreshToken(id: string): Promise<boolean>;
  revokeAllUserRefreshTokens(userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async getAllFaculty(): Promise<Faculty[]> {
    return db.select().from(faculty);
  }

  async getFaculty(id: string): Promise<Faculty | undefined> {
    const [f] = await db.select().from(faculty).where(eq(faculty.id, id));
    return f || undefined;
  }

  async createFaculty(data: InsertFaculty): Promise<Faculty> {
    const [f] = await db.insert(faculty).values(data).returning();
    return f;
  }

  async updateFaculty(id: string, data: Partial<InsertFaculty>): Promise<Faculty | undefined> {
    const [f] = await db.update(faculty).set(data).where(eq(faculty.id, id)).returning();
    return f || undefined;
  }

  async deleteFaculty(id: string): Promise<boolean> {
    const result = await db.delete(faculty).where(eq(faculty.id, id));
    return true;
  }

  async getAllCourses(): Promise<Course[]> {
    return db.select().from(courses);
  }

  async getCourse(id: string): Promise<Course | undefined> {
    const [c] = await db.select().from(courses).where(eq(courses.id, id));
    return c || undefined;
  }

  async createCourse(data: InsertCourse): Promise<Course> {
    const [c] = await db.insert(courses).values(data).returning();
    return c;
  }

  async updateCourse(id: string, data: Partial<InsertCourse>): Promise<Course | undefined> {
    const [c] = await db.update(courses).set(data).where(eq(courses.id, id)).returning();
    return c || undefined;
  }

  async deleteCourse(id: string): Promise<boolean> {
    await db.delete(courses).where(eq(courses.id, id));
    return true;
  }

  async getAllRooms(): Promise<Room[]> {
    return db.select().from(rooms);
  }

  async getRoom(id: string): Promise<Room | undefined> {
    const [r] = await db.select().from(rooms).where(eq(rooms.id, id));
    return r || undefined;
  }

  async createRoom(data: InsertRoom): Promise<Room> {
    const [r] = await db.insert(rooms).values(data).returning();
    return r;
  }

  async updateRoom(id: string, data: Partial<InsertRoom>): Promise<Room | undefined> {
    const [r] = await db.update(rooms).set(data).where(eq(rooms.id, id)).returning();
    return r || undefined;
  }

  async deleteRoom(id: string): Promise<boolean> {
    await db.delete(rooms).where(eq(rooms.id, id));
    return true;
  }

  async getAllTimetables(): Promise<Timetable[]> {
    return db.select().from(timetables);
  }

  async getTimetable(id: string): Promise<Timetable | undefined> {
    const [t] = await db.select().from(timetables).where(eq(timetables.id, id));
    return t || undefined;
  }

  async createTimetable(data: InsertTimetable): Promise<Timetable> {
    const [t] = await db.insert(timetables).values(data).returning();
    return t;
  }

  async updateTimetable(id: string, data: Partial<InsertTimetable>): Promise<Timetable | undefined> {
    const [t] = await db.update(timetables).set(data).where(eq(timetables.id, id)).returning();
    return t || undefined;
  }

  async deleteTimetable(id: string): Promise<boolean> {
    await db.delete(scheduledSlots).where(eq(scheduledSlots.timetableId, id));
    await db.delete(timetables).where(eq(timetables.id, id));
    return true;
  }

  async getScheduledSlots(timetableId: string): Promise<ScheduledSlot[]> {
    return db.select().from(scheduledSlots).where(eq(scheduledSlots.timetableId, timetableId));
  }

  async createScheduledSlot(data: InsertScheduledSlot): Promise<ScheduledSlot> {
    const [s] = await db.insert(scheduledSlots).values(data).returning();
    return s;
  }

  async deleteScheduledSlotsByTimetable(timetableId: string): Promise<boolean> {
    await db.delete(scheduledSlots).where(eq(scheduledSlots.timetableId, timetableId));
    return true;
  }

  async createRefreshToken(data: InsertRefreshToken): Promise<RefreshToken> {
    const [token] = await db.insert(refreshTokens).values(data).returning();
    return token;
  }

  async getValidRefreshToken(tokenHash: string): Promise<RefreshToken | undefined> {
    const [token] = await db.select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt)
        )
      );
    return token || undefined;
  }

  async revokeRefreshToken(id: string): Promise<boolean> {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, id));
    return true;
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<boolean> {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt)
        )
      );
    return true;
  }
}

export const storage = new DatabaseStorage();
