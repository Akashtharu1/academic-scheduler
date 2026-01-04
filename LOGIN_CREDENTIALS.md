# Login Credentials

## 🎉 System Features:
- ✅ **Secure CSV-based authentication** - no public signup
- ✅ **Faculty availability scheduling** - day/time range selection  
- ✅ **Complete timetable management** - generation and analytics
- ✅ **Role-based access control** - admin/faculty/student roles
- ✅ **Optimized codebase** - removed unused components and dependencies

## Admin Accounts
| Username | Password | Role | Department |
|----------|----------|------|------------|
| admin | admin123 | admin | IT |
| principal | principal123 | admin | Administration |
| registrar | registrar123 | admin | Administration |

## Faculty Accounts
| Username | Password | Role | Department |
|----------|----------|------|------------|
| john.smith | faculty123 | faculty | Computer Science |
| jane.doe | faculty123 | faculty | Mathematics |
| robert.brown | faculty123 | faculty | Physics |
| sarah.wilson | faculty123 | faculty | Chemistry |
| michael.davis | faculty123 | faculty | Biology |

## Student Accounts (15 total)
| Username | Password | Role | Department |
|----------|----------|------|------------|
| student001 | student123 | student | Computer Science |
| student002 | student123 | student | Mathematics |
| student003 | student123 | student | Physics |
| student004 | student123 | student | Chemistry |
| student005 | student123 | student | Biology |
| student006 | student123 | student | Computer Science |
| student007 | student123 | student | Mathematics |
| student008 | student123 | student | Physics |
| student009 | student123 | student | Computer Science |
| student010 | student123 | student | Mathematics |
| student011 | student123 | student | Physics |
| student012 | student123 | student | Chemistry |
| student013 | student123 | student | Biology |
| student014 | student123 | student | Computer Science |
| student015 | student123 | student | Mathematics |

## Important Notes

⚠️ **All users MUST change their password on first login**

🔒 **Signup is completely removed** - only pre-approved users can login

📝 **To add new users**: Edit the CSV files in `data/users/` and restart the server

🔑 **Default passwords are intentionally simple for testing** - change them immediately in production

## Adding New Users

1. Edit the appropriate CSV file in `data/users/`:
   - `admins.csv` for administrators
   - `faculty.csv` for faculty members  
   - `students.csv` for students

2. Add a new line with: `username,email,name,department,default_password`

3. Restart the server to load the new users

## Security Features

✅ No public signup - only pre-approved users
✅ Role-based access control
✅ Mandatory password change on first login
✅ Secure password hashing (bcrypt)
✅ JWT-based authentication