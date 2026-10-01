@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-all.ps1"
if errorlevel 1 (
  echo FileGuard did not start. Read the error above.
  pause
)
endlocal
