import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { db } from './db';
import { users, faculty } from '@shared/schema';
import { eq, or } from 'drizzle-orm';

const SALT_ROUNDS = 12;

interface CSVUser {
  username: string;
  email: string;
  name: string;
  department: string;
  default_password: string;
  preferred_subjects?: string; // Pipe-separated list of course codes
}

interface LoadStats {
  total: number;
  created: number;
  skipped: number;
  errors: number;
}

function parseCSV(csvContent: string): CSVUser[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  const requiredHeaders = ['username', 'email', 'name', 'department', 'default_password'];
  
  // Validate headers
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required header: ${required}`);
    }
  }
  
  return lines.slice(1).map((line, index) => {
    const values = line.split(',');
    const user: any = {};
    
    headers.forEach((header, headerIndex) => {
      const value = values[headerIndex]?.trim() || '';
      user[header] = value;
    });
    
    // Validate required fields
    for (const required of requiredHeaders) {
      if (!user[required]) {
        throw new Error(`Row ${index + 2}: Missing value for ${required}`);
      }
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user.email)) {
      throw new Error(`Row ${index + 2}: Invalid email format: ${user.email}`);
    }
    
    return user as CSVUser;
  });
}

async function loadUsersFromCSV(filePath: string, role: string): Promise<LoadStats> {
  const stats: LoadStats = { total: 0, created: 0, skipped: 0, errors: 0 };
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`📄 CSV file not found: ${filePath}`);
      return stats;
    }

    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const csvUsers = parseCSV(csvContent);
    stats.total = csvUsers.length;

    console.log(`📊 Loading ${csvUsers.length} ${role}s from ${path.basename(filePath)}`);

    for (const csvUser of csvUsers) {
      try {
        // Check if user already exists by username or email
        const existingUser = await db.query.users.findFirst({
          where: eq(users.username, csvUser.username)
        });

        const existingEmail = await db.query.users.findFirst({
          where: eq(users.email, csvUser.email)
        });

        if (existingUser) {
          console.log(`⏭️  User ${csvUser.username} already exists, skipping...`);
          stats.skipped++;
          continue;
        }

        if (existingEmail) {
          console.log(`⏭️  Email ${csvUser.email} already exists, skipping user ${csvUser.username}...`);
          stats.skipped++;
          continue;
        }

        // Hash the default password
        const hashedPassword = await bcrypt.hash(csvUser.default_password, SALT_ROUNDS);

        // Insert user into database
        const [newUser] = await db.insert(users).values({
          username: csvUser.username,
          email: csvUser.email,
          name: csvUser.name,
          department: csvUser.department,
          password: hashedPassword,
          role: role,
          mustChangePassword: true,
        }).returning();

        // If this is a faculty user, also create a faculty record
        if (role === 'faculty') {
          // Parse preferred subjects from CSV (pipe-separated)
          const preferredSubjects = csvUser.preferred_subjects 
            ? csvUser.preferred_subjects.split('|').map(s => s.trim()).filter(s => s)
            : [];
          
          await db.insert(faculty).values({
            userId: newUser.id,
            name: csvUser.name,
            email: csvUser.email,
            department: csvUser.department,
            maxHoursPerWeek: 40, // Default max hours per week
            preferences: [],
            preferredSubjects: preferredSubjects,
            availability: null,
          });
          console.log(`👨‍🏫 Created faculty profile for: ${csvUser.username}`);
        }

        console.log(`✅ Created ${role}: ${csvUser.username} (${csvUser.email})`);
        stats.created++;
      } catch (error) {
        console.error(`❌ Error creating user ${csvUser.username}:`, error);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`💥 Error loading CSV file ${filePath}:`, error);
    stats.errors++;
  }
  
  return stats;
}

async function createMissingFacultyRecords(): Promise<void> {
  try {
    console.log('🔍 Checking for missing faculty records...');
    
    // Find all faculty users who don't have faculty records
    const facultyUsers = await db.query.users.findMany({
      where: eq(users.role, 'faculty')
    });

    console.log(`Found ${facultyUsers.length} faculty users in users table`);

    let createdCount = 0;
    for (const user of facultyUsers) {
      // Check if faculty record exists
      const existingFaculty = await db.query.faculty.findFirst({
        where: eq(faculty.userId, user.id)
      });

      if (!existingFaculty) {
        // Create missing faculty record
        await db.insert(faculty).values({
          userId: user.id,
          name: user.name,
          email: user.email,
          department: user.department || 'General', // Ensure department is not null
          maxHoursPerWeek: 40, // Default max hours per week
          preferences: [],
          availability: null,
        });
        console.log(`✓ Created missing faculty profile for: ${user.username}`);
        createdCount++;
      } else {
        console.log(`Faculty profile already exists for: ${user.username}`);
      }
    }
    
    if (createdCount === 0) {
      console.log('✅ All faculty users already have faculty profiles');
    } else {
      console.log(`✅ Created ${createdCount} missing faculty profiles`);
    }
  } catch (error) {
    console.error('Error creating missing faculty records:', error);
  }
}

export async function seedUsersFromCSV(): Promise<void> {
  console.log('🌱 Seeding users from CSV files...');
  
  // Validate CSV files first
  const isValid = await validateCSVFiles();
  if (!isValid) {
    console.log('⚠️  CSV validation failed, but continuing with loading...\n');
  }
  
  const dataDir = path.join(process.cwd(), 'data', 'users');
  const totalStats: LoadStats = { total: 0, created: 0, skipped: 0, errors: 0 };
  
  // Load each user type
  const adminStats = await loadUsersFromCSV(path.join(dataDir, 'admins.csv'), 'admin');
  const facultyStats = await loadUsersFromCSV(path.join(dataDir, 'faculty.csv'), 'faculty');
  const studentStats = await loadUsersFromCSV(path.join(dataDir, 'students.csv'), 'student');
  
  // Combine stats
  totalStats.total = adminStats.total + facultyStats.total + studentStats.total;
  totalStats.created = adminStats.created + facultyStats.created + studentStats.created;
  totalStats.skipped = adminStats.skipped + facultyStats.skipped + studentStats.skipped;
  totalStats.errors = adminStats.errors + facultyStats.errors + studentStats.errors;
  
  // Create missing faculty records for existing faculty users
  await createMissingFacultyRecords();
  
  // Sync faculty data to ensure consistency
  await syncFacultyFromCSV();
  
  // Print summary
  console.log('\n📈 CSV Loading Summary:');
  console.log(`   Total users processed: ${totalStats.total}`);
  console.log(`   ✅ Created: ${totalStats.created}`);
  console.log(`   ⏭️  Skipped: ${totalStats.skipped}`);
  console.log(`   ❌ Errors: ${totalStats.errors}`);
  console.log('✅ User seeding completed\n');
}

export async function syncFacultyFromCSV(): Promise<void> {
  console.log('🔄 Syncing faculty data from CSV...');
  
  const facultyCSVPath = path.join(process.cwd(), 'data', 'users', 'faculty.csv');
  
  try {
    if (!fs.existsSync(facultyCSVPath)) {
      console.log('📄 Faculty CSV file not found, skipping sync');
      return;
    }

    const csvContent = fs.readFileSync(facultyCSVPath, 'utf-8');
    const csvUsers = parseCSV(csvContent);
    
    console.log(`📊 Syncing ${csvUsers.length} faculty records...`);
    
    let syncedCount = 0;
    let createdCount = 0;
    
    for (const csvUser of csvUsers) {
      try {
        // Find existing user
        const existingUser = await db.query.users.findFirst({
          where: eq(users.username, csvUser.username)
        });
        
        if (existingUser && existingUser.role === 'faculty') {
          // Check if faculty record exists
          const existingFaculty = await db.query.faculty.findFirst({
            where: eq(faculty.userId, existingUser.id)
          });
          
          // Parse preferred subjects from CSV
          const preferredSubjects = csvUser.preferred_subjects 
            ? csvUser.preferred_subjects.split('|').map(s => s.trim()).filter(s => s)
            : [];
          
          if (!existingFaculty) {
            // Create missing faculty record
            await db.insert(faculty).values({
              userId: existingUser.id,
              name: csvUser.name,
              email: csvUser.email,
              department: csvUser.department,
              maxHoursPerWeek: 40,
              preferences: [],
              preferredSubjects: preferredSubjects,
              availability: null,
            });
            console.log(`👨‍🏫 Created faculty profile for existing user: ${csvUser.username}`);
            createdCount++;
          } else {
            // Update existing faculty record with CSV data including preferred subjects
            await db.update(faculty)
              .set({
                name: csvUser.name,
                email: csvUser.email,
                department: csvUser.department,
                preferredSubjects: preferredSubjects,
              })
              .where(eq(faculty.userId, existingUser.id));
            console.log(`🔄 Updated faculty profile: ${csvUser.username}`);
            syncedCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Error syncing faculty ${csvUser.username}:`, error);
      }
    }
    
    console.log(`✅ Faculty sync completed: ${createdCount} created, ${syncedCount} updated`);
  } catch (error) {
    console.error('💥 Error syncing faculty from CSV:', error);
  }
}

