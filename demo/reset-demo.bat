@echo off
chcp 65001 >nul
setlocal

if exist "%~dp0app\backend\.demo.pid" (
  echo 请先双击 stop-demo.bat 停止演示服务，再重置数据。
  pause
  exit /b 0
)

cd /d "%~dp0app\backend"
echo 正在重建演示数据库（会清空演示数据）...
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" db\init.js
) else (
  node db\init.js
)

echo.
echo 数据重建完成。
pause
