@echo off
title AI Quiz Helper

cd /d "%~dp0"

echo [1/2] Checking dependencies...
py -m pip install flask openai flask-cors python-dotenv --quiet

echo [2/2] Starting server...
echo.
echo ================================================
echo   Server: http://127.0.0.1:5000
echo   Close this window to stop.
echo ================================================
echo.

py server.py

pause
