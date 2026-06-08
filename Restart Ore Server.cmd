@echo off
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8087" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>nul
)
npm.cmd start
pause
