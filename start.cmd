@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Для запуска требуется Node.js 20 или новее.
  pause
  exit /b 1
)
echo Откройте в браузере: http://127.0.0.1:4173
echo Чтобы остановить СкеБаланс, нажмите Ctrl+C или закройте это окно.
node server.mjs
pause
