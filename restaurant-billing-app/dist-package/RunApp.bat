@echo off
title Restaurant Billing System (Local Test Mode)
cd /d "%~dp0"

echo ==========================================================
echo Starting Restaurant Billing System...
echo ==========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File .\run-local.ps1

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Application failed to start or encountered an error.
    echo.
    pause
)
