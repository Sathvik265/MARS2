@echo off
title Restaurant Billing System (Apps Only Runner)
cd /d "%~dp0"

echo ==========================================================
echo Starting Restaurant Billing System (Apps Only)...
echo ==========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File .\run-apps-only.ps1

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Application failed to start or encountered an error.
    echo.
    pause
)
