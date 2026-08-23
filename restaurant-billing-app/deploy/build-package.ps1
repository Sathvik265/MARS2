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

Write-Host "== 4/5: Compiling frontend server (Express exe only — no build embedding) ==" -ForegroundColor Cyan
$fsDir = "$root\deploy\frontend-server"
if (Test-Path "$fsDir\dist") { Remove-Item -Recurse -Force "$fsDir\dist" }
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
(Get-Content "$OutputDir\backend\.env") -replace 'DB_USER=.*', 'DB_USER=postgres' -replace 'ADMIN_FULL_PASSWORD=.*', 'ADMIN_FULL_PASSWORD=vittal' -replace 'ADMIN_LIMITED_PASSWORD=.*', 'ADMIN_LIMITED_PASSWORD=vittal123' | Set-Content "$OutputDir\backend\.env"
if (Test-Path "$root\Final_Dump_Fixed.sql") {
    Copy-Item "$root\Final_Dump_Fixed.sql" "$OutputDir\backend\"
} elseif (Test-Path "$root\backend\Final_Dump_Fixed.sql") {
    Copy-Item "$root\backend\Final_Dump_Fixed.sql" "$OutputDir\backend\"
}

Copy-Item "$fsDir\dist\rbs-frontend.exe" "$OutputDir\frontend\"
# Copy the React build folder next to the exe so server.js can serve it from disk.
# The build folder MUST be at dist-package\frontend\build\
if (Test-Path "$OutputDir\frontend\build") { Remove-Item -Recurse -Force "$OutputDir\frontend\build" }
Copy-Item -Recurse -Force "$root\frontend\build" "$OutputDir\frontend\build"

Copy-Item "$root\deploy\install-services.ps1" "$OutputDir\"
Copy-Item "$root\deploy\run-local.ps1" "$OutputDir\"
Copy-Item "$root\deploy\RunApp.bat" "$OutputDir\"
Copy-Item "$root\deploy\run-apps-only.ps1" "$OutputDir\"
Copy-Item "$root\deploy\RunAppsOnly.bat" "$OutputDir\"
Copy-Item "$root\deploy\DEPLOY_PACKAGE_README.md" "$OutputDir\README.md"

if (Test-Path $OutputZip) { Remove-Item $OutputZip }
Compress-Archive -Path "$OutputDir\*" -DestinationPath $OutputZip

Write-Host ""
Write-Host "Done. Package folder: $OutputDir" -ForegroundColor Green
Write-Host "Zipped package:       $OutputZip" -ForegroundColor Green
Write-Host ""
Write-Host "Package structure:" -ForegroundColor Yellow
Write-Host "  frontend\" -ForegroundColor Yellow
Write-Host "    rbs-frontend.exe  <- Express server exe" -ForegroundColor Yellow
Write-Host "    build\            <- React build (served from disk)" -ForegroundColor Yellow
Write-Host "  backend\" -ForegroundColor Yellow
Write-Host "    rbs-backend.exe   <- API server exe" -ForegroundColor Yellow
Write-Host "IMPORTANT: edit dist-package\backend\.env with the real production DB credentials before shipping." -ForegroundColor Red
