# Apollo Facial Recognition Attendance System - Setup Guide

## Quick Start Guide

This guide will walk you through setting up the Apollo system from 0% to 100%.

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

1. **Node.js 18+**
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **Python 3.8+**
   - Download from: https://www.python.org/downloads/
   - Verify: `python --version`
   - ⚠️ **Important**: During installation, check "Add Python to PATH"

3. **Visual C++ Build Tools** (Required for face_recognition library)
   - Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Select "Desktop development with C++" workload
   - This is necessary for dlib compilation on Windows

4. **Git** (Optional, for version control)
   - Download from: https://git-scm.com/

### Required Accounts

1. **Supabase Account** (Free tier works)
   - Sign up at: https://supabase.com/
   - You'll create a project in Step 1

---

## Step-by-Step Setup

### Step 1: Supabase Project Setup

1. **Create New Supabase Project**
   - Go to https://supabase.com/dashboard
   - Click "New Project"
   - Choose a name (e.g., "apollo-attendance")
   - Set a strong database password (save this!)
   - Select a region close to you
   - Wait for project to initialize (~2 minutes)

2. **Get Credentials**
   - Go to Project Settings → API
   - Copy the following:
     - `Project URL` (e.g., https://xxxxx.supabase.co)
     - `anon public` key
     - `service_role` key (⚠️ Keep this secret!)

3. **Run Database Migration**
   - Go to SQL Editor in Supabase dashboard
   - Click "New Query"
   - Copy the entire contents of `/home/pgorospe-dsdc/Projects/Apollo/supabase/migrations/001_initial_schema.sql`
   - Paste into the SQL editor
   - Click "Run"
   - You should see success messages

4. **Create Admin User**
   - Go to Authentication → Users
   - Click "Add User"
   - Enter email: `admin@example.com` (or your email)
   - Enter a secure password
   - Click "Create User"

5. **Promote User to Admin**
   - Go back to SQL Editor
   - Run this query (replace with your email):
   ```sql
   UPDATE auth.users
   SET raw_app_meta_data = jsonb_set(
       COALESCE(raw_app_meta_data, '{}'::jsonb),
       '{role}',
       '"admin"'
   )
   WHERE email = 'admin@example.com';
   ```

6. **Verify Setup**
   - Go to Database → Tables
   - You should see: `employees`, `attendance_logs`
   - Go to Storage
   - You should see: `employee-photos` bucket

✅ **Supabase setup complete!**

---

### Step 2: Configure Environment Variables

1. **Create Root .env File**
   ```bash
   cd /home/pgorospe-dsdc/Projects/Apollo
   cp .env.example .env
   ```

2. **Edit .env File**
   Open `/home/pgorospe-dsdc/Projects/Apollo/.env` and update:
   ```bash
   # Supabase - FROM STEP 1
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR...

   # WebSocket (default is fine)
   WS_PORT=8080
   WS_HOST=localhost

   # AI Engine (defaults  are recommended)
   CAMERA_INDEX=0
   CONFIDENCE_THRESHOLD=0.6
   FPS=15
   RECOGNITION_COOLDOWN_MINUTES=5
   ```

3. **Create Web App .env File**
   ```bash
   cd web
   cp .env.example .env
   ```

4. **Edit web/.env File**
   ```bash
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...
   VITE_WS_URL=ws://localhost:8080
   ```

✅ **Environment configured!**

---

### Step 3: Install Dependencies

1. **Install Root Dependencies**
   ```bash
   cd /home/pgorospe-dsdc/Projects/Apollo
   npm install
   ```

2. **Install Server Dependencies**
   ```bash
   cd server
   npm install
   cd ..
   ```

3. **Install Web App Dependencies**
   ```bash
   cd web
   npm install
   cd ..
   ```

4. **Install Python Dependencies**
   ```bash
   cd ai
   python -m venv venv

   # Activate virtual environment
   # On Windows:
   venv\Scripts\activate
   # On Linux/Mac:
   # source venv/bin/activate

   # Install packages
   pip install --upgrade pip
   pip install cmake  # Required for dlib
   pip install dlib   # This may take 5-10 minutes
   pip install -r requirements.txt

   cd ..
   ```

   **Troubleshooting Python Installation:**
   - If dlib fails to install:
     - Ensure Visual C++ Build Tools are installed
     - Restart your terminal
     - Try: `pip install dlib --no-cache-dir`
   - If face_recognition fails:
     - Install dlib first (see above)
     - Then: `pip install face-recognition`

✅ **All dependencies installed!**

---

### Step 4: Test Individual Components

Test each component separately before running together.

#### Test 1: Node.js Server

```bash
cd /home/pgorospe-dsdc/Projects/Apollo/server
npm start
```

**Expected output:**
```
🚀 Starting Apollo Server...
✅ Supabase sync service initialized
✅ Offline buffer service initialized
✅ Controllers initialized
✅ Apollo Server started successfully
📡 WebSocket server listening on ws://localhost:8080
```

**Troubleshooting:**
- If "Missing SUPABASE_URL": Check your .env file
- If "EADDRINUSE": Port 8080 is in use, change WS_PORT in .env

Keep this running and open a new terminal for next steps.

#### Test 2: React Web App

```bash
cd /home/pgorospe-dsdc/Projects/Apollo/web
npm run dev
```

**Expected output:**
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Visit http://localhost:5173/login in your browser.
- Try logging in with your admin credentials
- You should see the Admin Panel

#### Test 3: Python AI Engine

**⚠️ Important**: Connect a USB camera before this step!

```bash
cd /home/pgorospe-dsdc/Projects/Apollo/ai
# Make sure venv is activated
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

python main.py
```

**Expected output:**
```
🚀 Starting Apollo AI Engine...
Configuration: 640x480 @ 15 FPS
✅ Camera initialized
✅ Recognition service initialized
✅ WebSocket connected
✅ Apollo AI Engine started successfully
```

**Troubleshooting:**
- Camera error: Check camera permissions, close other apps using camera
- WebSocket error: Ensure Node.js server is running
- Import errors: Activate venv and reinstall requirements

✅ **All components working!**

---

### Step 5: Add Your First Employee

1. **Prepare 3-5 Photos**
   - Take 3-5 photos of yourself or a test employee
   - Different angles: front, left, right, slight tilt
   - Good lighting, clear face
   - Save as JPG files

2. **Upload via Admin Panel**
   - Go to http://localhost:5173/admin
   - Click "Employees" tab
   - Click "Add Employee"
   - Fill in details:
     - Name: Your Name
     - Email: your.email@example.com
     - Department: Engineering (optional)
     - Position: Test User (optional)
   - Upload 3-5 photos
   - Click "Save"

3. **Verify in Database**
   - Go to Supabase Dashboard → Table Editor
   - Check `employees` table
   - You should see your new employee with face_encodings

4. **Test Recognition**
   - Ensure Python AI engine is running
   - Stand in front of camera
   - Within 2-3 seconds, you should see:
     - Console: "✅ Match: Your Name (confidence: 0.85)"
     - Kiosk UI: Welcome message with your name
     - Admin Panel: New attendance log

✅ **First employee added and recognized!**

---

### Step 6: Production Deployment with PM2

1. **Install PM2 Globally**
   ```bash
   npm install -g pm2 pm2-windows-service
   ```

2. **Install PM2 as Windows Service**
   ```bash
   pm2-service-install -n PM2
   ```

3. **Start All Services**
   ```bash
   cd /home/pgorospe-dsdc/Projects/Apollo
   pm2 start pm2.ecosystem.config.js
   ```

4. **Save PM2 Configuration**
   ```bash
   pm2 save
   ```

5. **Verify Services**
   ```bash
   pm2 list
   ```

   You should see:
   - apollo-server (online)
   - apollo-ai (online)
   - apollo-web (online)

6. **View Logs**
   ```bash
   pm2 logs
   ```

7. **Monitor Resources**
   ```bash
   pm2 monit
   ```

✅ **Production deployment complete!**

---

### Step 7: Configure Windows Auto-Start

#### Option A: Kiosk Mode (Recommended for Kiosk Deployment)

1. **Create Kiosk Batch File**
   - Create `C:\Apollo\start-kiosk.bat`:
   ```batch
   @echo off
   start /max chrome.exe --kiosk --app=http://localhost:5173/kiosk --disable-pinch --overscroll-history-navigation=0
   ```

2. **Add to Startup**
   - Press `Win + R`
   - Type `shell:startup`
   - Create shortcut to `C:\Apollo\start-kiosk.bat`

3. **Optional: Auto-Login Windows**
   - Press `Win + R`
   - Type `netplwiz`
   - Uncheck "Users must enter a username and password"
   - Enter your Windows credentials

#### Option B: Admin Panel Auto-Start

Skip kiosk batch file, just open browser to:
http://localhost:5173/admin

✅ **Auto-start configured!**

---

### Step 8: Configure Windows Firewall (Optional)

If accessing from other devices on network:

```powershell
# Run as Administrator
netsh advfirewall firewall add rule name="Apollo WebSocket" dir=in action=allow protocol=TCP localport=8080
netsh advfirewall firewall add rule name="Apollo Web App" dir=in action=allow protocol=TCP localport=5173
```

✅ **Firewall configured!**

---

## Testing the Complete System

### Test Scenario 1: Happy Path

1. Start all services (PM2 should auto-start)
2. Open Kiosk: http://localhost:5173/kiosk
3. Stand in front of camera
4. **Expected**: Welcome screen appears within 2 seconds
5. **Expected**: Attendance log appears in kiosk UI
6. Open Admin Panel in another browser
7. **Expected**: New attendance log appears in real-time

### Test Scenario 2: Offline Resilience

1. Disable internet connection (disable network adapter)
2. Stand in front of camera 3 times
3. Check Node.js logs: `pm2 logs apollo-server`
4. **Expected**: "Buffered attendance log" messages
5. **Expected**: "Connection lost, buffering mode active"
6. Re-enable internet
7. **Expected**: "Connection restored, starting sync..."
8. **Expected**: All 3 attendance logs sync to Supabase
9. Verify in Supabase Dashboard → attendance_logs table

### Test Scenario 3: System Recovery

1. Kill Python AI: `pm2 stop apollo-ai`
2. Wait 30 seconds
3. **Expected**: PM2 auto-restarts: `pm2 list` shows online
4. **Expected**: Python reconnects to WebSocket
5. System continues normal operation

✅ **All tests passing!**

---

## Common Issues & Solutions

### Issue: "Camera not found"
**Solution:**
- Check camera is plugged in
- Close other apps using camera (Zoom, Teams, etc.)
- Try different CAMERA_INDEX (0, 1, 2) in .env
- Add Python to Windows Defender exclusions

### Issue: "Face recognition too slow"
**Solution:**
- Reduce FPS in .env (try 10 instead of 15)
- Reduce FRAME_WIDTH/HEIGHT (try 480x360)
- Ensure no other heavy processes running
- Check CPU usage with `pm2 monit`

### Issue: "WebSocket connection failed"
**Solution:**
- Ensure Node.js server is running: `pm2 list`
- Check firewall isn't blocking port 8080
- Verify WS_URL in web/.env matches server port

### Issue: "Low confidence scores"
**Solution:**
- Upload more photos (5 instead of 3)
- Ensure good lighting when training and recognizing
- Try different angles in training photos
- Lower CONFIDENCE_THRESHOLD (0.5) for testing

### Issue: "Sync not working"
**Solution:**
- Verify Supabase credentials in .env
- Check internet connection
- Use Force Sync button in Admin Panel
- Check logs: `pm2 logs apollo-server`

---

## Maintenance

### Daily
- Check PM2 status: `pm2 list`
- View logs for errors: `pm2 logs --lines 50`

### Weekly
- Review attendance logs in Admin Panel
- Check pending sync count
- Restart services if needed: `pm2 restart all`

### Monthly
- Update employee photos if accuracy decreases
- Review and archive old logs
- Check disk space: `pm2 monit`

---

## Next Steps

1. **Add More Employees**
   - Use Admin Panel to add all employees
   - Ensure 3-5 photos per person

2. **Customize**
   - Adjust confidence threshold
   - Modify cooldown period
   - Customize kiosk UI colors/branding

3. **Backup**
   - Backup Supabase database (Project Settings → Database → Backups)
   - Backup .env file
   - Export employee data periodically

4. **Monitor**
   - Set up email alerts (optional, see .env.example)
   - Monitor PM2 dashboard
   - Review attendance patterns

---

## Support

For issues:
1. Check logs: `pm2 logs`
2. Review this guide
3. Check Supabase dashboard for errors
4. Verify all prerequisites installed

---

## Success Checklist

- [ ] Supabase project created and configured
- [ ] Database schema migrated successfully
- [ ] Admin user created and promoted
- [ ] Environment variables configured
- [ ] All dependencies installed (Node, Python, packages)
- [ ] Server starts without errors
- [ ] Web app loads and login works
- [ ] Python AI connects to camera
- [ ] First employee added with photos
- [ ] Face recognition works
- [ ] Attendance logs in real-time
- [ ] Offline sync tested and working
- [ ] PM2 services running
- [ ] Auto-start configured
- [ ] System tested end-to-end

**Congratulations! Your Apollo Facial Recognition Attendance System is now at 100%! 🎉**
