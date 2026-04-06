# DE WEBNET Facial Recognition Attendance System

## Migration Playbook

For the PostgreSQL + branch offline-first migration, follow:

- `POSTGRES_OFFLINE_MIGRATION_PLAYBOOK.md`

An enterprise-grade facial recognition attendance system with offline-first capabilities, built for Windows deployment.

## Features

- **Facial Recognition:** Multi-photo training (3-5 photos per employee) for accurate recognition
- **Offline-First:** Local buffering with automatic cloud sync when connectivity is restored
- **Real-Time Updates:** WebSocket-based communication for instant attendance notifications
- **Dual Interface:**
  - **Kiosk Mode:** Full-screen display for employee check-ins
  - **Admin Panel:** Employee management and attendance reporting
- **Secure:** Supabase Auth with role-based access control (RLS policies)
- **Production-Ready:** PM2 process management with auto-restart and monitoring

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Python    │ ──────> │   Node.js    │ ──────> │   React     │
│  AI Engine  │ WebSocket│  Middleware  │ WebSocket│  Web App    │
│             │         │              │         │             │
│ - OpenCV    │         │ - WebSocket  │         │ - Kiosk UI  │
│ - face_rec  │         │ - NeDB       │         │ - Admin UI  │
│ - DirectShow│         │ - Supabase   │         │ - Auth      │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │   Supabase   │
                        │  PostgreSQL  │
                        │     +RLS     │
                        └──────────────┘
```

## Tech Stack

- **AI Engine:** Python 3.8+, OpenCV, face_recognition, WebSocket
- **Middleware:** Node.js 18+, ws, NeDB, Supabase JS
- **Frontend:** React 18, Vite, Tailwind CSS, Framer Motion
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Deployment:** PM2 on Windows 10/11

## Quick Start

### Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **Python 3.8+** - [Download](https://www.python.org/downloads/)
3. **Visual C++ Build Tools** - Required for dlib library
   - [Download Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Select "Desktop development with C++" workload
4. **Supabase Account** - [Sign up](https://supabase.com/)

### Installation

1. Clone the repository:
   ```bash
   cd /home/pgorospe-dsdc/Projects/DE WEBNET
   ```

2. Install dependencies:
   ```bash
   npm run install:all
   ```

3. Set up environment variables:
   ```bash
   copy .env.example .env
   # Edit .env with your Supabase credentials
   ```

4. Set up Supabase:
   - Create a new project at https://supabase.com
   - Copy the Project URL and anon key to `.env`
   - Run the migration script in SQL Editor:
     ```bash
     # Copy content from supabase/migrations/001_initial_schema.sql
     ```

5. Create an admin user:
   - Sign up via Supabase Auth UI with your email
   - Run this SQL query to promote to admin:
     ```sql
     UPDATE auth.users
     SET raw_app_meta_data = jsonb_set(
         COALESCE(raw_app_meta_data, '{}'::jsonb),
         '{role}',
         '"admin"'
     )
     WHERE email = 'your-admin@example.com';
     ```

### Development

Run all services in development mode:

```bash
# Terminal 1: Node.js server
npm run dev:server

# Terminal 2: React web app
npm run dev:web

# Terminal 3: Python AI engine
npm run dev:ai
```

Access the application:
- **Kiosk:** http://localhost:5173/kiosk
- **Admin:** http://localhost:5173/admin
- **WebSocket:** ws://localhost:8080

### Production Deployment (Windows)

1. Install PM2 globally:
   ```bash
   npm install -g pm2 pm2-windows-service
   pm2-service-install -n PM2
   ```

2. Build web app:
   ```bash
   npm run build:web
   ```

3. Start all services:
   ```bash
   npm start
   ```

4. Save PM2 configuration:
   ```bash
   pm2 save
   ```

5. Set up Chrome kiosk mode:
   - Create `C:\DE WEBNET\start-kiosk.bat`:
     ```batch
     @echo off
     start /max chrome.exe --kiosk --app=http://localhost:5173/kiosk --disable-pinch
     ```
   - Add shortcut to Startup folder: `Win+R`, type `shell:startup`

6. Configure Windows Firewall:
   - Allow port 8080 (WebSocket server)
   - Allow port 5173 (React app)

## Project Structure

```
DE WEBNET/
├── ai/                    # Python AI Engine
├── server/                # Node.js Middleware
├── web/                   # React Web App
├── supabase/              # Database migrations
├── logs/                  # Application logs
└── pm2.ecosystem.config.js # PM2 configuration
```

## Usage

### Admin Panel

1. **Add Employee:**
   - Navigate to Admin Panel
   - Click "Add Employee"
   - Fill in employee details
   - Upload 3-5 photos (different angles for better accuracy)
   - Submit

2. **View Attendance:**
   - Navigate to "Attendance Logs"
   - Filter by date range or employee
   - Export to CSV

3. **System Status:**
   - Monitor AI engine, database, and sync status
   - Force sync if needed

### Kiosk Mode

1. Employee stands in front of camera
2. Face is detected and matched
3. Attendance is logged (if confidence > threshold)
4. Welcome message is displayed
5. Cooldown period prevents duplicate check-ins (5 minutes)

## Configuration

### Face Recognition Settings

- **Confidence Threshold:** Adjust `CONFIDENCE_THRESHOLD` in `.env`
  - Lower (0.5): More lenient, may have false positives
  - Higher (0.7): Stricter, may miss some faces
  - Recommended: 0.6

- **Cooldown Period:** Adjust `RECOGNITION_COOLDOWN_MINUTES` to prevent duplicate check-ins

### Camera Settings

- **Resolution:** 640x480 (optimal for performance)
- **FPS:** 15 frames per second
- **Backend:** DirectShow (Windows)

### Offline Sync

- **Retry Attempts:** 5 maximum retries
- **Retry Delay:** 5 seconds between retries
- **Connectivity Check:** Every 10 seconds

## Troubleshooting

### Camera Not Working

1. Ensure camera is not in use by another application
2. Add Python to Windows Defender exclusions
3. Grant camera permissions: Settings → Privacy → Camera
4. Verify DirectShow drivers are installed

### WebSocket Connection Failed

1. Check if port 8080 is available
2. Verify firewall settings
3. Ensure server is running: `pm2 list`

### Face Recognition Accuracy Issues

1. Upload more photos (3-5 from different angles)
2. Ensure good lighting conditions
3. Adjust confidence threshold
4. Check camera resolution

### Sync Not Working

1. Verify Supabase credentials in `.env`
2. Check internet connectivity
3. Review logs: `pm2 logs de-webnet-server`
4. Force sync from Admin Panel

## Monitoring

```bash
# View all services
pm2 list

# View logs
pm2 logs

# Monitor resources
pm2 monit

# Restart service
pm2 restart de-webnet-server
```

## Security Notes

- All attendance logs require authentication
- Admin operations require `admin` role
- RLS policies enforce row-level security
- Face encodings stored encrypted in Supabase
- WebSocket connections are local-only by default

## License

MIT

## Support

For issues and feature requests, please create an issue in the repository.
