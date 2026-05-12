@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

title YT Bookmark Cleaner - Windows installer

echo.
echo =========================================
echo  YT Bookmark Cleaner - Windows Install
echo =========================================
echo.

set "APP=YT Bookmark Cleaner"
set "ERR=0"
set "WARN=0"
set "PY="
set "PY_CHECK=%TEMP%\ytbc_python_check.txt"

if not exist "%~dp0install_universal.py" (
  echo [ERROR] install_universal.py was not found next to this .bat.
  echo         Put install_windows.bat inside the extension folder.
  pause
  exit /b 1
)

rem ------------------------------------------------------------
rem 0. Keep bundled ffmpeg in the expected bin folder when present
rem ------------------------------------------------------------
if not exist "%~dp0bin" mkdir "%~dp0bin" >nul 2>&1
if exist "%~dp0ffmpeg.exe" if not exist "%~dp0bin\ffmpeg.exe" (
  echo [INFO] Copying bundled ffmpeg.exe to bin\ffmpeg.exe ...
  copy /y "%~dp0ffmpeg.exe" "%~dp0bin\ffmpeg.exe" >nul 2>&1
)

rem ------------------------------------------------------------
rem 1. Find a REAL Python. Do not accept Microsoft Store aliases.
rem ------------------------------------------------------------
echo [CHECK] Looking for a working Python...
call :try_python "py -3"
if not defined PY call :try_python "py"
if not defined PY call :try_python "python"
if not defined PY call :try_python "python3"
if not defined PY call :find_python_in_common_paths

if defined PY (
  echo [OK] Python found: !PY!
  !PY! --version
  goto :python_ready
)

echo [INFO] Working Python was not found.
echo        If Windows shows "Python was not found", that is the Microsoft Store alias, not real Python.

rem ------------------------------------------------------------
rem 2. Install Python with winget first. Fallback to official installer.
rem ------------------------------------------------------------
where winget >nul 2>&1
if not errorlevel 1 (
  echo [INFO] Installing Python using winget...
  winget source update >nul 2>&1
  winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo [WARN] Python 3.12 winget install failed. Trying Python 3.11...
    winget install --id Python.Python.3.11 -e --accept-package-agreements --accept-source-agreements
  )
  if errorlevel 1 (
    echo [WARN] Python 3.11 winget install failed. Trying Python 3.10...
    winget install --id Python.Python.3.10 -e --accept-package-agreements --accept-source-agreements
  )
  if errorlevel 1 (
    echo [WARN] Python 3.10 winget install failed. Trying Python 3.8 for old Windows...
    winget install --id Python.Python.3.8 -e --accept-package-agreements --accept-source-agreements
  )
) else (
  echo [WARN] winget was not found.
  echo        Trying official Python installer fallback...
  call :download_python_fallback
)

call :refresh_path
set "PY="
call :try_python "py -3"
if not defined PY call :try_python "py"
if not defined PY call :try_python "python"
if not defined PY call :try_python "python3"
if not defined PY call :find_python_in_common_paths

if not defined PY (
  echo.
  echo [ERROR] Python still is not available.
  echo.
  echo Fix options:
  echo   1. Close this window and run install_windows.bat again.
  echo   2. Disable Python aliases:
  echo      Settings ^> Apps ^> Advanced app settings ^> App execution aliases
  echo      Turn OFF python.exe and python3.exe aliases.
  echo   3. Install Python manually from https://www.python.org/downloads/
  echo      Enable "Add Python to PATH".
  pause
  exit /b 1
)

:python_ready

echo.
echo [CHECK] Python executable:
!PY! -c "import sys; print(sys.executable)"

rem ------------------------------------------------------------
rem 3. Ensure pip and Python dependencies
rem ------------------------------------------------------------
echo.
echo [INFO] Preparing pip...
!PY! -m ensurepip --upgrade >nul 2>&1
!PY! -m pip install --upgrade pip
if errorlevel 1 (
  echo [WARN] pip upgrade failed. Continuing.
  set /a WARN+=1
)

echo.
echo [INFO] Installing Python dependencies: yt-dlp mutagen...
!PY! -m pip install --upgrade yt-dlp mutagen
if errorlevel 1 (
  echo [ERROR] Failed to install yt-dlp/mutagen with pip.
  echo         Check internet connection, antivirus, or corporate firewall.
  pause
  exit /b 1
)

rem ------------------------------------------------------------
rem 4. Ensure ffmpeg. Prefer local bundled file; winget as backup.
rem ------------------------------------------------------------
echo.
echo [CHECK] Looking for ffmpeg...
if exist "%~dp0bin\ffmpeg.exe" (
  echo [OK] Bundled ffmpeg found: %~dp0bin\ffmpeg.exe
  goto :ffmpeg_ready
)
if exist "%~dp0ffmpeg.exe" (
  copy /y "%~dp0ffmpeg.exe" "%~dp0bin\ffmpeg.exe" >nul 2>&1
  echo [OK] Bundled ffmpeg copied to bin\ffmpeg.exe
  goto :ffmpeg_ready
)
where ffmpeg >nul 2>&1
if not errorlevel 1 (
  echo [OK] System ffmpeg found in PATH.
  goto :ffmpeg_ready
)

