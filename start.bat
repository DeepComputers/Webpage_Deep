@echo off
setlocal EnableDelayedExpansion
title Deep Computers ^& Telecom - Permanent Store Server
color 0B
:: Locate Project Directory (works even if placed in Windows Startup or Desktop)
set "ROOT_DIR=%~dp0"
if not exist "%ROOT_DIR%run.py" (
    if exist "D:\2\run.py" (
        set "ROOT_DIR=D:\2\"
    ) else if exist "D:\Deep Computers\run.py" (
        set "ROOT_DIR=D:\Deep Computers\"
    )
)
cd /d "%ROOT_DIR%"

:: ============================================================================
:: PERMANENT STORE CONFIGURATION
:: Set your permanent Cloudflare Worker or Custom Domain here:
:: ============================================================================
set "PERMANENT_URL=https://deepcomputers.deepcomputers.workers.dev"

:: Allow overriding permanent URL via command line (e.g. start.bat https://my-domain.com)
if not "%~1"=="" (
    set "PERMANENT_URL=%~1"
)

:: Strip any trailing slash from PERMANENT_URL
if "%PERMANENT_URL:~-1%"=="/" set "PERMANENT_URL=%PERMANENT_URL:~0,-1%"

:: Export environment variables so run.py always syncs to the permanent URL
set "CLOUDFLARE_WORKER_URL=%PERMANENT_URL%"

echo ============================================================================
echo        DEEP COMPUTERS ^& TELECOM - WEB STORE ^& PERMANENT GATEWAY
echo ============================================================================
echo.

:: 1. Verify Python Installation
set "PY_CMD=python"
python --version >nul 2>&1
if errorlevel 1 (
    py -3 --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python 3 is not found in PATH.
        echo Please install Python 3.11 or newer from https://www.python.org/
        echo Make sure to check "Add Python to PATH" during installation.
        echo.
        pause
        exit /b 1
    )
    set "PY_CMD=py -3"
)

:: 2. Check and Install Dependencies
echo [1/3] Verifying Python libraries (FastAPI, Uvicorn, Multipart)...
%PY_CMD% -m pip install -r requirements.txt >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Could not verify pip packages silently. Retrying with verbose output...
    %PY_CMD% -m pip install -r requirements.txt
)

:: 3. Verify / Auto-Generate Cloudflare Worker Config
echo [2/3] Checking Permanent Cloudflare Gateway Configuration...
if not defined SYNC_KEY echo       [NOTICE] Set SYNC_KEY in your environment to enable Worker synchronization.
if not exist "worker_config.json" (
    echo       [SETUP] Creating worker_config.json with permanent URL: %PERMANENT_URL%
    (
        echo {
        echo   "worker_url": "%PERMANENT_URL%",
        echo   "tunnel_token": ""
        echo }
    ) > worker_config.json
) else (
    echo       Permanent Cloudflare Worker Gateway is configured.
)

:: 4. Display Quick Launch Information
echo.
echo ============================================================================
echo   [PERMANENT URL]   : %PERMANENT_URL%/
echo   [PRODUCT CATALOG] : %PERMANENT_URL%/catalog
echo   [CUSTOM ORDERS]   : %PERMANENT_URL%/onorder
echo   [ADMIN DASHBOARD] : %PERMANENT_URL%/admin
echo   [BANDWIDTH]       : 100%% Unlimited ^& Free (via Cloudflare Edge)
echo ============================================================================
echo.
echo [3/3] Starting Local Server ^& Edge Gateway Sync...
echo.

%PY_CMD% run.py

if errorlevel 1 (
    echo.
    echo [ERROR] The server stopped with an error code: %errorlevel%
    pause
)

endlocal
