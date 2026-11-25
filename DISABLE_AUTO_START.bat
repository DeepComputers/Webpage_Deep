@echo off
setlocal
title Disable Auto-Start on Windows Boot - Deep Computers
color 0C

echo ============================================================================
echo      DEEP COMPUTERS - DISABLE AUTOMATIC STARTUP
echo ============================================================================
echo.

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\DeepComputersServer.lnk"

if exist "%SHORTCUT_PATH%" del /f /q "%SHORTCUT_PATH%"
if exist "%STARTUP_DIR%\start.bat" del /f /q "%STARTUP_DIR%\start.bat"

echo [SUCCESS] Auto-Start has been disabled. The server will not start on boot.
echo.
pause
endlocal
