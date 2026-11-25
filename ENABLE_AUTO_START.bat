@echo off
setlocal
cd /d "%~dp0"
title Enable Auto-Start on Windows Boot - Deep Computers
color 0A

echo ============================================================================
echo      DEEP COMPUTERS - CONFIGURE AUTOMATIC STARTUP ON WINDOWS BOOT
echo ============================================================================
echo.

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\DeepComputersServer.lnk"
set "TARGET_BAT=%~dp0start.bat"

:: Clean up any old duplicate start.bat in Startup
if exist "%STARTUP_DIR%\start.bat" del /f /q "%STARTUP_DIR%\start.bat"
if exist "%STARTUP_DIR%\worker_config.json" del /f /q "%STARTUP_DIR%\worker_config.json"

:: Create or update Windows Shortcut (.lnk)
powershell -NoProfile -Command "$wsh = New-Object -ComObject WScript.Shell; $sc = $wsh.CreateShortcut('%SHORTCUT_PATH%'); $sc.TargetPath = '%TARGET_BAT%'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Deep Computers Permanent Store Server'; $sc.WindowStyle = 1; $sc.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [SUCCESS] Windows Auto-Start has been configured!
    echo.
    echo Target            : %TARGET_BAT%
    echo Working Directory : %~dp0
    echo Startup Shortcut  : %SHORTCUT_PATH%
    echo.
    echo The server will now start automatically whenever your computer boots up.
) else (
    echo [ERROR] Failed to create startup shortcut.
)

echo.
pause
endlocal
