# Harmony Scheduler - Timetable Management System

## Overview
Harmony Scheduler is a comprehensive timetable management system for educational institutions. It manages faculty scheduling, course assignments, room allocations, and provides automated timetable generation using optimization algorithms.

## Current State
The application is fully functional with:
- Complete PostgreSQL database schema
- JWT-based authentication with refresh token rotation
- Role-based access control (admin, faculty, student)
- Full CRUD operations for faculty, courses, rooms, and timetables
- Timetable generation with conflict detection
- Analytics dashboard

## Project Architecture

### Backend (Express + TypeScript)
- `server/routes.ts` - API endpoints with JWT authentication middleware
- `server/storage.ts` - Database storage interface using Drizzle ORM
- `server/db.ts` - PostgreSQL database connection

### Frontend (React + TypeScript)
- `client/src/App.tsx` - Main app with routing and sidebar
- `client/src/lib/auth.ts` - Zustand auth store with token management
- `client/src/lib/queryClient.ts` - TanStack Query with auth headers

### Shared
- `shared/schema.ts` - Drizzle ORM schema and Zod validation

## Authentication System

### JWT Token Flow
1. **Login/Register**: Returns access token (15min) + refresh token (7 days)
2. **API Requests**: Access token sent in Authorization header
3. **Token Refresh**: Refresh token rotated on each use (prevents replay attacks)
4. **Logout**: All refresh tokens for user are revoked

### Security Features
- Passwords hashed with bcrypt (12 rounds)
- Refresh tokens stored as SHA-256 hashes in database
- Token rotation on refresh (old token revoked, new one issued)
- Password change revokes all refresh tokens

### API Authentication
- `requireAuth` middleware validates access tokens
- `requireRole(...roles)` composes with requireAuth for RBAC

## Database Schema
- `users` - User accounts with roles
- `faculty` - Faculty profiles with availability
- `courses` - Course definitions with credit hours
- `rooms` - Room inventory with facilities
- `timetables` - Generated timetable versions
- `scheduled_slots` - Individual class slots
- `refresh_tokens` - Secure token storage with rotation

## Key Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - JWT signing secret

## Recent Changes
- December 2024: Implemented JWT authentication with secure refresh token rotation
- Consolidated requireAuth/requireRole middleware
- Added refresh_tokens table for server-side token validation
- Password changes now invalidate all sessions

## User Preferences
- Dark mode support enabled
- Role-based dashboard views
