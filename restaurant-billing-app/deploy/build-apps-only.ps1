<#
build-apps-only.ps1

Builds a deploy package containing ONLY the apps (backend and frontend exes), 
their respective .env files, and the RunAppsOnly scripts.
This skips database setup scripts and NSSM services, making it perfect 
for testing or running purely from double-clicking the bat file.

Usage (from restaurant-billing-app/ root, in PowerShell):
    .\deploy\build-apps-only.ps1
#>

param(
  [string]$OutputDir = ".\apps-only-package",
  [string]$OutputZip = ".\rbs-apps-only.zip"
)

$ErrorActionPreference = "Stop"
$root = Get-Location

Write-Host "== 1/5: Installing backend production dependencies ==" -ForegroundColor Cyan
Push-Location "$root\backend"
npm install --omit=dev
if (-not (Test-Path "node_modules\.bin\pkg.cmd")) {
  npm install --save-dev @yao-pkg/pkg
}
Write-Host "== 2/5: Compiling backend to rbs-backend.exe ==" -ForegroundColor Cyan
npx pkg . --targets node22-win-x64 --output dist\rbs-backend.exe
Pop-Location

Write-Host "== 3/5: Building frontend production bundle ==" -ForegroundColor Cyan
Push-Location "$root\frontend"
if (-not (Test-Path node_modules)) { npm install }
if (-not $env:REACT_APP_API_URL) { $env:REACT_APP_API_URL = "http://localhost:8000/api" }
npm run build
Pop-Location

Write-Host "== 4/5: Compiling frontend server to rbs-frontend.exe ==" -ForegroundColor Cyan
$fsDir = "$root\deploy\frontend-server"
# Remove the old build folder completely first, then copy the folder itself.
# IMPORTANT: Do NOT copy into an existing 'build' dir — PowerShell will nest it as build\build.
if (Test-Path "$fsDir\build") { Remove-Item -Recurse -Force "$fsDir\build" }
if (Test-Path "$fsDir\dist") { Remove-Item -Recurse -Force "$fsDir\dist" }
Copy-Item -Recurse -Force "$root\frontend\build" "$fsDir\build"
Push-Location $fsDir
if (-not (Test-Path node_modules)) { npm install }
npx pkg . --targets node22-win-x64 --public --no-bytecode --output dist\rbs-frontend.exe
Pop-Location

Write-Host "== 5/5: Assembling apps-only package ==" -ForegroundColor Cyan
if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }
New-Item -ItemType Directory -Path "$OutputDir\backend" -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\frontend" -Force | Out-Null

Copy-Item "$root\backend\dist\rbs-backend.exe" "$OutputDir\backend\"
Copy-Item "$root\backend\.env" "$OutputDir\backend\.env"
(Get-Content "$OutputDir\backend\.env") -replace 'DB_USER=.*', 'DB_USER=postgres' | Set-Content "$OutputDir\backend\.env"

Copy-Item "$fsDir\dist\rbs-frontend.exe" "$OutputDir\frontend\"
Copy-Item "$root\frontend\.env.example" "$OutputDir\frontend\.env" -ErrorAction SilentlyContinue

Copy-Item "$root\deploy\run-apps-only.ps1" "$OutputDir\"
Copy-Item "$root\deploy\RunAppsOnly.bat" "$OutputDir\"

if (Test-Path $OutputZip) { Remove-Item $OutputZip }
Compress-Archive -Path "$OutputDir\*" -DestinationPath $OutputZip

Write-Host ""
Write-Host "Done. Apps-only package folder: $OutputDir" -ForegroundColor Green
Write-Host "Zipped package:                 $OutputZip" -ForegroundColor Green
Write-Host ""