export async function validateCSVFiles(): Promise<boolean> {
  console.log('🔍 Validating CSV files...');
  
  const dataDir = path.join(process.cwd(), 'data', 'users');
  const csvFiles = [
    { path: path.join(dataDir, 'admins.csv'), type: 'admin' },
    { path: path.join(dataDir, 'faculty.csv'), type: 'faculty' },
    { path: path.join(dataDir, 'students.csv'), type: 'student' }
  ];
  
  let allValid = true;
  
  for (const { path: filePath, type } of csvFiles) {
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  ${type} CSV file not found: ${path.basename(filePath)}`);
        continue;
      }
      
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const csvUsers = parseCSV(csvContent);
      
      // Check for duplicates within the file
      const usernames = new Set();
      const emails = new Set();
      let duplicates = 0;
      
      for (const user of csvUsers) {
        if (usernames.has(user.username)) {
          console.log(`❌ Duplicate username in ${type} CSV: ${user.username}`);
          duplicates++;
          allValid = false;
        }
        if (emails.has(user.email)) {
          console.log(`❌ Duplicate email in ${type} CSV: ${user.email}`);
          duplicates++;
          allValid = false;
        }
        usernames.add(user.username);
        emails.add(user.email);
      }
      
      if (duplicates === 0) {
        console.log(`✅ ${type} CSV is valid (${csvUsers.length} records)`);
      }
      
    } catch (error) {
      console.error(`❌ Error validating ${type} CSV:`, error);
      allValid = false;
    }
  }
  
  return allValid;
}

export async function createDefaultAdmin(): Promise<void> {
  try {
    // Check if any admin exists
    const existingAdmin = await db.query.users.findFirst({
      where: eq(users.role, 'admin')
    });

    if (!existingAdmin) {
      console.log('🔧 No admin found, creating default admin...');
      
      const hashedPassword = await bcrypt.hash('admin123', SALT_ROUNDS);
      
      await db.insert(users).values({
        username: 'admin',
        email: 'admin@university.edu',
        name: 'System Administrator',
        department: 'IT',
        password: hashedPassword,
        role: 'admin',
        mustChangePassword: true,
      });
      
      console.log('✅ Default admin created (username: admin, password: admin123)');
    }
  } catch (error) {
    console.error('❌ Error creating default admin:', error);
  }
}