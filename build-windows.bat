@echo off
setlocal
title CineFTP - Build Windows Installer
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install the LTS version from https://nodejs.org then run this again.
  pause
  exit /b 1
)

echo.
echo === Installing dependencies (first time takes a few minutes) ===
call npm install --legacy-peer-deps --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo === Building CineFTP Desktop installer ===
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run desktop:build
if errorlevel 1 goto :fail

echo.
echo ================================================================
echo  DONE!  Installer is here:  release\CineFTP-Setup-<version>.exe
echo  Double-click it to install; a CineFTP shortcut appears on Desktop.
echo ================================================================
start "" "%~dp0release"
pause
exit /b 0

:fail
echo.
echo [ERROR] Build failed. See messages above.
echo If you see "Cannot create symbolic link": right-click this file ^> Run as administrator
echo (or turn on Windows Developer Mode) and run it again.
pause
exit /b 1
