<#
build-package.ps1

Builds a fully self-contained deploy package for the Restaurant Billing App.
Run this on YOUR dev machine (needs internet + Node.js). The output is a
folder (and zip) containing ONLY compiled executables + config templates +
the DB dump — no readable source code.

Usage (from restaurant-billing-app/ root, in PowerShell):
    .\deploy\build-package.ps1

Output:
    .\dist-package\                (folder to copy to the target machine)
    .\rbs-deploy-package.zip       (zipped version of the same)
#>

param(
  [string]$OutputDir = ".\dist-package",
  [string]$OutputZip = ".\rbs-deploy-package.zip"
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
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
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

Write-Host "== 5/5: Assembling deploy package ==" -ForegroundColor Cyan
if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }
New-Item -ItemType Directory -Path "$OutputDir\backend" -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\frontend" -Force | Out-Null

Copy-Item "$root\backend\dist\rbs-backend.exe" "$OutputDir\backend\"
Copy-Item "$root\backend\.env.example" "$OutputDir\backend\.env"
Copy-Item "$root\Final_Dump_Fixed.sql" "$OutputDir\backend\" -ErrorAction SilentlyContinue

Copy-Item "$fsDir\dist\rbs-frontend.exe" "$OutputDir\frontend\"

Copy-Item "$root\deploy\install-services.ps1" "$OutputDir\"
Copy-Item "$root\deploy\DEPLOY_PACKAGE_README.md" "$OutputDir\README.md"

if (Test-Path $OutputZip) { Remove-Item $OutputZip }
Compress-Archive -Path "$OutputDir\*" -DestinationPath $OutputZip

Write-Host ""
Write-Host "Done. Package folder: $OutputDir" -ForegroundColor Green
Write-Host "Zipped package:       $OutputZip" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: edit dist-package\backend\.env with the real production DB credentials before shipping/copying it, and remove it from anywhere you don't want secrets sitting around." -ForegroundColor Yellow
