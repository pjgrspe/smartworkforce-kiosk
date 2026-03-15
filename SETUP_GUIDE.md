# DE WEBNET Setup Guide (New Laptop)

This guide is optimized for moving this project to another laptop quickly.

## 0. One-Click Setup (Recommended on Windows)

From project root, run:

  npm run setup:windows

Optional variants:

  npm run setup:windows:skip-install
  npm run setup:windows:mock
  npm run setup:windows:start

What it does:

- checks Node/npm
- creates .env and web/.env from examples if missing
- installs root/server/web dependencies
- seeds tenant and default role accounts
- optionally seeds mock data
- optionally opens server + web dev terminals

You can also run by double-clicking:

  scripts/setup-windows.cmd

Or directly with flags:

  powershell -ExecutionPolicy Bypass -NoProfile -File scripts/setup-windows.ps1 -IncludeMockData -StartServices

## 1. What You Need

- Windows 10/11
- Node.js 18+ and npm 9+
- Git
- MongoDB Atlas account or local MongoDB
- Optional: Python 3.8+ if you will run AI camera service

Quick checks:

  node --version
  npm --version
  git --version

## 2. Get the Project

Clone or copy the project to your laptop, then open this folder:

  C:/Users/Patrick/DEX/Apollo

## 3. Environment Setup

### 3.1 Root env

Copy example env:

  copy .env.example .env

Edit .env and set at least:

- MONGODB_URI
- JWT_SECRET
- CORS_ORIGIN
- HTTP_PORT

Important:

- Keep database name casing consistent as DEWEBNET.
- Example Atlas format:
  mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/DEWEBNET?retryWrites=true&w=majority

### 3.2 Web env (if needed)

If web uses env in your machine, create it in web folder:

  cd web
  if not exist .env copy .env.example .env

## 4. Install Dependencies

From project root:

  npm install

If needed, also run explicitly:

  cd server
  npm install
  cd ../web
  npm install

Optional AI setup:

  cd ../ai
  python -m venv venv
  venv\Scripts\activate
  pip install --upgrade pip
  pip install -r requirements.txt

## 5. Start the App

Open two terminals.

Terminal 1 (API server):

  cd C:/Users/Patrick/DEX/Apollo/server
  npm run dev

Terminal 2 (web app):

  cd C:/Users/Patrick/DEX/Apollo/web
  npm run dev

Default URLs:

- API: http://localhost:3000
- Web: http://localhost:5173

## 6. Seed System Accounts

Run once after DB is ready:

  cd C:/Users/Patrick/DEX/Apollo/server
  node scripts/seed.js

This creates or updates default users and resets their password.

Default password for all seeded users:

- admin123

Default seeded accounts:

- super_admin: admin@dewebnet.com
- client_admin: clientadmin@dewebnet.com
- hr_payroll: hr@dewebnet.com
- branch_manager: manager@dewebnet.com
- employee: employee@dewebnet.com
- auditor: auditor@dewebnet.com

Kiosk tenant code:

- DEWEBNET

## 7. Seed Mock Payroll Data (Optional)

For demo and testing payroll/attendance flows:

  cd C:/Users/Patrick/DEX/Apollo/server
  node scripts/seed-mock-payroll-dataset.js

This seeds:

- 5 mock employees
- salary structures
- realistic attendance logs

## 8. Quick Smoke Test

1. Login at http://localhost:5173/login using admin@dewebnet.com and admin123.
2. Open Employees page and verify records load.
3. Open Attendance page and test Export Excel.
4. Open Payroll Runs and create/compute a run.
5. Open Kiosk page and use tenant code DEWEBNET.

## 9. Known Issues and Fast Fixes

### Issue: Mongo error about different DB case

Error example: db already exists with different case...

Fix:

- Ensure MONGODB_URI uses DEWEBNET (uppercase), not dewebnet.
- Re-run:
  node scripts/seed.js

### Issue: Kiosk says invalid company code and shows APOLLO

Cause: old code cached in browser localStorage.

Fix:

- Click Reset / Change Company in kiosk and enter DEWEBNET.
- Hard refresh browser.

### Issue: Server fails to start on port 3000

Check if port is occupied:

  netstat -ano | findstr :3000

Either stop conflicting process or change HTTP_PORT in .env.

### Issue: Web starts but API calls fail

Check:

- server terminal is running
- CORS_ORIGIN includes http://localhost:5173
- API URL in web config points to http://localhost:3000/api

## 10. Transfer Checklist

When moving to another laptop, do these in order:

1. Install Node/npm/Git.
2. Copy project folder.
3. Create .env from .env.example.
4. Set MONGODB_URI and JWT_SECRET.
5. Run npm install in root, server, web.
6. Run server and web.
7. Run node scripts/seed.js.
8. Optional: run node scripts/seed-mock-payroll-dataset.js.
9. Login and verify pages.

Fast path using one-click setup:

1. Install Node/npm/Git.
2. Copy project folder.
3. Run npm run setup:windows.
4. Optional: run npm run setup:windows:skip-install if dependencies are already installed.
5. Optional: run npm run setup:windows:mock.
6. Login and verify pages.

## 11. Recommended Production Notes

- Change all default seeded passwords immediately.
- Change JWT_SECRET to a long random value.
- Restrict CORS_ORIGIN to trusted domains.
- Use strong MongoDB credentials and IP restrictions.
- Keep .env out of version control.
