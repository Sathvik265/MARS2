# Restaurant Billing App — Deployment Package

This folder contains the compiled application only. There is no readable
source code in here — `backend\rbs-backend.exe` and `frontend\rbs-frontend.exe`
are self-contained executables with the Node.js runtime and all app code
built in.

## What's in this package
```
backend/
  rbs-backend.exe        <- compiled API server
  .env                    <- DB connection config (EDIT THIS FIRST)
  Final_Dump_Fixed.sql    <- database schema + seed data
frontend/
  rbs-frontend.exe        <- compiled static web server (serves the UI)
install-services.ps1      <- installs both as always-on Windows services
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

## Setup steps (run on the target machine)

### 1. Install PostgreSQL
Download from postgresql.org, set a password for the `postgres` user, remember it.

### 2. Create the database and load the schema
Using pgAdmin or `psql`:
```
createdb -U postgres restaurant_billing
psql -U postgres -d restaurant_billing -f backend\Final_Dump_Fixed.sql
```

### 3. Edit `backend\.env`
Open it in Notepad and set the real values:
```
DB_USER=postgres
DB_PASSWORD=<the password you set above>
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restaurant_billing
PORT=8000
```

### 4. Download NSSM
Get `nssm.exe` from https://nssm.cc/ and note its path (e.g. `C:\tools\nssm\nssm.exe`).

### 5. Install both services (run PowerShell as Administrator)
```powershell
cd path\to\this\extracted\folder
.\install-services.ps1 -NssmPath 'C:\tools\nssm\nssm.exe' -StartServices
```

This registers `RBSBackend` and `RBSFrontend` as Windows services set to
**Automatic** startup — they come up on boot with no one needing to log in
or open a terminal, and keep running in the background indefinitely.

### 6. Use the app
Open a browser on this machine to:
```
http://localhost:3000
```

## Checking on it later
```powershell
Get-Service RBSBackend, RBSFrontend      # check status
nssm restart RBSBackend                  # restart if needed
```
Logs are written to `backend\service-std*.log` and `frontend\service-std*.log`.

## Uninstalling
```powershell
nssm stop RBSBackend
nssm remove RBSBackend confirm
nssm stop RBSFrontend
nssm remove RBSFrontend confirm
```
