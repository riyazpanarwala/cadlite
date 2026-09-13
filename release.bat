@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js to use this release tool.
    echo.
    pause
    exit /b 1
)

node scripts\release.js %*
set RELEASE_EXIT_CODE=%ERRORLEVEL%

if %RELEASE_EXIT_CODE% NEQ 0 (
    echo.
    echo [INFO] Release process finished with code %RELEASE_EXIT_CODE%.
)

echo.
pause
exit /b %RELEASE_EXIT_CODE%
