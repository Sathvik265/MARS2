# Restaurant Billing App — Deployment Package

This folder contains the compiled application only. There is no readable
source code in here — `backend\rbs-backend.exe` and `frontend\rbs-frontend.exe`
are self-contained executables with the Node.js runtime and all app code
built in.

## What's in this package
```
backend/
  rbs-backend.exe        <- compiled API server
  .env                    <- DB connection config (created/configured automatically or manually)
  Final_Dump_Fixed.sql    <- database schema + seed data
frontend/
  rbs-frontend.exe        <- compiled static web server (serves the UI)
RunApp.bat                <- Double-click to run app directly for testing/development (with auto-DB setup)
run-local.ps1             <- PowerShell script runner invoked by RunApp.bat
install-services.ps1      <- installs both as always-on background Windows services
README.md                 <- this file
```

## One important limitation, up front

The **backend** (`rbs-backend.exe`) is a real compiled binary — its
JavaScript source is not sitting on disk as plain text, so casual inspection
won't reveal your business logic.

The **frontend** cannot be hidden the same way. It's a website: the browser
has to download its JavaScript to run it, so anyone with DevTools open can
always see the frontend's code, same as any web app (your bank's site
included). `rbs-frontend.exe` just serves those files — it doesn't add
protection to them. If frontend confidentiality genuinely matters, that's a
different problem (licensing/legal, or moving that logic server-side) than
packaging can solve.

---

## Running the Application

Ensure PostgreSQL is installed on the target machine before proceeding.

### Method 1: Local Run / Test Mode (No Service Setup)
This method is perfect for testing or quick development checks without setting up persistent background services.

#### Option A: Full App & Database Initialization (Recommended for First Run)
1. **Double-click `RunApp.bat`** at the root of the extracted package folder.
2. If this is your first run or your `backend\.env` is unconfigured, the console will prompt you to enter your PostgreSQL password.
3. The runner will automatically recreate and populate the `restaurant_billing_db` database, and then start the frontend and backend.
4. To stop, press **Enter** in the runner window.

#### Option B: Fast Run / App Only (Skips Database Setup)
Use this option if your database is already populated and you only want to start the frontend and backend quickly.
1. **Double-click `RunAppsOnly.bat`** at the root of the extracted package folder.
2. The runner will skip database initialization and start the frontend and backend directly.
3. To stop, press **Enter** in the runner window.

---

### Method 2: Persistent Service Setup (For Production Deployment)
This method installs the application as always-on Windows services that run in the background and start automatically on boot.

#### 1. Setup the Database and Schema
Using pgAdmin or `psql` (connect to system database `postgres` first):
```
psql -U postgres -d postgres -f backend\Final_Dump_Fixed.sql
```

#### 2. Edit `backend\.env`
Create or edit `backend\.env` and set the real values:
```env
DB_USER=postgres
DB_PASSWORD=<the password you set above>
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restaurant_billing_db
PORT=8000
```

#### 3. Download NSSM
Get `nssm.exe` from https://nssm.cc/ and note its path (e.g. `C:\tools\nssm\nssm.exe`).

#### 4. Install both services (run PowerShell as Administrator)
```powershell
cd path\to\this\extracted\folder
.\install-services.ps1 -NssmPath 'C:\tools\nssm\nssm.exe' -StartServices
```

This registers `RBSBackend` and `RBSFrontend` as Windows services set to **Automatic** startup — they come up on boot with no one needing to log in or open a terminal, and keep running in the background indefinitely.

#### 5. Use the app
Open a browser on this machine to:
```
http://localhost:3000
```

#### Checking on it later
```powershell
Get-Service RBSBackend, RBSFrontend      # check status
nssm restart RBSBackend                  # restart if needed
```
Logs are written to `backend\service-std*.log` and `frontend\service-std*.log`.

#### Uninstalling
```powershell
nssm stop RBSBackend
nssm remove RBSBackend confirm
nssm stop RBSFrontend
nssm remove RBSFrontend confirm
```
