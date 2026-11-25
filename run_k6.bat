@echo off
setlocal EnableDelayedExpansion
title Deep Computers ^& Telecom - k6 Load ^& Stress Testing
color 0A
cd /d "%~dp0"

:: 1. Verify k6 executable
set "K6_CMD=k6"
where k6 >nul 2>&1
if errorlevel 1 (
    if exist "C:\Program Files\k6\k6.exe" (
        set "K6_CMD=C:\Program Files\k6\k6.exe"
    ) else (
        echo ====================================================================
        echo [ERROR] k6 was not found in PATH or at "C:\Program Files\k6\k6.exe".
        echo Please install k6 from: https://grafana.com/docs/k6/latest/set-up/install-k6/
        echo ====================================================================
        echo.
        pause
        exit /b 1
    )
)

:: 2. Resolve Default Target URLs
set "LOCAL_URL=http://127.0.0.1:8000"
set "WORKER_URL=https://deepcomputers.deepcomputers.workers.dev"

if exist "worker_config.json" (
    for /f "tokens=2 delims=:, " %%a in ('findstr "worker_url" worker_config.json') do (
        set "cfg_url=%%~a"
        if defined cfg_url (
            set "WORKER_URL=!cfg_url!"
        )
    )
)

:menu
cls
echo ============================================================================
echo      DEEP COMPUTERS ^& TELECOM - K6 HIGH-CONCURRENCY LOAD TESTING
echo ============================================================================
echo   Local Server Target    : %LOCAL_URL%
echo   Cloudflare Gateway     : %WORKER_URL%
echo ============================================================================
echo.
echo Choose a test scenario:
echo.
echo  --- LOCAL SERVER TESTS (High-Speed Internal Benchmark) ---
echo   [1] Quick Smoke Test       - 10 users, 20 seconds
echo   [2] Medium Traffic Test    - 50 users, 30 seconds
echo   [3] High Traffic Test      - 150 users, 30 seconds
echo   [4] Mega Load Test         - 500 concurrent shoppers, 60 seconds
echo   [5] Extreme Peak Test      - 1,000 concurrent shoppers, 60 seconds
echo.
echo  --- CLOUDFLARE PERMANENT GATEWAY TESTS (Over the Public Internet - ZERO DOWNLOAD) ---
echo   [6] Cloudflare Gateway 50 Users  - 50 live shoppers via %WORKER_URL%
echo   [7] Cloudflare Gateway 150 Users - 150 live shoppers via %WORKER_URL%
echo   [8] Cloudflare Gateway 250 Users - 250 live shoppers via %WORKER_URL% (1 min)
echo.
echo  --- CUSTOM CONFIGURATION ---
echo   [9] Custom Load Test       - Specify custom target URL, users, and time
echo   [10] Exit
echo.

set "choice=1"
set /p choice="Enter your choice [1-10] (default: 1): "
set "choice=%choice: =%"

if "%choice%"=="10" goto opt_exit
if "%choice%"=="1" goto opt_local_10
if "%choice%"=="2" goto opt_local_50
if "%choice%"=="3" goto opt_local_150
if "%choice%"=="4" goto opt_local_500
if "%choice%"=="5" goto opt_local_1000
if "%choice%"=="6" goto opt_worker_50
if "%choice%"=="7" goto opt_worker_150
if "%choice%"=="8" goto opt_worker_250
if "%choice%"=="9" goto opt_custom

echo [ERROR] Invalid choice: %choice%
timeout /t 2 >nul
goto menu

:opt_local_10
echo.
echo ============================================================================
echo [STARTING] Quick Smoke Test: 10 shoppers on %LOCAL_URL% (20s)
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%LOCAL_URL% --vus 10 --duration 20s load_tests/fake_users.js
goto finish

:opt_local_50
echo.
echo ============================================================================
echo [STARTING] Medium Traffic Test: 50 shoppers on %LOCAL_URL% (30s)
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%LOCAL_URL% -e PROFILE=50 load_tests/fake_users.js
goto finish

:opt_local_150
echo.
echo ============================================================================
echo [STARTING] High Traffic Test: 150 shoppers on %LOCAL_URL% (30s)
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%LOCAL_URL% -e PROFILE=150 load_tests/fake_users.js
goto finish

:opt_local_500
echo.
echo ============================================================================
echo [STARTING] Mega Load Test: 500 concurrent shoppers on %LOCAL_URL% (60s)
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%LOCAL_URL% -e PROFILE=500 load_tests/fake_users.js
goto finish

:opt_local_1000
echo.
echo ============================================================================
echo [STARTING] Extreme Peak Test: 1,000 concurrent shoppers on %LOCAL_URL% (60s)
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%LOCAL_URL% -e PROFILE=1000 load_tests/fake_users.js
goto finish

:opt_worker_50
echo.
echo ============================================================================
echo [STARTING] Cloudflare Gateway Test: 50 users via %WORKER_URL% (45s)
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%WORKER_URL% -e PROFILE=worker load_tests/fake_users.js
goto finish

:opt_worker_150
echo.
echo ============================================================================
echo [STARTING] Cloudflare Gateway Stress: 150 users via %WORKER_URL% (30s)
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%WORKER_URL% --stage 5s:50 --stage 10s:150 --stage 15s:150 --stage 5s:0 load_tests/fake_users.js
goto finish

:opt_worker_250
echo.
echo ============================================================================
echo [STARTING] Cloudflare Gateway Peak: 250 users via %WORKER_URL% (1m) [ZERO DOWNLOAD]
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%WORKER_URL% -e PROFILE=250 load_tests/fake_users.js
goto finish

:opt_custom
echo.
echo ============================================================================
echo                     CUSTOM LOAD TEST SETTINGS
echo ============================================================================
set "custom_url=%LOCAL_URL%"
set /p custom_url="Enter Target URL [default: %LOCAL_URL%]: "

set "custom_vus=50"
set /p custom_vus="Number of concurrent users [default: 50]: "

set "custom_dur=30s"
set /p custom_dur="Duration (e.g. 20s, 1m, 2m) [default: 30s]: "

echo.
echo [STARTING] Custom Test: %custom_vus% users for %custom_dur% on %custom_url%...
echo ============================================================================
"%K6_CMD%" run -e TARGET_URL=%custom_url% --vus %custom_vus% --duration %custom_dur% load_tests/fake_users.js
goto finish

:finish
echo.
echo ============================================================================
echo   Test completed! Review metrics above (requests/sec, p95 latency, errors).
echo ============================================================================
echo.
pause
goto menu

:opt_exit
endlocal
exit /b 0
