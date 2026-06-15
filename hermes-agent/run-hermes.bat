@echo off
REM ===========================================================
REM   Hermes Agent - run a live scan (Windows)
REM   Make sure the dashboard is running first (start.bat).
REM ===========================================================
setlocal
cd /d "%~dp0"
title Hermes Agent

where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js is not installed. Get it from https://nodejs.org
  pause
  exit /b 1
)

if not exist ".env" (
  echo   [*] No .env here yet. Creating one from .env.example.
  copy ".env.example" ".env" >nul
  echo   [!] Open hermes-agent\.env and paste in your model API key, then re-run.
  notepad ".env"
  pause
  exit /b 0
)

REM Pass any args straight through, e.g.:  run-hermes.bat --watch 30
node agent.mjs %*

echo.
pause
