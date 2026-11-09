@echo off
setlocal enabledelayedexpansion
title Restaurant Billing System - Database Setup
cd /d "%~dp0"

echo ==========================================================
echo    RESTAURANT BILLING SYSTEM - DATABASE SETUP
echo ==========================================================
echo.

:: 1. Locate SQL script
set "SQL_FILE=%~dp0init_database_complete.sql"
if not exist "%SQL_FILE%" (
    set "SQL_FILE=%~dp0Final.sql"
)
if not exist "%SQL_FILE%" (
    echo [ERROR] Could not find 'init_database_complete.sql' or 'Final.sql'.
    echo Please make sure the SQL file is in the same folder as this batch file.
    echo.
    pause
    exit /b 1
)

:: 2. Locate PostgreSQL bin folder (psql.exe)
set "PG_BIN="
where psql.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "delims=" %%I in ('where psql.exe') do (
        if not defined PG_BIN set "PG_BIN=%%~dpI"
    )
)

if not defined PG_BIN (
    for %%V in (18 17 16 15 14 13 12) do (
        if not defined PG_BIN (
            if exist "C:\Program Files\PostgreSQL\%%V\bin\psql.exe" (
                set "PG_BIN=C:\Program Files\PostgreSQL\%%V\bin\"
            )
        )
    )
)

if not defined PG_BIN (
    echo [ERROR] PostgreSQL 'psql.exe' not found in PATH or standard Program Files.
    echo Please install PostgreSQL or add its 'bin' directory to your System PATH.
    echo.
    pause
    exit /b 1
)

echo [*] Located PostgreSQL at: %PG_BIN%
echo.

:: 3. Read settings from backend\.env if available
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
)

:: 4. Prompt for password if not found
if not defined DB_PASS (
    echo Enter the password for PostgreSQL user '%DB_USER%':
    set /p "DB_PASS=Password: "
    echo.
)

set "PGPASSWORD=%DB_PASS%"

:: 5. Create database if it does not exist
echo [1/3] Checking database '%DB_NAME%' on %DB_HOST%:%DB_PORT%...
"%PG_BIN%psql.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='%DB_NAME%'" > "%TEMP%\rbs_db_check.tmp" 2>nul

set /p DB_EXISTS=<"%TEMP%\rbs_db_check.tmp"
del "%TEMP%\rbs_db_check.tmp" >nul 2>&1

if "%DB_EXISTS%"=="1" (
    echo    - Database '%DB_NAME%' already exists.
) else (
    echo    - Creating database '%DB_NAME%'...
    "%PG_BIN%createdb.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" "%DB_NAME%" 2>nul
    if %ERRORLEVEL% neq 0 (
        "%PG_BIN%psql.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" -d postgres -c "CREATE DATABASE %DB_NAME%;" >nul 2>&1
    )
    echo    - Database created successfully.
)

:: 6. Execute complete setup script
echo.
echo [2/3] Executing database setup script (%SQL_FILE%)...
"%PG_BIN%psql.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" -d "%DB_NAME%" -f "%SQL_FILE%"

if %ERRORLEVEL% neq 0 (
    echo.
    echo ==========================================================
    echo [ERROR] Database setup failed!
    echo Please verify your PostgreSQL password and service status.
    echo ==========================================================
    echo.
    pause
    exit /b 1
)

:: 7. Verify tables, shifts, and sessions count
echo.
echo [3/3] Verifying database tables...
set "ITEM_COUNT=0"
set "TABLE_COUNT=0"
set "SHIFT_COUNT=0"
set "SESSION_COUNT=0"

for /f "usebackq delims=" %%A in (`"%PG_BIN%psql.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" -d "%DB_NAME%" -tAc "SELECT COUNT(*) FROM public.items;" 2^>nul`) do set "ITEM_COUNT=%%A"
for /f "usebackq delims=" %%A in (`"%PG_BIN%psql.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" -d "%DB_NAME%" -tAc "SELECT COUNT(*) FROM public.tables;" 2^>nul`) do set "TABLE_COUNT=%%A"
for /f "usebackq delims=" %%A in (`"%PG_BIN%psql.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" -d "%DB_NAME%" -tAc "SELECT COUNT(*) FROM public.shifts;" 2^>nul`) do set "SHIFT_COUNT=%%A"
for /f "usebackq delims=" %%A in (`"%PG_BIN%psql.exe" -U "%DB_USER%" -h "%DB_HOST%" -p "%DB_PORT%" -d "%DB_NAME%" -tAc "SELECT COUNT(*) FROM public.sessions;" 2^>nul`) do set "SESSION_COUNT=%%A"

if "%SESSION_COUNT%"=="0" (
    echo.
    echo ==========================================================
    echo [WARNING] 'sessions' table could not be verified!
    echo Please verify that the SQL script executed without errors.
    echo ==========================================================
) else (
    echo.
    echo ==========================================================
    echo    DATABASE SETUP COMPLETED SUCCESSFULLY!
    echo ==========================================================
    echo  - Database:    %DB_NAME%
    echo  - Host/Port:   %DB_HOST%:%DB_PORT%
    echo  - Menu Items:  %ITEM_COUNT% items
    echo  - Tables:      %TABLE_COUNT% tables (Parcel, General, AC)
    echo  - Shifts:      %SHIFT_COUNT% shifts (` Morning, `` Afternoon, RBS, RBS1)
    echo  - Sessions:    %SESSION_COUNT% active sessions initialized
    echo ==========================================================
    echo  Ready for clerk and admin login!
    echo ==========================================================
)
echo.
pause
