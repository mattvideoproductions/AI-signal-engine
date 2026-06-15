@echo off
REM ===========================================================
REM   AI Signal Engine - Hermes local browser launcher (Windows)
REM   Double-click this before running /browser connect in Hermes CLI.
REM ===========================================================
setlocal
cd /d "%~dp0"
title AI Signal Engine Browser

echo.
echo   ===========================================
echo     AI SIGNAL ENGINE BROWSER
echo     Local CDP browser for Hermes
echo   ===========================================
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo   [X] PowerShell is not available.
  pause
  exit /b 1
)

echo   [*] Launching Chrome/Brave/Edge with CDP on 127.0.0.1:9222...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-cdp-browser.ps1"
if errorlevel 1 (
  echo.
  echo   [X] Browser launch failed. Scroll up for the error.
  pause
  exit /b 1
)

echo.
echo   [OK] Browser is ready.
echo   In Hermes CLI, run:
echo.
echo     /browser connect
echo     /browser status
echo.
echo   Keep the launched browser window open while Hermes researches.
echo.
pause
