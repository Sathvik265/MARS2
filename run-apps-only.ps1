<#
.SYNOPSIS
    Streamlined Local Test Runner (Apps Only)
    
.DESCRIPTION
    Starts the frontend and backend directly as standalone processes for testing/development.
    Skips the database initialization script.
#>

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    RESTAURANT BILLING APP - LOCAL RUNNER (APPS ONLY)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

function Test-PortInUse {
    param ([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($conn) { return $true }
    } catch {
        $netstat = netstat -ano | Select-String ":$Port\s+"
        if ($netstat) { return $true }
    }
    return $false
}

# 1. Check and parse backend env file
$envPath = Join-Path $PSScriptRoot "backend\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "   - backend\.env not found. Copying from example template..." -ForegroundColor Yellow
    $exampleEnv = Join-Path $PSScriptRoot "backend\.env.example"
    if (Test-Path $exampleEnv) {
        Copy-Item $exampleEnv $envPath
    } else {
        Set-Content -Path $envPath -Value "DB_USER=postgres`r`nDB_PASSWORD=your_postgres_password`r`nDB_HOST=localhost`r`nDB_PORT=5432`r`nDB_NAME=restaurant_billing_db`r`nPORT=8000`r`nADMIN_FULL_PASSWORD=vittal`r`nADMIN_LIMITED_PASSWORD=vittal123"
    }
}

# Parse env variables
$envContent = Get-Content $envPath
$dbUser = "postgres"
$dbPassword = ""
$dbHost = "localhost"
$dbPort = "5432"
$dbName = "restaurant_billing_db"
$backendPort = "8000"

foreach ($line in $envContent) {
    if ($line -match "^([^=]+)=(.*)$") {
        $key = $Matches[1].Trim()
        $val = $Matches[2].Trim()
        switch ($key) {
            "DB_USER" { $dbUser = $val }
            "DB_PASSWORD" { $dbPassword = $val }
            "DB_HOST" { $dbHost = $val }
            "DB_PORT" { $dbPort = $val }
            "DB_NAME" { $dbName = $val }
            "PORT" { $backendPort = $val }
        }
    }
}

# 2. Prompt for DB Password if placeholder
if (-not $dbPassword -or $dbPassword -eq "your_postgres_password") {
    Write-Host ""
    Write-Host "PostgreSQL database password is not configured in backend\.env." -ForegroundColor Yellow
    Write-Host "Please enter the password for the PostgreSQL '$dbUser' user:" -ForegroundColor Cyan
    $promptPassword = Read-Host -Prompt "Password"
    if (-not $promptPassword) {
        Write-Error "Password cannot be empty."
        Exit 1
    }
    $dbPassword = $promptPassword
    
    # Write back updated configuration with real password
    $newEnvContent = @()
    foreach ($line in $envContent) {
        if ($line -match "^DB_PASSWORD=") {
            $newEnvContent += "DB_PASSWORD=$dbPassword"
        } elseif ($line -match "^DB_NAME=") {
            $newEnvContent += "DB_NAME=restaurant_billing_db"
        } else {
            $newEnvContent += $line
        }
    }
    Set-Content -Path $envPath -Value ($newEnvContent -join "`r`n")
    Write-Host "   - Updated backend\.env with the database credentials." -ForegroundColor Green
}

# 3. Start Backend and Frontend processes
$backendExe = Join-Path $PSScriptRoot "backend\rbs-backend.exe"
$frontendExe = Join-Path $PSScriptRoot "frontend\rbs-frontend.exe"

if (-not (Test-Path $backendExe)) {
    Write-Error "Backend executable not found at: $backendExe"
    Exit 1
}
if (-not (Test-Path $frontendExe)) {
    Write-Error "Frontend executable not found at: $frontendExe"
    Exit 1
}

$backendProc = $null
$frontendProc = $null

try {
    Write-Host "`n[1/2] Starting Application Processes..." -ForegroundColor Yellow
    
    # Proactive Port Checks
    if (Test-PortInUse -Port 8000) {
        Write-Error "Port 8000 is already in use by another application. The Backend cannot start. Please close that application and try again."
        Exit 1
    }
    if (Test-PortInUse -Port 3000) {
        Write-Error "Port 3000 is already in use by another application. The Frontend cannot start. Please close that application and try again."
        Exit 1
    }
    
    $backendLog = Join-Path $PSScriptRoot "backend\local-stderr.log"
    $frontendLog = Join-Path $PSScriptRoot "frontend\local-stderr.log"

    # Remove stale logs
    Remove-Item $backendLog -ErrorAction SilentlyContinue
    Remove-Item $frontendLog -ErrorAction SilentlyContinue
    
    Write-Host "   - Spawning Backend ($backendExe)..." -ForegroundColor Cyan
    $backendProc = Start-Process -FilePath $backendExe -WorkingDirectory (Join-Path $PSScriptRoot "backend") -WindowStyle Normal -RedirectStandardError $backendLog -PassThru
    
    Write-Host "   - Spawning Frontend ($frontendExe)..." -ForegroundColor Cyan
    $frontendProc = Start-Process -FilePath $frontendExe -WorkingDirectory (Join-Path $PSScriptRoot "frontend") -WindowStyle Normal -RedirectStandardError $frontendLog -PassThru
    
    Start-Sleep -Seconds 3
    
    if ($backendProc.HasExited) {
        $logContent = ""
        if (Test-Path $backendLog) {
            $logContent = Get-Content $backendLog -Raw
        }
        Write-Error "Backend process failed to start or exited immediately.`n[ERROR LOGS]:`n$logContent"
        Exit 1
    }
    
    if ($frontendProc.HasExited) {
        $logContent = ""
        if (Test-Path $frontendLog) {
            $logContent = Get-Content $frontendLog -Raw
        }
        Write-Error "Frontend process failed to start or exited immediately.`n[ERROR LOGS]:`n$logContent"
        Exit 1
    }
    
    Write-Host "`n[2/2] Opening Web Interface..." -ForegroundColor Yellow
    Start-Process "http://localhost:3000"
    
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "   RESTAURANT BILLING APP IS RUNNING DIRECTLY!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " - Backend (port $backendPort) PID: $($backendProc.Id)"
    Write-Host " - Frontend (port 3000) PID: $($frontendProc.Id)"
    Write-Host " - UI Address: http://localhost:3000"
    Write-Host ""
    Write-Host " >>> Press [ENTER] to stop the application and exit <<< " -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
    
    Read-Host
}
finally {
    Write-Host "`nStopping application processes..." -ForegroundColor Cyan
    
    if ($backendProc -and -not $backendProc.HasExited) {
        Write-Host "   - Killing backend process (PID: $($backendProc.Id))" -ForegroundColor DarkGray
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    
    if ($frontendProc -and -not $frontendProc.HasExited) {
        Write-Host "   - Killing frontend process (PID: $($frontendProc.Id))" -ForegroundColor DarkGray
        Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host "Cleanup completed successfully. App stopped." -ForegroundColor Green
}
