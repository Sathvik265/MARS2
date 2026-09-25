@echo off
title Restaurant Billing System (Setup & Apps Runner)
cd /d "%~dp0"

echo ==========================================================
echo Starting Database Setup and Restaurant Billing System...
echo ==========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File .\run-local.ps1

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Application failed to start or encountered an error.
    echo.
    pause
)
