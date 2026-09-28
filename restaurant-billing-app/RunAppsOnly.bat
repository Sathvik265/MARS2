@echo off
title Restaurant Billing System (Apps Only Runner)
cd /d "%~dp0"

echo ==========================================================
echo Starting Restaurant Billing System (Apps Only)...
echo ==========================================================

if exist "%~dp0deploy\run-apps-only.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\run-apps-only.ps1"
) else if exist "%~dp0run-apps-only.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-apps-only.ps1"
) else (
    echo [ERROR] Could not find run-apps-only.ps1 script.
    pause
    exit /b 1
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Application failed to start or encountered an error.
    echo.
    pause
)
