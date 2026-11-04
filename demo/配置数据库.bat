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
  echo 已创建 %BACKEND_DIR%\.env，请填写学校电脑 MySQL 的账号密码。
)

start /wait notepad "%BACKEND_DIR%\.env"
echo 配置已保存，双击 start-demo.bat 启动。
pause
