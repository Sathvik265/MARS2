<#
.SYNOPSIS
    Automated Setup and Run Script for Restaurant Billing App
    
.DESCRIPTION
    This script installs Git, clones/updates the repo, installs dependencies 
    (Node.js, PostgreSQL 17, pgAdmin 4), configures the database, 
    installs project packages, and starts the application.
    
    WARNING: This script should be run as Administrator.
#>

# Check for Administrator privileges
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "This script requires Administrator privileges to install software."
    Write-Warning "Please right-click the script and select 'Run with PowerShell' -> 'Run as Administrator', or run 'powershell' as admin."
    Exit
}

$ErrorActionPreference = "Stop"
$scriptPath = $PSScriptRoot
$dbName = "restaurant_billing_db"
$dbUser = "postgres"
$dbHost = "localhost"
$dbPort = "5432"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   RESTAURANT BILLING APP - AUTOMATED SETUP & RUN" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Function to check command availability
function Test-CommandExists {
    param ($command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $path = Get-Command $command
    $ErrorActionPreference = $oldPreference
    return $null -ne $path
}

# ==============================================================================
# 1. GIT INSTALLATION & REPOSITORY SETUP
# ==============================================================================

Write-Host "`n[1/6] Setting up Git and Repository..." -ForegroundColor Yellow

# Install Git
if (Test-CommandExists "git") {
    Write-Host "   - Git is already installed." -ForegroundColor Green
} else {
    Write-Host "   - Installing Git..." -ForegroundColor Cyan
    winget install Git.Git --accept-source-agreements --accept-package-agreements --silent --force
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to install Git." }
    
    # Refresh env for current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Clone or Update Repository
Write-Host "   - Checking Repository Status..." -ForegroundColor Cyan
if (Test-Path -Path (Join-Path $scriptPath ".git")) {
    Write-Host "   - Git repository detected. Pulling latest changes..." -ForegroundColor Cyan
    try {
        git pull origin main
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   - Repository updated successfully." -ForegroundColor Green
        } else {
            Write-Warning "   - Failed to pull latest changes (possibly not on a tracked branch)."
        }
    } catch {
        Write-Warning "   - 'git pull' encountered an issue. Proceeding with current files."
    }
} else {
    Write-Host "   - Not a git repository root." -ForegroundColor Yellow
    # Logic to clone if meaningful. Since the script is running, we are likely in the folder.
    # If the folder is otherwise empty (except this script), we could clone.
    # For now, we assume the user has placed the files correctly or downloaded the zip.
    # Uncomment below to force clone into a subdir if needed.
    # git clone https://github.com/Sathvik265/rbs.git
}

# ==============================================================================
# 2. SYSTEM DEPENDENCIES (Node.js, PostgreSQL, pgAdmin 4)
# ==============================================================================

Write-Host "`n[2/6] Installing System Dependencies..." -ForegroundColor Yellow

# Install Node.js
if (Test-CommandExists "node") {
    Write-Host "   - Node.js is already installed." -ForegroundColor Green
} else {
    Write-Host "   - Installing Node.js (LTS)..." -ForegroundColor Cyan
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --source winget --silent
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to install Node.js." }
    # Refresh env
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Install PostgreSQL
if (Test-CommandExists "psql") {
    Write-Host "   - PostgreSQL is already installed." -ForegroundColor Green
} else {
    Write-Host "   - Installing PostgreSQL 17..." -ForegroundColor Cyan
    # Using interactive mode so user can set the superuser password
    Write-Host "   PLEASE NOTE: The PostgreSQL installer will open." -ForegroundColor Magenta
    Write-Host "   IMPORTANT: During installation, you will be asked to set a password for the 'postgres' user." -ForegroundColor Magenta
    Write-Host "   REMEMBER THIS PASSWORD! You will need to enter it shortly." -ForegroundColor Magenta
    
     winget install PostgreSQL.PostgreSQL.17 --accept-source-agreements --accept-package-agreements --source winget

    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to install PostgreSQL." }
    
    # Add Postgres bin to path manually if needed (Standard path)
    $pgPath = "C:\Program Files\PostgreSQL\17\bin"
    if (Test-Path $pgPath) {
        $env:Path += ";$pgPath"
        Write-Host "   - Added PostgreSQL bin to PATH." -ForegroundColor Green
    }
}

# Install pgAdmin 4
Write-Host "   - Checking pgAdmin 4..." -ForegroundColor Cyan
winget install PostgreSQL.pgAdmin --accept-source-agreements --accept-package-agreements --silent --force
Write-Host "   - pgAdmin 4 check/install complete." -ForegroundColor Green

# ==============================================================================
# 3. DATABASE CONFIGURATION
# ==============================================================================

Write-Host "`n[3/6] Configuring Database..." -ForegroundColor Yellow

# Prompt for DB Password
Write-Host "`n----------------------------------------------------------"
Write-Host "Please enter the password for the PostgreSQL 'postgres' user." -ForegroundColor Cyan
Write-Host "(This is the password you set during installation)" -ForegroundColor Cyan
$pgPassword = Read-Host -Prompt "Password" -AsSecureString
$pgPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword))
$env:PGPASSWORD = $pgPasswordPlain

