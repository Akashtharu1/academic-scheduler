import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "./storage";
import {
  insertFacultySchema,
  insertCourseSchema,
  insertRoomSchema,
  loginSchema,
  type GenerateParams,
  type User,
  facultyPreferencesSchema,
} from "@shared/schema";
import { z } from "zod";
import { preferenceManager } from "./preference-manager";
import { preferenceValidator } from "./preference-validator";
import { conflictDetector } from "./conflict-detector";

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

// Intelligent faculty-course mapping based on expertise
function createFacultyCourseMapping(courses: any[], faculty: any[]): Map<string, string[]> {
  const mapping = new Map<string, string[]>();
  
  // Assign courses to faculty based on their preferred subjects first, then department
  faculty.forEach(f => {
    const courseList: string[] = [];
    
    // PRIORITY 1: Use faculty's preferred subjects if they have set them
    if (f.preferredSubjects && f.preferredSubjects.length > 0) {
      courseList.push(...f.preferredSubjects);
    } else {
      // PRIORITY 2: Fall back to department-based assignment
      const deptCourses = courses.filter(c => c.department === f.department).map(c => c.code);
      courseList.push(...deptCourses);
    }
    
    mapping.set(f.id, courseList);
  });
  
  return mapping;
}

// Global counter for round-robin faculty assignment
let facultyAssignmentCounter = 0;

// Find the best faculty member for a course based on expertise, availability, and workload limits
function findBestFacultyForCourse(
  course: any, 
  faculty: any[], 
  facultyCourseMap: Map<string, string[]>,
  facultySlotMap: Map<string, string>
): any {
  // Helper function to get current workload for a faculty member
  const getWorkload = (f: any) => Array.from(facultySlotMap.keys()).filter(k => k.startsWith(f.id)).length;
  
  // Helper function to check if faculty can take more hours
  const canTakeMoreHours = (f: any) => {
    const currentHours = getWorkload(f);
    const maxHours = f.maxHoursPerWeek || 20; // Default to 20 if not set
    return currentHours < maxHours;
  };
  
  // Filter faculty who haven't exceeded their max hours
  const availableFaculty = faculty.filter(canTakeMoreHours);
  
  if (availableFaculty.length === 0) {
    // All faculty are at capacity - return the one with most remaining capacity
    console.warn(`All faculty at capacity for course ${course.code}. Assigning to least overloaded.`);
    return faculty.reduce((best, current) => {
      const bestRemaining = (best.maxHoursPerWeek || 20) - getWorkload(best);
      const currentRemaining = (current.maxHoursPerWeek || 20) - getWorkload(current);
      return currentRemaining > bestRemaining ? current : best;
    });
  }
  
  // First, try to find available faculty with expertise in this course
  const expertFaculty = availableFaculty.filter(f => {
    const expertise = facultyCourseMap.get(f.id) || [];
    return expertise.includes(course.code);
  });
  
  // If we have expert faculty, use round-robin among least loaded
  if (expertFaculty.length > 0) {
    expertFaculty.sort((a, b) => getWorkload(a) - getWorkload(b));
    const minWorkload = getWorkload(expertFaculty[0]);
    const leastLoadedFaculty = expertFaculty.filter(f => getWorkload(f) === minWorkload);
    const selected = leastLoadedFaculty[facultyAssignmentCounter % leastLoadedFaculty.length];
    facultyAssignmentCounter++;
    return selected;
  }
  
  // If no expert faculty, use round-robin from same department
  const deptFaculty = availableFaculty.filter(f => f.department === course.department);
  if (deptFaculty.length > 0) {
    deptFaculty.sort((a, b) => getWorkload(a) - getWorkload(b));
    const minWorkload = getWorkload(deptFaculty[0]);
    const leastLoadedFaculty = deptFaculty.filter(f => getWorkload(f) === minWorkload);
    const selected = leastLoadedFaculty[facultyAssignmentCounter % leastLoadedFaculty.length];
    facultyAssignmentCounter++;
    return selected;
  }
  
  // Fallback: round-robin among any available faculty
  availableFaculty.sort((a, b) => getWorkload(a) - getWorkload(b));
  const minWorkload = getWorkload(availableFaculty[0]);
  const leastLoadedFaculty = availableFaculty.filter(f => getWorkload(f) === minWorkload);
  const selected = leastLoadedFaculty[facultyAssignmentCounter % leastLoadedFaculty.length];
  facultyAssignmentCounter++;
  return selected;
}

