# SmartWorkforce Kiosk — Branch Deployment Guide

This guide is for IT staff setting up the attendance kiosk on a branch PC.

---

## What You Need

| Item | Requirement |
|---|---|
| PC / Laptop | Windows 10 or Windows 11 |
| RAM | 4 GB minimum (8 GB recommended) |
| Webcam | USB or built-in, 720p or higher |
| Internet | Required during setup; optional during daily use |
| Google Chrome | Must be installed before running the installer |
| Node.js | Installed automatically if missing |

---

## Before You Start

You will need the **company code** for the branch you are setting up.

| Company | Code |
|---|---|
| DE WEBNET | `DEWEBNET` |

> If you are setting up a new company, ask the system administrator to register it first at the management portal before proceeding.

---

## Step-by-Step Installation

### 1. Copy the kiosk-service folder to the PC

Copy the entire `kiosk-service` folder from the project to a permanent location on the branch PC. A good location is:

```
C:\SmartWorkforce\kiosk-service\
```

> Do not put it in Downloads or the Desktop — it will run permanently from this folder.

---

### 2. Run the installer

1. Open the `kiosk-service` folder
2. Right-click `install.ps1`
3. Select **"Run with PowerShell"**

> If Windows shows a security warning, click **"Run anyway"**. The script is safe.

The installer will:

- Check your Node.js version (installs LTS automatically if needed)
- Ask for the central server URL — **press Enter** to use the default
- Ask for the company code — type `DEWEBNET` (or the correct code for your company)
- Install all dependencies
- Download face recognition models (~7 MB, one time only)
- Build the kiosk interface
- Register the kiosk as a Windows service (auto-starts on boot)
- Create a **SmartWorkforce Kiosk** shortcut on the Desktop

The whole process takes about 3–5 minutes.

---

### 3. Verify the installation

After the installer finishes:

1. Double-click the **SmartWorkforce Kiosk** shortcut on the Desktop
2. Chrome opens in fullscreen kiosk mode
3. The kiosk should load and show the face recognition camera screen

In the bottom-right corner of the kiosk you will see a **Sync** indicator:

| Indicator | Meaning |
|---|---|
| 🟢 Synced | Connected to central server, all punches uploaded |
| 🟡 X pending | Connected, but some punches are still uploading |
| 🔴 Offline | Cannot reach central server — punches are saved locally |

> The kiosk works fully offline. Punches are saved locally and will sync automatically when internet is restored.

---

### 4. Enroll employee faces

Before employees can use the kiosk, their faces must be enrolled in the system.

1. Log in to the management portal: **https://abg-hrd.dewebnetsolution.com**
2. Go to **Employees**
3. Click **Enroll Face** next to each employee
4. Follow the on-screen instructions (requires a camera)

The kiosk will automatically download the updated face data within 10 minutes. You can also restart the kiosk service to pull it immediately (see Troubleshooting below).

---

## Daily Use

- The kiosk starts automatically when the PC boots — no manual action needed
- Employees stand in front of the camera, blink twice to verify liveness, then tap their punch type
- Punches sync to the central server every 30 seconds when online

---

## Troubleshooting

### Kiosk shortcut does not open / Chrome shows error

The kiosk service may not be running. Open PowerShell and run:

```powershell
pm2 status
```

If `smartworkforce-kiosk` shows `errored` or `stopped`:

```powershell
pm2 restart smartworkforce-kiosk
pm2 logs smartworkforce-kiosk --lines 30
```

---

### Kiosk shows "No employee data cached yet"

The kiosk has never synced with the central server. Make sure:

1. The PC has internet access
2. The company code in `.env` is correct (`C:\SmartWorkforce\kiosk-service\.env`)
3. Run `pm2 restart smartworkforce-kiosk` and wait 30 seconds

---

### Kiosk shows "No enrolled faces found"

No employees have been enrolled yet. Log in to the management portal and enroll faces as described in Step 4.

---

### Face not recognized / recognition is slow

- Make sure the room has good lighting (avoid backlit setups — don't place the camera facing a window)
- Clean the webcam lens
- The employee may need to re-enroll their face (go to Employees → Re-enroll Face)

---

### Reinstall / update the kiosk

To reinstall or update to a newer version:

1. Stop the current service:
   ```powershell
   pm2 stop smartworkforce-kiosk
   pm2 delete smartworkforce-kiosk
   ```
2. Replace the `kiosk-service` folder with the new version
3. Run `install.ps1` again

Your `.env` file (company code, server URL) will be overwritten during reinstall — the installer will ask you to re-enter the values.

---

### Manually open the kiosk (without the desktop shortcut)

Open Chrome and go to:

```
http://localhost:4000/kiosk
```

Or create a new shortcut manually with this target:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://localhost:4000/kiosk --no-first-run --disable-infobars
```

---

## Service Reference

| Item | Value |
|---|---|
| Kiosk URL | http://localhost:4000/kiosk |
| WebSocket | ws://localhost:4001 |
| Config file | `kiosk-service\.env` |
| Database | `kiosk-service\data\kiosk.db` |
| PM2 service name | `smartworkforce-kiosk` |
| Central server | https://abg-hrd.dewebnetsolution.com |
| Sync interval | Every 30 seconds |
| Face model refresh | Every 10 minutes |

---

## Contact

For issues not covered in this guide, contact the system administrator.
