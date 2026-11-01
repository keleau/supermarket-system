@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "app\backend\.env" (
  copy "app\backend\.env.demo" "app\backend\.env" >nul
  echo.
  echo 首次运行：请确认 MySQL 地址、账号、密码，保存后关闭记事本。
  start /wait notepad "app\backend\.env"
)

cd /d "%~dp0app\backend"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" scripts\demoLauncher.js
) else (
  node scripts\demoLauncher.js
)

if errorlevel 1 (
  echo.
  echo 启动失败：请根据上面的提示修改后重新双击 start-demo.bat。
  pause
)
