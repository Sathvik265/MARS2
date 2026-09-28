$root = "c:\Users\deept\OneDrive\Desktop\Deepthi-pp\rbs\restaurant-billing-app"
$zip = "$root\rbs-deploy-package.zip"
$stage = "$root\staging_deploy_temp"

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
if (Test-Path $zip) { Remove-Item -Force $zip }

New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path "$stage\backend" -Force | Out-Null
New-Item -ItemType Directory -Path "$stage\frontend" -Force | Out-Null

Write-Host "1. Staging backend executables and config..."
if (Test-Path "$root\backend.exe") {
    Copy-Item "$root\backend.exe" "$stage\backend\backend.exe"
}
if (Test-Path "$root\backend\rbs-backend.exe") {
    Copy-Item "$root\backend\rbs-backend.exe" "$stage\backend\rbs-backend.exe"
}
if (Test-Path "$root\backend\rawprint.exe") {
    Copy-Item "$root\backend\rawprint.exe" "$stage\backend\rawprint.exe"
}
if (Test-Path "$root\backend\.env") {
    Copy-Item "$root\backend\.env" "$stage\backend\.env"
}

Write-Host "2. Staging frontend executable and build bundle..."
if (Test-Path "$root\frontend.exe") {
    Copy-Item "$root\frontend.exe" "$stage\frontend\frontend.exe"
}
if (Test-Path "$root\deploy\frontend-server\dist\rbs-frontend.exe") {
    Copy-Item "$root\deploy\frontend-server\dist\rbs-frontend.exe" "$stage\frontend\rbs-frontend.exe"
}
if (Test-Path "$root\frontend\build") {
    Copy-Item -Recurse -Force "$root\frontend\build" "$stage\frontend\build"
}

Write-Host "2b. Staging deploy scripts..."
if (Test-Path "$root\deploy") {
    New-Item -ItemType Directory -Path "$stage\deploy" -Force | Out-Null
    Copy-Item -Recurse -Force "$root\deploy\*" "$stage\deploy\"
}
if (Test-Path "$root\deploy\run-apps-only.ps1") {
    Copy-Item -Force "$root\deploy\run-apps-only.ps1" "$stage\"
}

Write-Host "3. Generating RunAppsOnly.lnk shortcut..."
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$root\RunAppsOnly.lnk")
$lnk.TargetPath = "$root\RunAppsOnly.bat"
$lnk.WorkingDirectory = "$root"
$lnk.Save()

Write-Host "4. Staging root batch, shortcut, and SQL migration scripts..."
$rootFiles = @("update_db.sql", "update_db.bat", "RunAppsOnly.bat", "RunAppsOnly.lnk", "Final.sql", "Final_Dump_Fixed.sql")
foreach ($f in $rootFiles) {
    $src = "$root\$f"
    if (Test-Path $src) {
        Copy-Item -Force $src "$stage\"
    }
}

Write-Host "5. Compressing binary deployment package..."
Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force

Write-Host "6. Cleaning up staging directory..."
Remove-Item -Recurse -Force $stage

if (Test-Path "D:\") {
    Write-Host "7. Copying package and USB extract script to D:\..."
    Copy-Item -Force $zip "D:\rbs-deploy-package.zip"
    Copy-Item -Force "$root\extract_package_from_usb.bat" "D:\extract_package_from_usb.bat"
    Write-Host "[SUCCESS] Updated EXE deployment package and extraction script copied to D:\"
}
