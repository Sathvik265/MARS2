<#
update-package.ps1

Updates an already-installed RBS deployment in place: stops the services,
replaces the two .exe files with newer builds, restarts them. Preserves
the existing backend\.env (your real DB credentials) and does NOT touch
NSSM service registration — so this is safe to run repeatedly.

Run this ON THE TARGET MACHINE, elevated, from inside the OLD installed
package folder (the one containing backend\ and frontend\).

Usage:
    .\update-package.ps1 -NewPackagePath 'C:\path\to\new\dist-package'
#>

param(
  [Parameter(Mandatory=$true)][string]$NewPackagePath,
  [string]$NssmPath = ''
)

$ErrorActionPreference = "Stop"

function Find-Nssm {
  param([string]$Provided)
  if ($Provided -and (Test-Path $Provided)) { return (Resolve-Path $Provided).Path }
  $onPath = Get-Command nssm -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Path }
  return $null
}

$nssm = Find-Nssm -Provided $NssmPath
if (-not $nssm) {
  Write-Error "nssm.exe not found. Pass -NssmPath 'C:\path\to\nssm.exe'"
  exit 1
}

$newBackendExe  = Join-Path $NewPackagePath "backend\rbs-backend.exe"
$newFrontendExe = Join-Path $NewPackagePath "frontend\rbs-frontend.exe"
foreach ($p in @($newBackendExe, $newFrontendExe)) {
  if (-not (Test-Path $p)) { Write-Error "Not found: $p"; exit 1 }
}

Write-Host "Stopping services..." -ForegroundColor Cyan
& $nssm stop RBSBackend
& $nssm stop RBSFrontend
Start-Sleep -Seconds 2

Write-Host "Backing up current exes..." -ForegroundColor Cyan
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item ".\backend\rbs-backend.exe"   ".\backend\rbs-backend.exe.bak-$stamp" -ErrorAction SilentlyContinue
Copy-Item ".\frontend\rbs-frontend.exe" ".\frontend\rbs-frontend.exe.bak-$stamp" -ErrorAction SilentlyContinue

Write-Host "Copying in new binaries..." -ForegroundColor Cyan
Copy-Item $newBackendExe  ".\backend\rbs-backend.exe" -Force
Copy-Item $newFrontendExe ".\frontend\rbs-frontend.exe" -Force

# Run automated database migrations using existing backend\.env credentials
$envPath = ".\backend\.env"
if (Test-Path $envPath) {
  Write-Host "Extracting database credentials to apply migrations..." -ForegroundColor Cyan
  $envContent = Get-Content $envPath
  $dbUser = "postgres"
  $dbPassword = ""
  $dbHost = "localhost"
  $dbPort = "5432"
  $dbName = "restaurant_billing_db"

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
          }
      }
  }

  $env:PGPASSWORD = $dbPassword
  Write-Host "Running database schema migrations against database '$dbName'..." -ForegroundColor Cyan
  
  $migrationSql = "ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS allowed_clerks TEXT DEFAULT 'CLK,V,P,B'; ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS section VARCHAR(10) DEFAULT 'L'; ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_shift_name_session_date_clerk_initials_key;"
  
  # Check if psql command exists
  $onPath = Get-Command psql -ErrorAction SilentlyContinue
  if ($onPath) {
      psql -U $dbUser -h $dbHost -p $dbPort -d $dbName -c $migrationSql
      if ($LASTEXITCODE -eq 0) {
          Write-Host "Database migrations successfully applied!" -ForegroundColor Green
      } else {
          Write-Warning "Failed to execute database migrations automatically. Please run them manually."
      }
  } else {
      Write-Warning "psql command utility was not found in PATH. Skipping automated migrations."
  }
}

Write-Host "Restarting services..." -ForegroundColor Cyan
& $nssm start RBSBackend
Start-Sleep -Seconds 2
& $nssm start RBSFrontend
Start-Sleep -Seconds 2

Get-Service RBSBackend, RBSFrontend | Format-Table Name, Status

Write-Host ""
Write-Host "Done. Old binaries backed up alongside the new ones (*.bak-$stamp)." -ForegroundColor Green
Write-Host "Your backend\.env was left untouched." -ForegroundColor Green