# Create Database
Write-Host "   - Creating database '$dbName'..." -ForegroundColor Cyan
try {
    # Check if DB exists first, if not create
    # We use a trick: try select 1. If it fails (bad DB), create it.
    psql -U $dbUser -h $dbHost -p $dbPort -lqt | Select-String $dbName | Out-Null
    if ($LASTEXITCODE -eq 0) {
       Write-Host "   - Database '$dbName' already exists." -ForegroundColor Yellow
    } else {
       createdb -U $dbUser -h $dbHost -p $dbPort $dbName
       Write-Host "   - Database created successfully." -ForegroundColor Green
    }
} catch {
    # Fallback attempt
    Write-Host "   - Attempting to create database..." -ForegroundColor DarkGray
    createdb -U $dbUser -h $dbHost -p $dbPort $dbName 2>$null
}

# Run Final_Dump_Fixed.sql script (Create schema and Populate DB)
$sqlFile = Join-Path $scriptPath "Final_Dump_Fixed.sql"
if (Test-Path $sqlFile) {
    Write-Host "   - Executing schema & population script ($sqlFile)..." -ForegroundColor Cyan
    psql -U $dbUser -h $dbHost -p $dbPort -d $dbName -f $sqlFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   - Database populated successfully." -ForegroundColor Green
    } else {
        Write-Error "Failed to apply schema script. Please check connection/password."
    }
} else {
    Write-Error "Final_Dump_Fixed.sql not found in $scriptPath"
}

# ==============================================================================
# 4. BACKEND SETUP
# ==============================================================================

Write-Host "`n[4/6] Setting up Backend..." -ForegroundColor Yellow
$backendPath = Join-Path $scriptPath "backend"

if (Test-Path $backendPath) {
    # Create .env
    $backendEnv = Join-Path $backendPath ".env"
    $backendEnvContent = @"
PORT=8000
DB_USER=$dbUser
DB_HOST=$dbHost
DB_NAME=$dbName
DB_PASSWORD=$pgPasswordPlain
DB_PORT=$dbPort
NODE_ENV=development
"@
    Set-Content -Path $backendEnv -Value $backendEnvContent
    Write-Host "   - Backend .env file created." -ForegroundColor Green

    # Install Dependencies
    Write-Host "   - Installing backend NPM packages..." -ForegroundColor Cyan
    Push-Location $backendPath
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "Backend npm install failed." }
    Pop-Location
} else {
    Write-Error "Backend directory not found at $backendPath"
}

# ==============================================================================
# 5. FRONTEND SETUP
# ==============================================================================

Write-Host "`n[5/6] Setting up Frontend..." -ForegroundColor Yellow
$frontendPath = Join-Path $scriptPath "frontend"

if (Test-Path $frontendPath) {
    # Create .env
    $frontendEnv = Join-Path $frontendPath ".env"
    $frontendEnvContent = @"
REACT_APP_API_URL=http://localhost:8000/api
"@
    Set-Content -Path $frontendEnv -Value $frontendEnvContent
    Write-Host "   - Frontend .env file created." -ForegroundColor Green

    # Install Dependencies
    Write-Host "   - Installing frontend NPM packages..." -ForegroundColor Cyan
    Push-Location $frontendPath
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "Frontend npm install failed." }
    Pop-Location
} else {
    Write-Error "Frontend directory not found at $frontendPath"
}

# ==============================================================================
# 6. START APPLICATION
# ==============================================================================

Write-Host "`n[6/6] Starting Application..." -ForegroundColor Yellow

# Start Backend
if (Test-Path $backendPath) {
    Write-Host "   - Starting Backend Server..." -ForegroundColor Green
    Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $backendPath -WindowStyle Normal
}

# Start Frontend
if (Test-Path $frontendPath) {
    Write-Host "   - Starting Frontend Client..." -ForegroundColor Green
    Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $frontendPath -WindowStyle Normal
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   SETUP COMPLETE!" -ForegroundColor Green
Write-Host "   Backend should be running on port 8000."
Write-Host "   Frontend should be launching on port 3000."
Write-Host "==========================================================" -ForegroundColor Cyan
