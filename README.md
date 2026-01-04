# 🎓 Academic Scheduler

A comprehensive timetable management system for educational institutions built with React, TypeScript, and Express.

## ✨ Features

- 🔐 **Secure CSV-based Authentication** - No public signup, admin-controlled user management
- 📅 **Faculty Availability Scheduling** - Set specific days and time ranges for faculty availability
- 🏫 **Complete Timetable Management** - Generate, view, and manage academic timetables
- 📊 **Analytics Dashboard** - Room utilization, faculty workload, and conflict analysis
- 👥 **Role-based Access Control** - Admin, Faculty, and Student roles with appropriate permissions
- 🏢 **Room & Course Management** - Comprehensive CRUD operations for rooms and courses
- 📱 **Mobile Responsive** - Works seamlessly on desktop and mobile devices
- ⚡ **Optimized Performance** - Clean, efficient codebase with minimal dependencies

## 🏗️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Radix UI** components
- **TanStack Query** for data fetching
- **Zustand** for state management
- **Wouter** for routing

### Backend
- **Express.js** with TypeScript
- **PostgreSQL** database
- **Drizzle ORM** for database operations
- **JWT Authentication** with refresh tokens
- **bcrypt** for password hashing

## 🚀 Quick Start

### Prerequisites
- Node.js v20+
- PostgreSQL database
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/academic-scheduler.git
   cd academic-scheduler
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL and session secret
   ```

4. **Run database migrations**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Open http://localhost:5000 in your browser

## 📋 Default Login Credentials

### Admin Account
- **Username:** `admin`
- **Password:** `admin123`

### Faculty Account
- **Username:** `john.smith`
- **Password:** `faculty123`

### Student Account
- **Username:** `student001`
- **Password:** `student123`

⚠️ **All users must change their password on first login**

## 📁 Project Structure

```
academic-scheduler/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Application pages
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utilities and configurations
├── server/                # Express backend
│   ├── routes.ts          # API routes
│   ├── storage.ts         # Database operations
│   ├── csvLoader.ts       # CSV data loading
│   └── index.ts           # Server entry point
├── shared/                # Shared types and utilities
├── data/                  # CSV data files
│   ├── users/            # User data (admin, faculty, students)
│   ├── courses/          # Course data
│   └── rooms/            # Room data
└── migrations/           # Database migrations
```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run tests
- `npm run db:push` - Push database schema changes

## 📊 System Features

### 🏫 Room Management
- 27 rooms across 5 buildings
- Room capacity and facility tracking
- Availability scheduling

### 👨‍🏫 Faculty Management
- Faculty profiles with availability settings
- Workload tracking and analytics
- Department-based organization

### 📚 Course Management
- Course creation and management
- Credit hours and scheduling
- Department categorization

### 📈 Analytics
- Room utilization statistics
- Faculty workload analysis
- Conflict detection and resolution

## 🔒 Security Features

- JWT-based authentication with refresh token rotation
- Password hashing with bcrypt
- Role-based access control
- CSV-based user management (no public registration)
- Session management with configurable expiration

## 📱 Mobile Support

The application is fully responsive and includes PWA (Progressive Web App) capabilities:
- Add to home screen functionality
- Offline-ready design
- Mobile-optimized interface

## 🚀 Deployment

### Option 1: Vercel (Recommended)
```bash
npm i -g vercel
vercel
```

### Option 2: Railway
```bash
npm i -g @railway/cli
railway login
railway deploy
```

### Option 3: Render
1. Connect your GitHub repository to Render
2. Configure build and start commands
3. Deploy automatically

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern web technologies
- Inspired by academic scheduling needs
- Optimized for performance and usability

## 📞 Support

For support and questions, please open an issue in the GitHub repository.

---

**Made with ❤️ for educational institutions**