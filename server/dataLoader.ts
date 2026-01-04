import fs from 'fs';
import path from 'path';
import { db } from './db';
import { courses, rooms } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface CSVCourse {
  code: string;
  name: string;
  department: string;
  semester: string;
  credits: string;
  lectureHours: string;
  labHours: string;
}

interface CSVRoom {
  code: string;
  name: string;
  building: string;
  capacity: string;
  type: string;
  facilities: string;
}

function parseCSV(csvContent: string): any[] {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const item: any = {};
    headers.forEach((header, index) => {
      item[header.trim()] = values[index]?.trim() || '';
    });
    return item;
  });
}

async function loadCoursesFromCSV(filePath: string): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`CSV file not found: ${filePath}`);
      return;
    }

    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const csvCourses = parseCSV(csvContent) as CSVCourse[];

    console.log(`Loading ${csvCourses.length} courses from ${filePath}`);

    for (const csvCourse of csvCourses) {
      try {
        // Check if course already exists
        const existingCourse = await db.query.courses.findFirst({
          where: eq(courses.code, csvCourse.code)
        });

        if (existingCourse) {
          console.log(`Course ${csvCourse.code} already exists, skipping...`);
          continue;
        }

        // Insert course into database
        await db.insert(courses).values({
          code: csvCourse.code,
          name: csvCourse.name,
          department: csvCourse.department,
          semester: parseInt(csvCourse.semester),
          credits: parseInt(csvCourse.credits),
          lectureHours: parseInt(csvCourse.lectureHours),
          labHours: csvCourse.labHours ? parseInt(csvCourse.labHours) : null,
          facultyIds: [], // Will be assigned later
        });

        console.log(`✓ Created course: ${csvCourse.code}`);
      } catch (error) {
        console.error(`Error creating course ${csvCourse.code}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error loading CSV file ${filePath}:`, error);
  }
}

async function loadRoomsFromCSV(filePath: string): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`CSV file not found: ${filePath}`);
      return;
    }

    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const csvRooms = parseCSV(csvContent) as CSVRoom[];

    console.log(`Loading ${csvRooms.length} rooms from ${filePath}`);

    for (const csvRoom of csvRooms) {
      try {
        // Check if room already exists
        const existingRoom = await db.query.rooms.findFirst({
          where: eq(rooms.code, csvRoom.code)
        });

        if (existingRoom) {
          console.log(`Room ${csvRoom.code} already exists, skipping...`);
          continue;
        }

        // Parse facilities
        const facilities = csvRoom.facilities 
          ? csvRoom.facilities.split(',').map(f => f.trim())
          : [];

        // Insert room into database
        await db.insert(rooms).values({
          code: csvRoom.code,
          name: csvRoom.name,
          building: csvRoom.building,
          capacity: parseInt(csvRoom.capacity),
          type: csvRoom.type as 'lecture' | 'lab' | 'tutorial',
          facilities: facilities,
          availability: null, // Default availability
        });

        console.log(`✓ Created room: ${csvRoom.code}`);
      } catch (error) {
        console.error(`Error creating room ${csvRoom.code}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error loading CSV file ${filePath}:`, error);
  }
}

export async function seedDataFromCSV(): Promise<void> {
  console.log('📚 Seeding courses and rooms from CSV files...');
  
  const dataDir = path.join(process.cwd(), 'data');
  
  // Load courses
  await loadCoursesFromCSV(path.join(dataDir, 'courses', 'courses.csv'));
  
  // Load rooms
  await loadRoomsFromCSV(path.join(dataDir, 'rooms', 'rooms.csv'));
  
  console.log('✅ Data seeding completed');
}