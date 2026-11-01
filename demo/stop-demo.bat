@echo off
chcp 65001 >nul
setlocal
set "PIDFILE=%~dp0app\backend\.demo.pid"

if not exist "%PIDFILE%" (
  echo 未发现正在运行的演示服务。
  pause
  exit /b 0
)

set /p PID=<"%PIDFILE%"
if not "%PID%"=="" taskkill /PID %PID% /T /F >nul 2>&1
if exist "%PIDFILE%" del "%PIDFILE%" >nul 2>&1

echo 演示服务已停止。
pause
