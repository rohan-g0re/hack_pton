@echo off
REM Dev fallback — run Next.js locally + expose it via ngrok so phones on
REM other networks can reach the app before the Linux EC2 is provisioned.
REM
REM Requires: ngrok installed and authed (`ngrok config add-authtoken ...`).

setlocal
if "%PORT%"=="" set PORT=3000

where ngrok >nul 2>nul
if errorlevel 1 (
  echo ngrok not found. Install: https://ngrok.com/download
  exit /b 1
)

cd /d "%~dp0.."

echo [dev-tunnel] starting Next.js on :%PORT%...
start "aegis-dev" cmd /c "npm run dev -- -p %PORT%"

timeout /t 4 /nobreak >nul

echo [dev-tunnel] starting ngrok HTTPS tunnel...
ngrok http %PORT%
