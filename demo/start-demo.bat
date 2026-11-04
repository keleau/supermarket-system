@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if exist "%~dp0..\release\超市管家-演示包\start-demo.bat" (
  echo 正在启动已生成的演示包...
  call "%~dp0..\release\超市管家-演示包\start-demo.bat"
  exit /b %errorlevel%
)

echo.
echo 当前 demo 目录是演示包模板，不能直接启动。
echo 请先在项目根目录执行：node scripts\package-demo.js
echo 然后双击 release\超市管家-演示包\start-demo.bat
echo.
pause
exit /b 1