// Alternative scheduling for courses that couldn't get all required hours
async function tryAlternativeScheduling(
  course: any,
  faculty: any,
  remainingHours: number,
  allTimeSlots: any[],
  allRooms: any[],
  allocationService: any,
  facultySlotMap: Map<string, string>,
  roomSlotMap: Map<string, string>,
  storage: any,
  timetableId: string
): Promise<number> {
  let scheduledAlternativeHours = 0;
  
  // Try with relaxed constraints (allow some conflicts)
  for (const timeSlot of allTimeSlots) {
    if (scheduledAlternativeHours >= remainingHours) break;
    
    const facultySlotKey = `${faculty.id}-${timeSlot.day}-${timeSlot.startTime}`;
    if (facultySlotMap.has(facultySlotKey)) continue;
    
    // Find available rooms with relaxed constraints
    const availableRooms = allRooms.filter(room => {
      const roomSlotKey = `${room.id}-${timeSlot.day}-${timeSlot.startTime}`;
      return !roomSlotMap.has(roomSlotKey);
    });
    
    if (availableRooms.length === 0) continue;
    
    // Try allocation with relaxed room type matching
    const result = allocationService.engine.allocateRoom(
      { 
        courseId: course.id,
        expectedSize: course.code.includes('101') ? 60 : course.code.includes('201') ? 40 : 30,
        requiredRoomType: course.labHours ? ['lab'] : ['lecture', 'tutorial'], // More flexible
        requiredFacilities: course.labHours ? ['computers'] : [],
        preferredCapacityRange: [15, 120], // Wider range
        priority: 'medium'
      },
      timeSlot,
      availableRooms
    );
    
    if (result.selectedRoom) {
      facultySlotMap.set(facultySlotKey, course.id);
      roomSlotMap.set(`${result.selectedRoom.id}-${timeSlot.day}-${timeSlot.startTime}`, course.id);
      
      await storage.createScheduledSlot({
        timetableId,
        courseId: course.id,
        facultyId: faculty.id,
        roomId: result.selectedRoom.id,
        day: timeSlot.day,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        status: result.conflicts.length > 0 ? "warning" : "ok",
        conflicts: result.conflicts.length > 0 
          ? result.conflicts.map((c: { type: string; severity: string; description: string }) => ({ 
              type: c.type, 
              severity: c.severity, 
              description: c.description 
            }))
          : null,
      });
      
      scheduledAlternativeHours++;
    }
  }
  
  return scheduledAlternativeHours;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Registration disabled - users are loaded from CSV files
  // app.post("/api/auth/register", ...)

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
      await storage.updateUser(user.id, { 
        password: hashedPassword,
        mustChangePassword: false 
      });
      
      await storage.revokeAllUserRefreshTokens(user.id);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update password" });
    }
  });

  app.put("/api/auth/change-default-password", requireAuth, async (req, res) => {
    try {
      const { newPassword } = req.body;
      
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      
      const user = req.user!;

      if (!user.mustChangePassword) {
        return res.status(400).json({ error: "Password change not required" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await storage.updateUser(user.id, { 
        password: hashedPassword,
        mustChangePassword: false 
      });
      
      await storage.revokeAllUserRefreshTokens(user.id);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to change password" });
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
      const { preferences, ...facultyData } = req.body;
      const data = insertFacultySchema.parse(facultyData);
      const faculty = await storage.createFaculty(data);
      
      // If preferences are provided, save them to the preference tables
      if (preferences && (preferences.roomPreferences || preferences.timePreferences || preferences.subjectPreferences)) {
        try {
          const preferencesData = {
            facultyId: faculty.id,
            roomPreferences: preferences.roomPreferences || [],
            timePreferences: preferences.timePreferences || [],
            subjectPreferences: preferences.subjectPreferences || [],
            constraints: preferences.constraints || [],
            lastUpdated: new Date(),
          };
          
          await preferenceManager.updateFacultyPreferences(
            faculty.id,
            preferencesData
          );
        } catch (prefError) {
          console.error("Error saving preferences for new faculty:", prefError);
          // Don't fail the entire request if preferences fail to save
        }
      }
      
      res.status(201).json(faculty);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Error creating faculty:", error);
      res.status(500).json({ error: "Failed to create faculty" });
    }
  });

  app.put("/api/faculty/:id", requireRole("admin", "faculty"), async (req, res) => {
    try {
      const facultyId = req.params.id;
      const { preferences, ...facultyData } = req.body;
      
      // Update faculty basic info
      const faculty = await storage.updateFaculty(facultyId, facultyData);
      if (!faculty) {
        return res.status(404).json({ error: "Faculty not found" });
      }
      
      // If preferences are provided, save them to the preference tables
      if (preferences && (preferences.roomPreferences || preferences.timePreferences || preferences.subjectPreferences)) {
        try {
          const preferencesData = {
            facultyId,
            roomPreferences: preferences.roomPreferences || [],
            timePreferences: preferences.timePreferences || [],
            subjectPreferences: preferences.subjectPreferences || [],
            constraints: preferences.constraints || [],
            lastUpdated: new Date(),
          };
          
          const validationResult = await preferenceManager.updateFacultyPreferences(
            facultyId,
            preferencesData
          );
          
          if (!validationResult.isValid) {
            console.warn("Preference validation warnings:", validationResult.warnings);
            // Don't fail the request, just log warnings
          }
        } catch (prefError) {
          console.error("Error saving preferences:", prefError);
          // Don't fail the entire request if preferences fail to save
        }
      }
      
      res.json(faculty);
    } catch (error) {
      console.error("Error updating faculty:", error);
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

  // Faculty Preference Endpoints
  app.get("/api/faculty/:id/preferences", requireAuth, async (req, res) => {
    try {
      const facultyId = req.params.id;
      
      // Check if user can access this faculty's preferences
      if (req.user!.role !== "admin" && req.user!.id !== facultyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const preferences = await preferenceManager.getFacultyPreferences(facultyId);
      if (!preferences) {
        return res.status(404).json({ error: "Faculty not found" });
      }

      res.json(preferences);
    } catch (error) {
      console.error("Error fetching faculty preferences:", error);
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.put("/api/faculty/:id/preferences", requireAuth, async (req, res) => {
    try {
      const facultyId = req.params.id;
      
      // Check if user can update this faculty's preferences
      if (req.user!.role !== "admin" && req.user!.id !== facultyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Validate request body and add required fields
      const preferences = {
        ...req.body,
        facultyId,
        constraints: req.body.constraints || [],
        lastUpdated: new Date(),
      };

      // Get faculty department for enhanced validation
      const faculty = await storage.getFaculty(facultyId);
      const facultyDepartment = faculty?.department;

      const validationResult = await preferenceManager.updateFacultyPreferences(
        facultyId, 
        preferences
      );

      if (!validationResult.isValid) {
        return res.status(400).json({
          error: "Validation failed",
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        });
      }

      res.json({ 
        success: true, 
        warnings: validationResult.warnings,
        message: "Preferences updated successfully" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid request data",
          details: error.errors,
        });
      }
      console.error("Error updating faculty preferences:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  app.post("/api/faculty/:id/preferences/validate", requireAuth, async (req, res) => {
    try {
      const facultyId = req.params.id;
      
      // Check if user can validate this faculty's preferences
      if (req.user!.role !== "admin" && req.user!.id !== facultyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Validate request body and add required fields
      const preferences = {
        ...req.body,
        facultyId,
        constraints: req.body.constraints || [],
        lastUpdated: new Date(),
      };

      // Get faculty department for enhanced validation
      const faculty = await storage.getFaculty(facultyId);
      const facultyDepartment = faculty?.department;

      const validationResult = await preferenceManager.validatePreferences(
        preferences, 
        facultyDepartment
      );

      res.json(validationResult);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid request data",
          details: error.errors,
        });
      }
      console.error("Error validating faculty preferences:", error);
      res.status(500).json({ error: "Failed to validate preferences" });
    }
  });

  app.get("/api/faculty/:id/preferences/history", requireAuth, async (req, res) => {
    try {
      const facultyId = req.params.id;
      
      // Check if user can access this faculty's preference history
      if (req.user!.role !== "admin" && req.user!.id !== facultyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const history = await preferenceManager.getPreferenceHistory(facultyId, limit);

      res.json(history);
    } catch (error) {
      console.error("Error fetching preference history:", error);
      res.status(500).json({ error: "Failed to fetch preference history" });
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

  // Delete a specific timetable
  app.delete("/api/timetables/:id", requireRole("admin"), async (req, res) => {
    try {
      const deleted = await storage.deleteTimetable(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Timetable not found" });
      }
      res.json({ success: true, message: "Timetable deleted successfully" });
    } catch (error) {
      console.error("Delete timetable error:", error);
      res.status(500).json({ error: "Failed to delete timetable" });
    }
  });

  // Clear all timetables (admin only)
  app.delete("/api/timetables", requireRole("admin"), async (req, res) => {
    try {
      const timetablesList = await storage.getAllTimetables();
      let deletedCount = 0;
      
      for (const timetable of timetablesList) {
        await storage.deleteTimetable(timetable.id);
        deletedCount++;
      }
      
      res.json({ 
        success: true, 
        message: `Cleared ${deletedCount} timetables and all associated scheduled slots` 
      });
    } catch (error) {
      console.error("Clear timetables error:", error);
      res.status(500).json({ error: "Failed to clear timetables" });
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
      const { deptId, semester, method } = req.body as GenerateParams;

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

      // Use the new intelligent room allocation system
      const { RoomAllocationServiceImpl } = await import('./room-allocation-service');
      
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      const timeSlots = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
      
      // Create time slot objects for the allocation system
      const allTimeSlots = days.flatMap(day => 
        timeSlots.map(time => ({
          day,
          startTime: time,
          endTime: `${(parseInt(time.split(':')[0]) + 1).toString().padStart(2, '0')}:00`
        }))
      );
      
      // Shuffle time slots to distribute classes across all days instead of filling Monday first
      for (let i = allTimeSlots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allTimeSlots[i], allTimeSlots[j]] = [allTimeSlots[j], allTimeSlots[i]];
      }

      // Initialize the room allocation service
      const allocationService = new RoomAllocationServiceImpl(allRooms, allTimeSlots);
      
      // Track faculty assignments to avoid conflicts
      const facultySlotMap: Map<string, string> = new Map();
      let slotsCreated = 0;

      // Create scheduled slots with improved course-faculty-room mapping
      const roomSlotMap = new Map<string, string>(); // Track room usage to prevent conflicts
      
      // Create intelligent faculty-course mapping
      const facultyCourseMap = createFacultyCourseMapping(deptCourses, deptFaculty);
      
      // Track course scheduling progress
      const courseProgress = new Map<string, { course: any, faculty: any, scheduledHours: number, targetHours: number }>();
      
      // Initialize course progress tracking (without pre-assigning faculty)
      for (const course of deptCourses) {
        courseProgress.set(course.id, {
          course,
          faculty: null, // Will be assigned dynamically
          scheduledHours: 0,
          targetHours: course.lectureHours
        });
      }
      
      // Schedule courses in round-robin fashion across time slots to distribute across days
      for (const timeSlot of allTimeSlots) {
        // Find courses that still need scheduling
        const coursesNeedingScheduling = Array.from(courseProgress.values())
          .filter(cp => cp.scheduledHours < cp.targetHours);
        
        if (coursesNeedingScheduling.length === 0) break;
        
        // Try to schedule one course in this time slot (round-robin)
        for (const courseInfo of coursesNeedingScheduling) {
          const { course } = courseInfo;
          
          // Find best faculty for this course at this time slot
          const assignedFaculty = findBestFacultyForCourse(course, deptFaculty, facultyCourseMap, facultySlotMap);
          
          // Check if faculty has reached their max hours limit
          const currentFacultyHours = Array.from(facultySlotMap.keys()).filter(k => k.startsWith(assignedFaculty.id)).length;
          const maxFacultyHours = assignedFaculty.maxHoursPerWeek || 20;
          if (currentFacultyHours >= maxFacultyHours) {
            continue; // Skip this course for this time slot
          }
          
          const facultySlotKey = `${assignedFaculty.id}-${timeSlot.day}-${timeSlot.startTime}`;
          if (facultySlotMap.has(facultySlotKey)) continue;
          
          // Find truly available rooms (no conflicts)
          const availableRooms = allRooms.filter(room => {
            const roomSlotKey = `${room.id}-${timeSlot.day}-${timeSlot.startTime}`;
            return allocationService.engine.isSlotAvailable(room.id, timeSlot) && 
                   !roomSlotMap.has(roomSlotKey);
          });
          
          if (availableRooms.length === 0) continue;
          
          const result = allocationService.engine.allocateRoom(
            { 
              courseId: course.id,
              expectedSize: course.code.includes('101') ? 60 : course.code.includes('201') ? 40 : 30,
              requiredRoomType: course.labHours ? ['lab'] : ['lecture', 'tutorial'],
              requiredFacilities: course.labHours ? ['computers'] : [],
              preferredCapacityRange: [20, 80],
              priority: 'medium'
            },
            timeSlot,
            availableRooms
          );
          
          // Skip allocation if no room available or has conflicts
          if (!result.selectedRoom || result.conflicts.length > 0) {
            continue; // Skip conflicted allocations entirely
          }
          
          facultySlotMap.set(facultySlotKey, course.id);
          roomSlotMap.set(`${result.selectedRoom.id}-${timeSlot.day}-${timeSlot.startTime}`, course.id);
          
          await storage.createScheduledSlot({
            timetableId: timetable.id,
            courseId: course.id,
            facultyId: assignedFaculty.id,
            roomId: result.selectedRoom.id,
            day: timeSlot.day,
            startTime: timeSlot.startTime,
            endTime: timeSlot.endTime,
            status: "ok", // Always OK since we skip conflicts
            conflicts: null, // No conflicts allowed
          });
          
          // Update course progress
          courseInfo.scheduledHours++;
          slotsCreated++;
          
          // Only schedule one course per time slot to distribute across days
          break;
        }
      }


      // Get allocation metrics
      const detailedReport = allocationService.getDetailedReport();

      // Calculate improved utilization metrics
      const totalSlots = allRooms.length * timeSlots.length * days.length;
      const roomUtilization = totalSlots > 0 
        ? Math.min(100, Math.round((slotsCreated / totalSlots) * 100))
        : 0;
      
      const maxTeacherHours = deptFaculty.reduce((sum, f) => sum + f.maxHoursPerWeek, 0);
      const teacherLoad = maxTeacherHours > 0
        ? Math.min(100, Math.round((slotsCreated / maxTeacherHours) * 100))
        : 0;

      await storage.updateTimetable(timetable.id, {
        conflictCount: 0, // No conflicts since we skip them
        roomUtilization,
        teacherLoad,
      });

      const updatedTimetable = await storage.getTimetable(timetable.id);

      // Validate the generated timetable
      const { ScheduleValidator } = await import('./schedule-validator');
      const generatedSlots = await storage.getScheduledSlots(timetable.id);
      const validation = ScheduleValidator.validateTimetable(
        generatedSlots,
        deptCourses,
        deptFaculty,
        allRooms
      );

      res.json({
        timetable: updatedTimetable,
        slotsCreated,
        method: `${method} (Enhanced with Validation)`,
        message: `Generated ${slotsCreated} scheduled slots using intelligent room allocation`,
        allocationMetrics: {
          balanceScore: detailedReport.metrics.balanceScore,
          conflictRate: detailedReport.metrics.conflictRate,
          utilizationBalance: detailedReport.utilizationBalance,
          roomEfficiency: detailedReport.roomEfficiency.slice(0, 5), // Top 5 rooms
        },
        validation: {
          isValid: validation.isValid,
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          suggestions: validation.suggestions,
          summary: validation.isValid 
            ? 'Timetable generated successfully with no conflicts' 
            : `Generated with ${validation.errors.length} conflicts that need resolution`
        }
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

      // Enhanced room utilization calculation with better distribution
      const totalPossibleRoomHours = 40; // 8 time slots * 5 days
      const roomUtilization = roomsList.map((room) => {
        const usedHours = roomHoursMap.get(room.id) || 0;
        const utilization = Math.min(100, Math.round((usedHours / totalPossibleRoomHours) * 100));
        
        return {
          roomId: room.id,
          roomName: room.name,
          utilization,
          totalHours: totalPossibleRoomHours,
          usedHours,
          // Add capacity efficiency indicator
          capacityEfficiency: room.capacity > 0 ? Math.min(100, (usedHours * 30) / room.capacity * 100) : 0,
          roomType: room.type,
          building: room.building,
        };
      });

      // Calculate utilization balance metrics
      const utilizations = roomUtilization.map(r => r.utilization);
      const maxUtilization = Math.max(...utilizations);
      const minUtilization = Math.min(...utilizations);
      const avgUtilization = utilizations.reduce((sum, util) => sum + util, 0) / utilizations.length;
      const utilizationSpread = maxUtilization - minUtilization;
      
      // Calculate standard deviation for balance score
      const variance = utilizations.reduce((sum, util) => sum + Math.pow(util - avgUtilization, 2), 0) / utilizations.length;
      const standardDeviation = Math.sqrt(variance);
      const balanceScore = Math.max(0, 100 - standardDeviation);

      const teacherLoad = facultyList.map((f) => {
        const hours = facultyHoursMap.get(f.id) || 0;
        return {
          facultyId: f.id,
          facultyName: f.name,
          hours,
          maxHours: f.maxHoursPerWeek,
          percentage: Math.round((hours / f.maxHoursPerWeek) * 100),
          department: f.department,
        };
      });

      // Conflicts removed - always zero
      const conflictStats = {
        total: 0,
        byType: {
          room: 0,
          faculty: 0,
          student: 0,
          preference: 0,
        },
        trend: [],
      };

      // Enhanced analytics with allocation quality metrics
      res.json({
        analytics: {
          roomUtilization,
          teacherLoad,
          conflictStats,
          // New allocation quality metrics
          allocationQuality: {
            balanceScore: Math.round(balanceScore),
            utilizationSpread,
            averageUtilization: Math.round(avgUtilization),
            maxUtilization,
            minUtilization,
            totalRooms: roomsList.length,
            activeRooms: roomUtilization.filter(r => r.usedHours > 0).length,
            underutilizedRooms: roomUtilization.filter(r => r.utilization < 20).length,
            overutilizedRooms: roomUtilization.filter(r => r.utilization > 80).length,
          },
          // Room efficiency by type
          roomTypeEfficiency: {
            lecture: roomUtilization.filter(r => r.roomType === 'lecture').reduce((sum, r) => sum + r.utilization, 0) / 
                    Math.max(1, roomUtilization.filter(r => r.roomType === 'lecture').length),
            lab: roomUtilization.filter(r => r.roomType === 'lab').reduce((sum, r) => sum + r.utilization, 0) / 
                Math.max(1, roomUtilization.filter(r => r.roomType === 'lab').length),
            tutorial: roomUtilization.filter(r => r.roomType === 'tutorial').reduce((sum, r) => sum + r.utilization, 0) / 
                     Math.max(1, roomUtilization.filter(r => r.roomType === 'tutorial').length),
          },
        },
        faculty: facultyList,
        rooms: roomsList,
        timetables: timetablesList,
      });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Administrative preference endpoints
  app.get('/api/admin/preferences/dashboard', requireRole("admin"), async (req, res) => {
    try {
      const allFaculty = await storage.getAllFaculty();
      const dashboardData = {
        totalFaculty: allFaculty.length,
        facultyWithPreferences: 0,
        averagePreferenceCompleteness: 0,
        recentUpdates: [],
        conflictSummary: {
          totalConflicts: 0,
          highPriorityConflicts: 0,
          resolvedConflicts: 0,
        },
        satisfactionMetrics: {
          averageSatisfaction: 0,
          satisfactionDistribution: {
            excellent: 0,
            good: 0,
            fair: 0,
            poor: 0,
          },
        },
      };

      // Calculate metrics for each faculty
      let totalCompleteness = 0;
      let totalSatisfaction = 0;
      let facultyWithPrefs = 0;

      for (const facultyMember of allFaculty) {
        try {
          const preferences = await preferenceManager.getFacultyPreferences(facultyMember.id);
          if (preferences) {
            facultyWithPrefs++;
            
            // Calculate completeness
            const { calculatePreferenceCompleteness } = await import('@shared/faculty-preferences');
            const completeness = calculatePreferenceCompleteness(preferences);
            totalCompleteness += completeness;

            // Detect conflicts
            const conflicts = await conflictDetector.detectConflicts(facultyMember.id, preferences);
            dashboardData.conflictSummary.totalConflicts += 
              conflicts.timeConflicts.length + 
              conflicts.resourceConflicts.length + 
              conflicts.constraintViolations.length;
            
            dashboardData.conflictSummary.highPriorityConflicts += 
              conflicts.timeConflicts.filter((c: any) => c.severity === 'high').length +
              conflicts.resourceConflicts.filter((c: any) => c.severity === 'high').length +
              conflicts.constraintViolations.filter((c: any) => c.severity === 'high').length;

            // Calculate satisfaction (simplified)
            const satisfaction = Math.max(0, 100 - (conflicts.timeConflicts.length * 10 + conflicts.resourceConflicts.length * 5));
            totalSatisfaction += satisfaction;

            // Update satisfaction distribution
            if (satisfaction >= 80) dashboardData.satisfactionMetrics.satisfactionDistribution.excellent++;
            else if (satisfaction >= 60) dashboardData.satisfactionMetrics.satisfactionDistribution.good++;
            else if (satisfaction >= 40) dashboardData.satisfactionMetrics.satisfactionDistribution.fair++;
            else dashboardData.satisfactionMetrics.satisfactionDistribution.poor++;
          }
        } catch (error) {
          console.error(`Error processing faculty ${facultyMember.id}:`, error);
        }
      }

      dashboardData.facultyWithPreferences = facultyWithPrefs;
      dashboardData.averagePreferenceCompleteness = facultyWithPrefs > 0 ? totalCompleteness / facultyWithPrefs : 0;
      dashboardData.satisfactionMetrics.averageSatisfaction = facultyWithPrefs > 0 ? totalSatisfaction / facultyWithPrefs : 0;

      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching admin dashboard:', error);
      res.status(500).json({ error: 'Failed to fetch admin dashboard' });
    }
  });

  app.put('/api/admin/preferences/:facultyId/override', requireRole("admin"), async (req, res) => {
    try {
      const { facultyId } = req.params;
      const { preferences, reason } = req.body;

      // Validate faculty exists
      const facultyMember = await storage.getFaculty(facultyId);
      if (!facultyMember) {
        return res.status(404).json({ error: 'Faculty member not found' });
      }

      // Update preferences with admin override
      const updatedPreferences = await preferenceManager.updateFacultyPreferences(facultyId, preferences);



      res.json({
        success: true,
        preferences: updatedPreferences,
        overrideReason: reason,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error applying admin override:', error);
      res.status(500).json({ error: 'Failed to apply admin override' });
    }
  });

  app.get('/api/admin/preferences/statistics', requireRole("admin"), async (req, res) => {
    try {
      const allFaculty = await storage.getAllFaculty();
      
      const statistics = {
        overview: {
          totalFaculty: allFaculty.length,
          facultyWithPreferences: 0,
          averageCompleteness: 0,
          lastUpdated: new Date().toISOString(),
        },
        preferenceBreakdown: {
          roomPreferences: { total: 0, average: 0 },
          timePreferences: { total: 0, average: 0 },
          subjectPreferences: { total: 0, average: 0 },
        },
        conflictAnalysis: {
          totalConflicts: 0,
          conflictsByType: {
            time: 0,
            resource: 0,
            constraint: 0,
          },
          conflictsBySeverity: {
            high: 0,
            medium: 0,
            low: 0,
          },
        },
        departmentBreakdown: {} as Record<string, {
          facultyCount: number;
          preferencesSet: number;
          averageCompleteness: number;
          conflictCount: number;
        }>,
      };

      // Group faculty by department
      const departmentGroups = allFaculty.reduce((acc, f) => {
        if (!acc[f.department]) acc[f.department] = [];
        acc[f.department].push(f);
        return acc;
      }, {} as Record<string, typeof allFaculty>);

      // Process each department
      for (const [dept, deptFaculty] of Object.entries(departmentGroups)) {
        let deptPrefsSet = 0;
        let deptTotalCompleteness = 0;
        let deptConflicts = 0;

        for (const facultyMember of deptFaculty) {
          try {
            const preferences = await preferenceManager.getFacultyPreferences(facultyMember.id);
            if (preferences) {
              statistics.overview.facultyWithPreferences++;
              deptPrefsSet++;

              // Calculate completeness
              const { calculatePreferenceCompleteness } = await import('@shared/faculty-preferences');
              const completeness = calculatePreferenceCompleteness(preferences);
              statistics.overview.averageCompleteness += completeness;
              deptTotalCompleteness += completeness;

              // Count preferences
              statistics.preferenceBreakdown.roomPreferences.total += preferences.roomPreferences.length;
              statistics.preferenceBreakdown.timePreferences.total += preferences.timePreferences.length;
              statistics.preferenceBreakdown.subjectPreferences.total += preferences.subjectPreferences.length;

              // Analyze conflicts
              const conflicts = await conflictDetector.detectConflicts(facultyMember.id, preferences);
              
              const totalFacultyConflicts = conflicts.timeConflicts.length + 
                                          conflicts.resourceConflicts.length + 
                                          conflicts.constraintViolations.length;
              
              statistics.conflictAnalysis.totalConflicts += totalFacultyConflicts;
              deptConflicts += totalFacultyConflicts;

              // Count by type
              statistics.conflictAnalysis.conflictsByType.time += conflicts.timeConflicts.length;
              statistics.conflictAnalysis.conflictsByType.resource += conflicts.resourceConflicts.length;
              statistics.conflictAnalysis.conflictsByType.constraint += conflicts.constraintViolations.length;

              // Count by severity
              [...conflicts.timeConflicts, ...conflicts.resourceConflicts, ...conflicts.constraintViolations]
                .forEach((conflict: any) => {
                  if (conflict.severity in statistics.conflictAnalysis.conflictsBySeverity) {
                    statistics.conflictAnalysis.conflictsBySeverity[conflict.severity as keyof typeof statistics.conflictAnalysis.conflictsBySeverity]++;
                  }
                });
            }
          } catch (error) {
            console.error(`Error processing faculty ${facultyMember.id}:`, error);
          }
        }

        statistics.departmentBreakdown[dept] = {
          facultyCount: deptFaculty.length,
          preferencesSet: deptPrefsSet,
          averageCompleteness: deptPrefsSet > 0 ? deptTotalCompleteness / deptPrefsSet : 0,
          conflictCount: deptConflicts,
        };
      }

      // Calculate averages
      if (statistics.overview.facultyWithPreferences > 0) {
        statistics.overview.averageCompleteness /= statistics.overview.facultyWithPreferences;
        statistics.preferenceBreakdown.roomPreferences.average = 
          statistics.preferenceBreakdown.roomPreferences.total / statistics.overview.facultyWithPreferences;
        statistics.preferenceBreakdown.timePreferences.average = 
          statistics.preferenceBreakdown.timePreferences.total / statistics.overview.facultyWithPreferences;
        statistics.preferenceBreakdown.subjectPreferences.average = 
          statistics.preferenceBreakdown.subjectPreferences.total / statistics.overview.facultyWithPreferences;
      }

      res.json(statistics);
    } catch (error) {
      console.error('Error fetching preference statistics:', error);
      res.status(500).json({ error: 'Failed to fetch preference statistics' });
    }
  });

  app.post('/api/admin/preferences/bulk-update', requireRole("admin"), async (req, res) => {
    try {
      const { updates, reason } = req.body;
      
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: 'Updates must be an array' });
      }

      const results = [];
      const errors = [];

      for (const update of updates) {
        try {
          const { facultyId, preferences } = update;
          
          // Validate faculty exists
          const facultyMember = await storage.getFaculty(facultyId);
          if (!facultyMember) {
            errors.push({ facultyId, error: 'Faculty member not found' });
            continue;
          }

          // Update preferences
          const updatedPreferences = await preferenceManager.updateFacultyPreferences(facultyId, preferences);
          results.push({ facultyId, success: true, preferences: updatedPreferences });

        } catch (error: any) {
          console.error(`Error updating preferences for faculty ${update.facultyId}:`, error);
          errors.push({ facultyId: update.facultyId, error: error.message });
        }
      }



      res.json({
        success: true,
        results,
        errors,
        summary: {
          total: updates.length,
          successful: results.length,
          failed: errors.length,
        },
        reason,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error performing bulk update:', error);
      res.status(500).json({ error: 'Failed to perform bulk update' });
    }
  });

  return httpServer;
}
