@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "BACKEND_DIR=%~dp0app\backend"

if not exist "%BACKEND_DIR%\.env.demo" (
  echo.
  echo [错误] 演示包不完整：缺少 %BACKEND_DIR%\.env.demo
  echo 请重新生成演示包：node scripts\package-demo.js
  echo.
  pause
  exit /b 1
)

if not exist "%BACKEND_DIR%\.env" (
  copy "%BACKEND_DIR%\.env.demo" "%BACKEND_DIR%\.env" >nul
  echo.
  echo 首次运行：请确认 MySQL 地址、账号、密码，保存后关闭记事本。
  start /wait notepad "%BACKEND_DIR%\.env"
)

cd /d "%BACKEND_DIR%"
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
