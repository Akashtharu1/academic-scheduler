# Backend API Design Guidelines for Harmony Scheduler

## Design Approach

**System-Based Approach**: RESTful API architecture following industry best practices for educational management systems, drawing inspiration from platforms like Canvas LMS and Blackboard's API patterns, with emphasis on scalability and clear separation of concerns.

## API Structure & Organization

### Core Design Principles
- **Resource-Oriented Design**: Each entity (Faculty, Courses, Rooms, Timetables) as a distinct resource with standard CRUD operations
- **Versioned API**: Use `/api/v1/` prefix for future-proofing
- **Consistent Naming**: Plural nouns for collections (`/faculty`, `/courses`, `/rooms`)
- **Predictable Patterns**: Standard HTTP methods (GET, POST, PUT, PATCH, DELETE)

### Authentication Architecture
- **JWT-based authentication** with refresh tokens
- Password hashing using bcrypt (minimum 12 rounds)
- Session management with configurable expiration
- Role-based access control middleware (admin, faculty, student)
- Password requirements: minimum 8 characters, uppercase, lowercase, number, special character

## API Endpoint Organization

### Authentication Module
```
POST /api/v1/auth/register - User registration
POST /api/v1/auth/login - User login (returns JWT)
POST /api/v1/auth/refresh - Refresh access token
POST /api/v1/auth/logout - Invalidate session
GET /api/v1/auth/me - Current user profile
```

### Resource Endpoints
**Standard CRUD pattern for all resources:**
- `GET /api/v1/{resource}` - List all (with pagination, filtering)
- `GET /api/v1/{resource}/:id` - Get single item
- `POST /api/v1/{resource}` - Create new
- `PUT /api/v1/{resource}/:id` - Update entire resource
- `PATCH /api/v1/{resource}/:id` - Partial update
- `DELETE /api/v1/{resource}/:id` - Delete resource

### Timetable Generation
```
POST /api/v1/timetables/generate - Generate new timetable
GET /api/v1/timetables/versions - List all versions
POST /api/v1/timetables/:id/conflicts/resolve - Resolve conflicts
GET /api/v1/timetables/:id/export - Export timetable (PDF/CSV)
```

### Analytics Endpoints
```
GET /api/v1/analytics/room-utilization - Room usage statistics
GET /api/v1/analytics/teacher-load - Faculty workload analysis
GET /api/v1/analytics/conflicts - Conflict trends and statistics
```

## Response Format Standards

### Success Response Structure
```
{
  "success": true,
  "data": {...},
  "meta": {
    "timestamp": "ISO-8601",
    "version": "v1"
  }
}
```

### Error Response Structure
```
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {...}
  },
  "meta": {
    "timestamp": "ISO-8601"
  }
}
```

### Pagination Format
```
{
  "data": [...],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Data Validation & Business Rules

- **Input Validation**: Validate all inputs at controller level using validation library (Joi/Zod)
- **Conflict Detection**: Implement real-time conflict checking for room/faculty/time overlaps
- **Constraints Enforcement**: 
  - Faculty max hours per week validation
  - Room capacity vs. course enrollment checks
  - Time slot availability verification
- **Soft Deletes**: Mark resources as inactive rather than deleting

## Database Schema Considerations

- **User Table**: id, email, password_hash, role, department, created_at, updated_at
- **Faculty Table**: Links to User, includes availability JSON, preferences array
- **Timetable Versions**: Immutable versions with full audit trail
- **Indexes**: On frequently queried fields (department, semester, status)

## Security & Performance

- **Rate Limiting**: 100 requests/minute per user for standard endpoints, 10/minute for generation
- **CORS Configuration**: Whitelist frontend domain only
- **Input Sanitization**: Prevent SQL injection, XSS attacks
- **Query Optimization**: Use database indexes, implement caching for analytics
- **File Upload Limits**: Maximum 5MB for any file uploads

## Algorithm Integration

- Support for three timetable generation methods: GA (Genetic Algorithm), DRL (Deep Reinforcement Learning), OR (Operations Research)
- Configurable weights for conflict penalties, teacher preferences, room utilization
- Progress tracking for long-running generation tasks using WebSocket or polling endpoint

This backend design prioritizes scalability, maintainability, and seamless integration with the existing React frontend while ensuring robust authentication and data integrity.