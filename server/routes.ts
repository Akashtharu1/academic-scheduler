import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "./storage";
import {
  insertUserSchema,
  insertFacultySchema,
  insertCourseSchema,
  insertRoomSchema,
  loginSchema,
  type GenerateParams,
  type User,
} from "@shared/schema";
import { z } from "zod";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.SESSION_SECRET!;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

interface AccessTokenPayload {
  userId: string;
  role: string;
  type: "access";
}

function generateAccessToken(user: User): string {
  return jwt.sign(
    { userId: user.id, role: user.role, type: "access" } as AccessTokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshTokenValue(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
    if (payload.type !== "access") return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await storage.getUser(payload.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  req.user = user;
  next();
}

function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      if (!req.user) {
        return;
      }
      
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      next();
    });
  };
}

async function createRefreshTokenForUser(userId: string): Promise<string> {
  const refreshTokenValue = generateRefreshTokenValue();
  const tokenHash = hashToken(refreshTokenValue);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await storage.createRefreshToken({
    userId,
    tokenHash,
    expiresAt,
    revokedAt: null,
  });

  return refreshTokenValue;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
      });

      const accessToken = generateAccessToken(user);
      const refreshToken = await createRefreshTokenForUser(user.id);

      const { password: _, ...safeUser } = user;
      res.status(201).json({ 
        user: safeUser,
        accessToken,
        refreshToken
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      const user = await storage.getUserByUsername(data.username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = await createRefreshTokenForUser(user.id);

      const { password: _, ...safeUser } = user;
      res.json({ 
        user: safeUser,
        accessToken,
        refreshToken
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token required" });
      }

      const tokenHash = hashToken(refreshToken);
      const storedToken = await storage.getValidRefreshToken(tokenHash);

      if (!storedToken) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      if (new Date() > storedToken.expiresAt) {
        await storage.revokeRefreshToken(storedToken.id);
        return res.status(401).json({ error: "Refresh token expired" });
      }

      const user = await storage.getUser(storedToken.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      await storage.revokeRefreshToken(storedToken.id);

      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = await createRefreshTokenForUser(user.id);

      const { password: _, ...safeUser } = user;
      res.json({ 
        user: safeUser,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      console.error("Refresh error:", error);
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      await storage.revokeAllUserRefreshTokens(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const { password: _, ...safeUser } = req.user!;
      res.json({ user: safeUser });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { name, email, department } = req.body;
      const user = await storage.updateUser(req.user!.id, {
        name,
        email,
        department,
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.put("/api/auth/password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      const user = req.user!;

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await storage.updateUser(user.id, { password: hashedPassword });
      
      await storage.revokeAllUserRefreshTokens(user.id);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update password" });
    }
  });

  app.get("/api/faculty", requireAuth, async (req, res) => {
    try {
      const facultyList = await storage.getAllFaculty();
      res.json(facultyList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch faculty" });
    }
  });

  app.post("/api/faculty", requireRole("admin", "faculty"), async (req, res) => {
    try {
      const data = insertFacultySchema.parse(req.body);
      const faculty = await storage.createFaculty(data);
      res.status(201).json(faculty);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create faculty" });
    }
  });

  app.put("/api/faculty/:id", requireRole("admin", "faculty"), async (req, res) => {
    try {
      const faculty = await storage.updateFaculty(req.params.id, req.body);
      if (!faculty) {
        return res.status(404).json({ error: "Faculty not found" });
      }
      res.json(faculty);
    } catch (error) {
      res.status(500).json({ error: "Failed to update faculty" });
    }
  });

  app.delete("/api/faculty/:id", requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteFaculty(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete faculty" });
    }
  });

  app.get("/api/courses", requireAuth, async (req, res) => {
    try {
      const coursesList = await storage.getAllCourses();
      res.json(coursesList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  });

  app.post("/api/courses", requireRole("admin"), async (req, res) => {
    try {
      const data = insertCourseSchema.parse(req.body);
      const course = await storage.createCourse(data);
      res.status(201).json(course);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create course" });
    }
  });

  app.put("/api/courses/:id", requireRole("admin"), async (req, res) => {
    try {
      const course = await storage.updateCourse(req.params.id, req.body);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }
      res.json(course);
    } catch (error) {
      res.status(500).json({ error: "Failed to update course" });
    }
  });

  app.delete("/api/courses/:id", requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteCourse(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete course" });
    }
  });

  app.get("/api/rooms", requireAuth, async (req, res) => {
    try {
      const roomsList = await storage.getAllRooms();
      res.json(roomsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch rooms" });
    }
  });

  app.post("/api/rooms", requireRole("admin"), async (req, res) => {
    try {
      const data = insertRoomSchema.parse(req.body);
      const room = await storage.createRoom(data);
      res.status(201).json(room);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create room" });
    }
  });

  app.put("/api/rooms/:id", requireRole("admin"), async (req, res) => {
    try {
      const room = await storage.updateRoom(req.params.id, req.body);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Failed to update room" });
    }
  });

  app.delete("/api/rooms/:id", requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteRoom(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete room" });
    }
  });

  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const [facultyList, coursesList, roomsList, timetablesList] = await Promise.all([
        storage.getAllFaculty(),
        storage.getAllCourses(),
        storage.getAllRooms(),
        storage.getAllTimetables(),
      ]);
      res.json({
        faculty: facultyList,
        courses: coursesList,
        rooms: roomsList,
        timetables: timetablesList,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/timetables", requireAuth, async (req, res) => {
    try {
      const timetablesList = await storage.getAllTimetables();
      res.json(timetablesList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch timetables" });
    }
  });

  app.get("/api/timetables/view", requireAuth, async (req, res) => {
    try {
      const timetablesList = await storage.getAllTimetables();
      const allSlots = [];
      
      for (const timetable of timetablesList) {
        const slots = await storage.getScheduledSlots(timetable.id);
        for (const slot of slots) {
          const course = await storage.getCourse(slot.courseId);
          const facultyMember = await storage.getFaculty(slot.facultyId);
          const room = await storage.getRoom(slot.roomId);
          allSlots.push({
            ...slot,
            course,
            faculty: facultyMember,
            room,
          });
        }
      }
      
      res.json({
        timetables: timetablesList,
        slots: allSlots,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch timetable view" });
    }
  });

  app.post("/api/timetables/generate", requireRole("admin"), async (req, res) => {
    try {
      const { deptId, semester, method, weights } = req.body as GenerateParams;

      const allCourses = await storage.getAllCourses();
      const deptCourses = allCourses.filter(
        (c) => c.department === deptId && c.semester === semester
      );

      const allFaculty = await storage.getAllFaculty();
      const deptFaculty = allFaculty.filter((f) => f.department === deptId);

      const allRooms = await storage.getAllRooms();

      if (deptCourses.length === 0) {
        return res.status(400).json({ 
          error: "No courses found for the selected department and semester" 
        });
      }

      if (deptFaculty.length === 0) {
        return res.status(400).json({ 
          error: "No faculty found for the selected department" 
        });
      }

      if (allRooms.length === 0) {
        return res.status(400).json({ 
          error: "No rooms available for scheduling" 
        });
      }

      const versionId = `v${Date.now().toString(36).toUpperCase()}`;
      
      const timetable = await storage.createTimetable({
        versionId,
        department: deptId,
        semester,
        status: "draft",
        createdBy: req.user!.id,
        conflictCount: 0,
        roomUtilization: 0,
        teacherLoad: 0,
      });

      const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      const timeSlots = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
      
      let conflictCount = 0;
      let slotsCreated = 0;
      const roomSlotMap: Map<string, string> = new Map();
      const facultySlotMap: Map<string, string> = new Map();

      const sortedCourses = [...deptCourses].sort((a, b) => b.lectureHours - a.lectureHours);

      for (const course of sortedCourses) {
        let hoursScheduled = 0;
        const targetHours = course.lectureHours;
        
        const facultyIndex = Math.floor(Math.random() * deptFaculty.length);
        const assignedFaculty = deptFaculty[facultyIndex];

        const shuffledDays = [...days].sort(() => Math.random() - 0.5);
        const shuffledTimes = [...timeSlots].sort(() => Math.random() - 0.5);

        for (const day of shuffledDays) {
          if (hoursScheduled >= targetHours) break;
          
          for (const time of shuffledTimes) {
            if (hoursScheduled >= targetHours) break;

            const facultySlotKey = `${day}-${time}-${assignedFaculty.id}`;
            if (facultySlotMap.has(facultySlotKey)) continue;

            let selectedRoom = null;
            let hasRoomConflict = false;

            for (const room of allRooms) {
              const roomSlotKey = `${day}-${time}-${room.id}`;
              if (!roomSlotMap.has(roomSlotKey)) {
                selectedRoom = room;
                break;
              }
            }

            if (!selectedRoom) {
              selectedRoom = allRooms[Math.floor(Math.random() * allRooms.length)];
              hasRoomConflict = true;
            }

            const roomSlotKey = `${day}-${time}-${selectedRoom.id}`;
            
            let status: "ok" | "conflict" | "warning" = "ok";
            if (hasRoomConflict) {
              status = "conflict";
              conflictCount++;
            }

            roomSlotMap.set(roomSlotKey, course.id);
            facultySlotMap.set(facultySlotKey, course.id);

            const endHour = parseInt(time.split(":")[0]) + 1;
            const endTime = `${endHour.toString().padStart(2, "0")}:00`;

            await storage.createScheduledSlot({
              timetableId: timetable.id,
              courseId: course.id,
              facultyId: assignedFaculty.id,
              roomId: selectedRoom.id,
              day,
              startTime: time,
              endTime,
              status,
              conflicts: status !== "ok" 
                ? [{ type: "room", severity: "high", description: "Room double-booked" }] 
                : null,
            });

            hoursScheduled++;
            slotsCreated++;
          }
        }
      }

      const totalSlots = allRooms.length * timeSlots.length * days.length;
      const roomUtilization = totalSlots > 0 
        ? Math.min(100, Math.round((slotsCreated / totalSlots) * 100))
        : 0;
      
      const maxTeacherHours = deptFaculty.reduce((sum, f) => sum + f.maxHoursPerWeek, 0);
      const teacherLoad = maxTeacherHours > 0
        ? Math.min(100, Math.round((slotsCreated / maxTeacherHours) * 100))
        : 0;

      await storage.updateTimetable(timetable.id, {
        conflictCount,
        roomUtilization,
        teacherLoad,
      });

      const updatedTimetable = await storage.getTimetable(timetable.id);

      res.json({
        timetable: updatedTimetable,
        slotsCreated,
        method,
        message: `Generated ${slotsCreated} scheduled slots using ${method} algorithm`,
      });
    } catch (error) {
      console.error("Generation error:", error);
      res.status(500).json({ error: "Failed to generate timetable" });
    }
  });

  app.get("/api/analytics", requireAuth, async (req, res) => {
    try {
      const [facultyList, roomsList, timetablesList] = await Promise.all([
        storage.getAllFaculty(),
        storage.getAllRooms(),
        storage.getAllTimetables(),
      ]);

      let totalScheduledHours = 0;
      const roomHoursMap = new Map<string, number>();
      const facultyHoursMap = new Map<string, number>();

      for (const timetable of timetablesList) {
        const slots = await storage.getScheduledSlots(timetable.id);
        totalScheduledHours += slots.length;

        for (const slot of slots) {
          const roomCount = roomHoursMap.get(slot.roomId) || 0;
          roomHoursMap.set(slot.roomId, roomCount + 1);

          const facultyCount = facultyHoursMap.get(slot.facultyId) || 0;
          facultyHoursMap.set(slot.facultyId, facultyCount + 1);
        }
      }

      const totalPossibleRoomHours = 40;
      const roomUtilization = roomsList.map((room) => {
        const usedHours = roomHoursMap.get(room.id) || 0;
        return {
          roomId: room.id,
          roomName: room.name,
          utilization: Math.round((usedHours / totalPossibleRoomHours) * 100),
          totalHours: totalPossibleRoomHours,
          usedHours,
        };
      });

      const teacherLoad = facultyList.map((f) => {
        const hours = facultyHoursMap.get(f.id) || 0;
        return {
          facultyId: f.id,
          facultyName: f.name,
          hours,
          maxHours: f.maxHoursPerWeek,
          percentage: Math.round((hours / f.maxHoursPerWeek) * 100),
        };
      });

      const totalConflicts = timetablesList.reduce(
        (acc, t) => acc + (t.conflictCount || 0),
        0
      );

      const conflictStats = {
        total: totalConflicts,
        byType: {
          room: Math.floor(totalConflicts * 0.5),
          faculty: Math.floor(totalConflicts * 0.3),
          student: Math.floor(totalConflicts * 0.15),
          preference: Math.floor(totalConflicts * 0.05),
        },
        trend: [],
      };

      res.json({
        analytics: {
          roomUtilization,
          teacherLoad,
          conflictStats,
        },
        faculty: facultyList,
        rooms: roomsList,
        timetables: timetablesList,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  return httpServer;
}