where winget >nul 2>&1
if not errorlevel 1 (
  echo [INFO] Installing ffmpeg using winget...
  winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo [WARN] Gyan.FFmpeg failed. Trying BtbN.FFmpeg.GPL...
    winget install --id BtbN.FFmpeg.GPL -e --accept-package-agreements --accept-source-agreements
  )
  call :refresh_path
) else (
  echo [WARN] winget is unavailable and no bundled ffmpeg.exe was found.
  echo        Audio conversion may fail until ffmpeg is installed.
  set /a WARN+=1
)

:ffmpeg_ready

rem ------------------------------------------------------------
rem 5. Run the real Python installer/repair
rem ------------------------------------------------------------
echo.
echo [INFO] Running universal installer/repair...
!PY! "%~dp0install_universal.py" --repair %*
set "RC=!errorlevel!"

echo.
if "!RC!"=="0" (
  echo [OK] Installation/repair complete.
  echo.
  echo Next steps:
  echo   1. Open chrome://extensions
  echo   2. Click Reload on YT Bookmark Cleaner
  echo   3. If Chrome was open during install, close and reopen it.
) else (
  echo [ERROR] install_universal.py exited with code !RC!.
  echo.
  echo Run this for details:
  echo   !PY! install_universal.py --diagnose
)

echo.
pause
exit /b !RC!

rem ============================================================
rem Helpers
rem ============================================================
:try_python
set "CAND=%~1"
if "%CAND%"=="" exit /b 1
%CAND% -c "import sys; print(sys.executable)" > "%PY_CHECK%" 2>&1
if errorlevel 1 exit /b 1
findstr /i /c:"Python was not found" "%PY_CHECK%" >nul 2>&1 && exit /b 1
findstr /i /c:"Microsoft Store" "%PY_CHECK%" >nul 2>&1 && exit /b 1
set "PY=%CAND%"
exit /b 0

:find_python_in_common_paths
for %%D in (
  "%LocalAppData%\Programs\Python\Python312\python.exe"
  "%LocalAppData%\Programs\Python\Python311\python.exe"
  "%LocalAppData%\Programs\Python\Python310\python.exe"
  "%LocalAppData%\Programs\Python\Python39\python.exe"
  "%LocalAppData%\Programs\Python\Python38\python.exe"
  "%ProgramFiles%\Python312\python.exe"
  "%ProgramFiles%\Python311\python.exe"
  "%ProgramFiles%\Python310\python.exe"
  "%ProgramFiles%\Python39\python.exe"
  "%ProgramFiles%\Python38\python.exe"
  "%ProgramFiles(x86)%\Python38-32\python.exe"
) do (
  if not defined PY if exist %%~D (
    %%~D -c "import sys; print(sys.executable)" > "%PY_CHECK%" 2>&1
    if not errorlevel 1 set "PY=%%~D"
  )
)
exit /b 0

:refresh_path
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USERPATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSTEMPATH=%%B"
set "PATH=%PATH%;%USERPATH%;%SYSTEMPATH%;%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%LocalAppData%\Programs\Python\Python311;%LocalAppData%\Programs\Python\Python311\Scripts;%LocalAppData%\Programs\Python\Python310;%LocalAppData%\Programs\Python\Python310\Scripts;%LocalAppData%\Programs\Python\Python38;%LocalAppData%\Programs\Python\Python38\Scripts"
exit /b 0

:download_python_fallback
set "PY_URL=https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
set "PY_INSTALLER=%TEMP%\ytbc-python-installer.exe"
if /i "%PROCESSOR_ARCHITECTURE%"=="x86" set "PY_URL=https://www.python.org/ftp/python/3.8.10/python-3.8.10.exe"
ver | findstr /r " 6\.1\| 6\.2\| 6\.3" >nul 2>&1
if not errorlevel 1 (
  if /i "%PROCESSOR_ARCHITECTURE%"=="x86" (
    set "PY_URL=https://www.python.org/ftp/python/3.8.10/python-3.8.10.exe"
  ) else (
    set "PY_URL=https://www.python.org/ftp/python/3.8.10/python-3.8.10-amd64.exe"
  )
)
echo [INFO] Downloading Python from: %PY_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%PY_URL%' -OutFile '%PY_INSTALLER%'"
if errorlevel 1 (
  echo [ERROR] Python download failed.
  exit /b 1
)
echo [INFO] Installing Python silently...
"%PY_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=1
exit /b 0
