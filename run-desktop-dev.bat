@echo off
cd /d "%~dp0"
call npm install --legacy-peer-deps --no-audit --no-fund
call npm run desktop:run
pause
