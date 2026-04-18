@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "HOST_PY=%SCRIPT_DIR%native_host.py"

for %%P in (py python python3) do (
    where %%P >nul 2>&1
    if not errorlevel 1 (
        %%P "%HOST_PY%"
        exit /b %errorlevel%
    )
)

exit /b 1
