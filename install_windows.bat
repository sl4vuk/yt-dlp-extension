@echo off
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo =========================================
echo  YT Bookmark Cleaner - Universal Install
echo =========================================
set "PY="
for %%P in (py python python3) do (
  if not defined PY (where %%P >nul 2>nul && set "PY=%%P")
)
if not defined PY (
  echo [INFO] Python not found.
  where winget >nul 2>nul
  if not errorlevel 1 (
    winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
  ) else (
    echo [ERROR] Python is required. Windows 7/8/8.1: install Python 3.8.x and enable Add Python to PATH.
    start https://www.python.org/downloads/
    pause
    exit /b 1
  )
)
set "PY="
for %%P in (py python python3) do (
  if not defined PY (where %%P >nul 2>nul && set "PY=%%P")
)
if not defined PY (
  echo [ERROR] Python is not visible yet. Close this window and run again.
  pause
  exit /b 1
)
%PY% "%~dp0install_universal.py" --repair
set "RC=%errorlevel%"
echo.
if "%RC%"=="0" (echo [OK] Done. Reload extension at chrome://extensions) else (echo [ERROR] Installer exited with code %RC%.)
pause
exit /b %RC%
