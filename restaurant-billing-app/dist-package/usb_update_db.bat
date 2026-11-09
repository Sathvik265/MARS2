@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo [RBS] USB Pendrive Database Patch Runner
echo ===================================================
echo.

:: Default Database Connection Settings
set DB_USER=postgres
set DB_PASSWORD=SRHARI
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=restaurant_billing_db

:: Check for .env file in current directory or backend directory to override defaults
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "KEY=%%A"
        set "VAL=%%B"
        if "!KEY!"=="DB_USER" set "DB_USER=!VAL!"
        if "!KEY!"=="DB_PASSWORD" set "DB_PASSWORD=!VAL!"
        if "!KEY!"=="DB_HOST" set "DB_HOST=!VAL!"
        if "!KEY!"=="DB_PORT" set "DB_PORT=!VAL!"
        if "!KEY!"=="DB_NAME" set "DB_NAME=!VAL!"
    )
) else if exist "backend\.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("backend\.env") do (
        set "KEY=%%A"
        set "VAL=%%B"
        if "!KEY!"=="DB_USER" set "DB_USER=!VAL!"
        if "!KEY!"=="DB_PASSWORD" set "DB_PASSWORD=!VAL!"
        if "!KEY!"=="DB_HOST" set "DB_HOST=!VAL!"
        if "!KEY!"=="DB_PORT" set "DB_PORT=!VAL!"
        if "!KEY!"=="DB_NAME" set "DB_NAME=!VAL!"
    )
)

set PGPASSWORD=!DB_PASSWORD!

echo Target Database : !DB_NAME!
echo Host / Port     : !DB_HOST!:!DB_PORT!
echo Database User   : !DB_USER!
echo.

:: Auto-detect psql.exe path across standard PostgreSQL installation directories
set PSQL_CMD=psql
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set "PSQL_CMD=C:\Program Files\PostgreSQL\17\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set "PSQL_CMD=C:\Program Files\PostgreSQL\16\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" set "PSQL_CMD=C:\Program Files\PostgreSQL\15\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\14\bin\psql.exe" set "PSQL_CMD=C:\Program Files\PostgreSQL\14\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\13\bin\psql.exe" set "PSQL_CMD=C:\Program Files\PostgreSQL\13\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\12\bin\psql.exe" set "PSQL_CMD=C:\Program Files\PostgreSQL\12\bin\psql.exe"

echo Executing database patch script 'usb_update_db.sql'...
echo.

"%PSQL_CMD%" -h !DB_HOST! -p !DB_PORT! -U !DB_USER! -d !DB_NAME! -f "%~dp0usb_update_db.sql"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo [SUCCESS] Database patch applied successfully!
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo [ERROR] Database patch failed with error code %ERRORLEVEL%.
    echo Please ensure PostgreSQL service is running and credentials are correct.
    echo ===================================================
)

echo.
pause
