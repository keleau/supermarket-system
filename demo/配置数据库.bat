@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "app\backend\.env" (
  copy "app\backend\.env.demo" "app\backend\.env" >nul
  echo 已创建 app\backend\.env，请填写学校电脑 MySQL 的账号密码。
)

start /wait notepad "app\backend\.env"
echo 配置已保存，双击 start-demo.bat 启动。
pause
