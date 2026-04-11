@echo off
:: install_windows.bat — YT Bookmark Cleaner native host installer
:: Run this ONCE as a normal user (no admin needed).
:: Double-click it or run from cmd.
setlocal enabledelayedexpansion

echo.
echo =========================================
echo  YT Bookmark Cleaner - Windows Installer
echo =========================================
echo.

:: ── 1. Find Python ───────────────────────────────────────────────
set PYTHON=
for %%P in (python python3 py) do (
    if "!PYTHON!"=="" (
        where %%P >nul 2>&1 && set PYTHON=%%P
    )
)
if "!PYTHON!"=="" (
    echo [ERROR] Python not found. Install Python from https://www.python.org/downloads/
    echo         Make sure to check "Add Python to PATH" during install.
    pause & exit /b 1
)
echo [OK] Python found: !PYTHON!

:: ── 2. Install / upgrade yt-dlp ─────────────────────────────────
echo.
echo Installing yt-dlp...
!PYTHON! -m pip install --upgrade yt-dlp
if errorlevel 1 (
    echo [ERROR] Failed to install yt-dlp. Check your internet connection.
    pause & exit /b 1
)
echo [OK] yt-dlp installed.

:: ── 3. Locate native_host.py (same folder as this .bat) ─────────
set SCRIPT_DIR=%~dp0
set HOST_PY=%SCRIPT_DIR%native_host.py
if not exist "!HOST_PY!" (
    echo [ERROR] native_host.py not found next to this script.
    echo         Expected: !HOST_PY!
    pause & exit /b 1
)
echo [OK] native_host.py found: !HOST_PY!

:: ── 4. Get Python executable full path ──────────────────────────
for /f "delims=" %%I in ('where !PYTHON!') do set PYTHON_EXE=%%I
echo [OK] Python exe: !PYTHON_EXE!

:: ── 5. Ask for Extension ID ──────────────────────────────────────
echo.
echo To find your Extension ID:
echo   1. Open Chrome and go to:  chrome://extensions
echo   2. Enable Developer mode (top-right toggle)
echo   3. Find "YT Bookmark Cleaner" and copy its ID
echo      (looks like: abcdefghijklmnopqrstuvwxyzabcdef)
echo.
set /p EXT_ID="Paste your Extension ID here and press Enter: "
if "!EXT_ID!"=="" (
    echo [ERROR] No Extension ID entered.
    pause & exit /b 1
)

:: ── 6. Write com.ytbookmark.ytdlp.json ──────────────────────────
set JSON_PATH=%SCRIPT_DIR%com.ytbookmark.ytdlp.json

:: Build a wrapper .bat that launches python native_host.py
:: (Chrome on Windows needs an .exe or .bat as the "path" in the manifest)
set WRAPPER_BAT=%SCRIPT_DIR%native_host_launcher.bat
echo @echo off > "!WRAPPER_BAT!"
echo "!PYTHON_EXE!" "!HOST_PY!" >> "!WRAPPER_BAT!"

:: Write the JSON manifest — escape backslashes
set HOST_PY_ESC=!HOST_PY:\=\\!
set WRAPPER_ESC=!WRAPPER_BAT:\=\\!

(
echo {
echo   "name": "com.ytbookmark.ytdlp",
echo   "description": "YT Bookmark Cleaner - yt-dlp bridge",
echo   "path": "!WRAPPER_ESC!",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://!EXT_ID!/"
echo   ]
echo }
) > "!JSON_PATH!"

echo [OK] Manifest written: !JSON_PATH!

:: ── 7. Register in Windows Registry ─────────────────────────────
set REG_KEY=HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.ytbookmark.ytdlp
reg add "!REG_KEY!" /ve /t REG_SZ /d "!JSON_PATH!" /f >nul
if errorlevel 1 (
    echo [ERROR] Failed to write registry key.
    pause & exit /b 1
)
echo [OK] Registry key set.

:: ── 8. Done ─────────────────────────────────────────────────────
echo.
echo =========================================
echo  Installation complete!
echo =========================================
echo.
echo Next steps:
echo   1. Go to chrome://extensions
echo   2. Click the reload button on YT Bookmark Cleaner
echo   3. Open the extension, set your output folder path, and click Download All
echo.
pause
