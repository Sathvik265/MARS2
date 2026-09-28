@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo [RBS] Extract and Deploy Package from USB Drive
echo ===================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "ZIP_FILE="
set "ZIP_NAME="

rem 1. Check for specific rbs-deploy-package.zip in script location or D:\
if exist "%SCRIPT_DIR%rbs-deploy-package.zip" (
    set "ZIP_FILE=%SCRIPT_DIR%rbs-deploy-package.zip"
    set "ZIP_NAME=rbs-deploy-package"
) else if exist "D:\rbs-deploy-package.zip" (
    set "ZIP_FILE=D:\rbs-deploy-package.zip"
    set "ZIP_NAME=rbs-deploy-package"
)

rem 2. If specific zip not found, search for any .zip in script dir then D:\
if "!ZIP_FILE!"=="" (
    for %%F in ("%SCRIPT_DIR%*.zip") do (
        set "ZIP_FILE=%%~fF"
        set "ZIP_NAME=%%~nF"
    )
)

if "!ZIP_FILE!"=="" (
    if exist "D:\" (
        for %%F in ("D:\*.zip") do (
            set "ZIP_FILE=%%~fF"
            set "ZIP_NAME=%%~nF"
        )
    )
)

if "!ZIP_FILE!"=="" (
    echo [ERROR] No deployment .zip package found in %SCRIPT_DIR% or D:\ drive.
    echo Please make sure 'rbs-deploy-package.zip' is placed in the same folder as this script.
    echo.
    pause
    exit /b 1
)

set "TARGET_DIR=%USERPROFILE%\Desktop\!ZIP_NAME!"

echo Package Found : !ZIP_FILE!
echo Destination   : !TARGET_DIR!
echo.

if not exist "!TARGET_DIR!" (
    mkdir "!TARGET_DIR!"
)

echo Extracting package files to Desktop... Please wait...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '!ZIP_FILE!' -DestinationPath '!TARGET_DIR!' -Force"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Extraction failed.
    echo.
    pause
    exit /b 1
)

echo [SUCCESS] Package extracted to Desktop\!ZIP_NAME!
echo.

rem Create Desktop Shortcut (.lnk) pointing to RunAppsOnly.bat in extracted directory
if exist "%USERPROFILE%\Desktop\RunAppsOnly.bat" (
    del /f /q "%USERPROFILE%\Desktop\RunAppsOnly.bat" >nul 2>&1
)

if exist "!TARGET_DIR!\RunAppsOnly.bat" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('%USERPROFILE%\Desktop\RunAppsOnly.lnk'); $s.TargetPath = '!TARGET_DIR!\RunAppsOnly.bat'; $s.WorkingDirectory = '!TARGET_DIR!'; $s.Save()"
    echo [SUCCESS] Created 'RunAppsOnly' shortcut on Desktop.
) else if exist "!TARGET_DIR!\RunAppsOnly.lnk" (
    copy /y "!TARGET_DIR!\RunAppsOnly.lnk" "%USERPROFILE%\Desktop\RunAppsOnly.lnk" >nul
    echo [SUCCESS] Copied 'RunAppsOnly' shortcut to Desktop.
)

rem Run database update automatically
set "DB_BAT_FOUND=0"

if exist "!TARGET_DIR!\update_db.bat" (
    set "DB_BAT_FOUND=1"
    echo.
    echo ===================================================
    echo Running Database Schema Update update_db.bat
    echo ===================================================
    pushd "!TARGET_DIR!"
    call update_db.bat
    popd
)

if "!DB_BAT_FOUND!"=="0" (
    if exist "!TARGET_DIR!\rbs-deploy-package\update_db.bat" (
        set "DB_BAT_FOUND=1"
        echo.
        echo ===================================================
        echo Running Database Schema Update update_db.bat
        echo ===================================================
        pushd "!TARGET_DIR!\rbs-deploy-package"
        call update_db.bat
        popd
    )
)

if "!DB_BAT_FOUND!"=="0" (
    echo [WARNING] update_db.bat was not found in the extracted package.
)

echo.
echo ===================================================
echo [DEPLOYMENT COMPLETE] RBS Package is ready on Desktop!
echo ===================================================
echo.
pause
