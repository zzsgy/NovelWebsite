@echo off
cd /d "%~dp0"
echo 正在启动「小说创作工作台」...
echo 启动后浏览器会打开 http://127.0.0.1:5178/
echo 关闭此窗口即停止服务。
npm run dev
pause
