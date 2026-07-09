<#
install-services.ps1

Installs the compiled RBS backend and frontend executables as always-on
Windows services using NSSM. Run this ON THE TARGET MACHINE, elevated
(Run as Administrator), from inside the extracted deploy package folder.

Prerequisites on the target machine:
  - PostgreSQL installed, with the database created and Final_Dump_Fixed.sql
    imported (see README.md).
  - nssm.exe downloaded from https://nssm.cc/ and either on PATH or passed
    via -NssmPath.
  - backend\.env filled in with real DB credentials (NOT the placeholder
    values that ship in .env.example).

Usage:
    .\install-services.ps1 -NssmPath 'C:\tools\nssm\nssm.exe' -StartServices

This does NOT require Node.js, IIS, or any dev tools on the target machine —
the .exe files are fully self-contained.
#>

param(
  [string]$NssmPath = '',
  [string]$InstallRoot = (Get-Location).Path,
  [switch]$StartServices
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
  Write-Error "nssm.exe not found. Download it from https://nssm.cc/ and rerun with -NssmPath 'C:\path\to\nssm.exe'"
  exit 1
}

$backendExe  = Join-Path $InstallRoot "backend\rbs-backend.exe"
$frontendExe = Join-Path $InstallRoot "frontend\rbs-frontend.exe"
$backendDir  = Join-Path $InstallRoot "backend"
$frontendDir = Join-Path $InstallRoot "frontend"

foreach ($p in @($backendExe, $frontendExe)) {
  if (-not (Test-Path $p)) { Write-Error "Expected file not found: $p"; exit 1 }
}

Write-Host "Installing RBSBackend service ($backendExe)" -ForegroundColor Cyan
& $nssm install RBSBackend "$backendExe"
& $nssm set RBSBackend AppDirectory "$backendDir"
& $nssm set RBSBackend Start SERVICE_AUTO_START
& $nssm set RBSBackend AppStdout (Join-Path $backendDir "service-stdout.log")
& $nssm set RBSBackend AppStderr (Join-Path $backendDir "service-stderr.log")

Write-Host "Installing RBSFrontend service ($frontendExe)" -ForegroundColor Cyan
& $nssm install RBSFrontend "$frontendExe"
& $nssm set RBSFrontend AppDirectory "$frontendDir"
& $nssm set RBSFrontend Start SERVICE_AUTO_START
& $nssm set RBSFrontend AppStdout (Join-Path $frontendDir "service-stdout.log")
& $nssm set RBSFrontend AppStderr (Join-Path $frontendDir "service-stderr.log")

Write-Host "Both services installed with Automatic startup (they'll start on boot, no login required)." -ForegroundColor Green

if ($StartServices) {
  & $nssm start RBSBackend
  Start-Sleep -Seconds 2
  & $nssm start RBSFrontend
  Start-Sleep -Seconds 2
  Get-Service RBSBackend, RBSFrontend | Format-Table Name, Status
  Write-Host ""
  Write-Host "If both show 'Running', open http://localhost:3000 in a browser on this machine." -ForegroundColor Green
} else {
  Write-Host "Run 'nssm start RBSBackend' and 'nssm start RBSFrontend' (or reboot) to bring them up." -ForegroundColor Yellow
}
