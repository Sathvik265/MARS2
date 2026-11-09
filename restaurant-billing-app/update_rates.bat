@echo off
setlocal enabledelayedexpansion
title Hotel Anand Bhavan - Update Menu Rates
cd /d "%~dp0"

echo ==========================================================
echo    HOTEL ANAND BHAVAN - UPDATE MENU RATES
echo ==========================================================
echo.

:: 1. Locate SQL script
set "SQL_FILE=%~dp0update_rates.sql"
if not exist "%SQL_FILE%" (
    echo [ERROR] Could not find 'update_rates.sql'.
    echo Please make sure 'update_rates.sql' is in the same folder as this batch file.
    echo.
    pause
    exit /b 1
)

:: 2. Locate PostgreSQL psql.exe
set "PSQL_CMD="
where psql.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PSQL_CMD=psql.exe"
)

if not defined PSQL_CMD (
    for %%V in (18 17 16 15 14 13 12) do (
        if not defined PSQL_CMD (
            if exist "C:\Program Files\PostgreSQL\%%V\bin\psql.exe" (
                set "PSQL_CMD=C:\Program Files\PostgreSQL\%%V\bin\psql.exe"
            )
        )
    )
)

if not defined PSQL_CMD (
    echo [ERROR] PostgreSQL 'psql.exe' not found in PATH or standard Program Files.
    echo Please ensure PostgreSQL is installed and its bin folder is in PATH.
    echo.
    pause
    exit /b 1
)

echo [*] Located psql at: %PSQL_CMD%

:: 3. Read settings from .env or backend\.env
set "DB_USER=postgres"
set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=restaurant_billing_db"
set "DB_PASS="

if exist "%~dp0backend\.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0backend\.env") do (
        set "KEY=%%A"
        set "VAL=%%B"
        if /i "!KEY!"=="DB_USER" if not "!VAL!"=="" set "DB_USER=!VAL!"
        if /i "!KEY!"=="DB_HOST" if not "!VAL!"=="" set "DB_HOST=!VAL!"
        if /i "!KEY!"=="DB_PORT" if not "!VAL!"=="" set "DB_PORT=!VAL!"
        if /i "!KEY!"=="DB_NAME" if not "!VAL!"=="" set "DB_NAME=!VAL!"
        if /i "!KEY!"=="DB_PASSWORD" if not "!VAL!"=="" if not "!VAL!"=="your_postgres_password" set "DB_PASS=!VAL!"
    )
) else if exist "%~dp0.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env") do (
        set "KEY=%%A"
        set "VAL=%%B"
        if /i "!KEY!"=="DB_USER" if not "!VAL!"=="" set "DB_USER=!VAL!"
        if /i "!KEY!"=="DB_HOST" if not "!VAL!"=="" set "DB_HOST=!VAL!"
        if /i "!KEY!"=="DB_PORT" if not "!VAL!"=="" set "DB_PORT=!VAL!"
        if /i "!KEY!"=="DB_NAME" if not "!VAL!"=="" set "DB_NAME=!VAL!"
        if /i "!KEY!"=="DB_PASSWORD" if not "!VAL!"=="" if not "!VAL!"=="your_postgres_password" set "DB_PASS=!VAL!"
    )
)

:: 4. Prompt for password if not found in .env
if not defined DB_PASS (
    echo Enter the password for PostgreSQL user '%DB_USER%':
    set /p "DB_PASS=Password: "
    echo.
)

set "PGPASSWORD=%DB_PASS%"

echo [*] Updating menu rates on database '%DB_NAME%' (%DB_HOST%:%DB_PORT%)...
echo.

"%PSQL_CMD%" -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d "%DB_NAME%" -f "%SQL_FILE%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ==========================================================
    echo [SUCCESS] Menu rates updated successfully in database!
    echo ==========================================================
) else (
    echo.
    echo ==========================================================
    echo [ERROR] Rate update failed with error code %ERRORLEVEL%.
    echo Please check database credentials or if PostgreSQL is running.
    echo ==========================================================
)

echo.
pause
