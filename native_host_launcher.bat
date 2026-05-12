@echo off
setlocal
set "PATH=C:\Users\Administrator\Downloads\yt-dlp-extension\bin;%PATH%"
"C:\Program Files\Python312\python.exe" -u "C:\Users\Administrator\Downloads\yt-dlp-extension\native_host.py"
exit /b %errorlevel%
