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

# If the new package ships a schema migration, it'll be here - apply manually
# if present, this script does not run SQL automatically.
if (Test-Path (Join-Path $NewPackagePath "backend\Final_Dump_Fixed.sql")) {
  Write-Host "Note: a Final_Dump_Fixed.sql is present in the new package. If this" -ForegroundColor Yellow
  Write-Host "release includes DB schema changes, apply the relevant migration" -ForegroundColor Yellow
  Write-Host "manually - this script does not touch your database." -ForegroundColor Yellow
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
