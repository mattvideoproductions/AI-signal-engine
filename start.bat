@echo off
REM ===========================================================
REM   AI Signal Engine - one-click launcher (Windows)
REM   Double-click this file to install, build, run, and open
REM   the dashboard. No Docker required.
REM ===========================================================
setlocal
cd /d "%~dp0"
title AI Signal Engine

echo.
echo   ===========================================
echo     AI SIGNAL ENGINE
echo     Private Hermes-powered creator map
echo   ===========================================
echo.

REM --- 1. Node.js present? ---
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js is not installed.
  echo       Install the LTS build from https://nodejs.org then re-run this file.
  echo.
  pause
  exit /b 1
)

REM --- 2. Dependencies installed? ---
if not exist "node_modules" (
  echo   [*] First run: installing dependencies. This can take a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo   [X] npm install failed. Scroll up for the error.
    pause
    exit /b 1
  )
)

REM --- 3. Environment file present? ---
if not exist ".env" (
  echo   [*] No .env found. Creating one from .env.example [open demo mode].
  copy ".env.example" ".env" >nul
)

REM --- 4. Production build present? ---
if not exist ".next\BUILD_ID" (
  echo   [*] Building the app. This can take about 30 seconds...
  call npm run build
  if errorlevel 1 (
    echo   [X] Build failed. Scroll up for the error.
    pause
    exit /b 1
  )
)

REM --- 5. Open the browser a few seconds after the server boots ---
echo   [*] Launching the map at http://localhost:3000
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:3000'"

REM --- 6. Start the server [this window stays open while it runs] ---
echo   [*] Server starting. Keep this window open. Press Ctrl+C to stop.
echo.
call npm run start

echo.
echo   Server stopped.
pause
