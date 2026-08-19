@echo off
REM Social Hub - One-click launcher with PERMANENT public HTTPS domain via Cloudflare Tunnel
REM Starts backend (8000), storage server (8001), frontend preview (4173), 
REM and a Cloudflare NAMED tunnel exposing the app at the permanent URL:
REM https://social.simonadhikari.com.np
REM (Tunnel ID: 15c12677-fff9-4e8a-a752-a8f16ce9873f)

title Social Hub - Public Domain Launcher
color 0B

echo ============================================
echo   Social Hub - Public Domain Launcher
echo ============================================
echo.

set PROJECT_ROOT=E:\oop\project
set CLOUDFLARED=%USERPROFILE%\cloudflared.exe
set PYTHON=C:\Users\Dell\AppData\Local\Python\bin\python3.exe

REM Check prerequisites
if not exist "%CLOUDFLARED%" (
    echo ERROR: cloudflared.exe not found at %CLOUDFLARED%
    pause
    exit /b 1
)
if not exist "%PROJECT_ROOT%\frontend\dist\index.html" (
    echo ERROR: Frontend not built. Run 'npm run build' in frontend folder first.
    pause
    exit /b 1
)

REM Kill any existing processes on our ports
for %%p in (8000 8001 4173) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p "') do (
        echo Stopping existing process on port %%p (PID %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo Starting Backend API on http://127.0.0.1:8000 ...
start "Social Hub Backend" /B "%PYTHON%" -m uvicorn api:app --port 8000 --reload

echo Starting Storage Server on http://127.0.0.1:8001 ...
start "Social Hub Storage" /B "%PYTHON%" -m uvicorn storage:app --port 8001 --reload

echo Starting Frontend Preview on http://127.0.0.1:4173 ...
start "Social Hub Frontend" /B cmd /c "cd /d %PROJECT_ROOT%\frontend && npx vite preview --port 4173 --strictPort"

echo.
echo Waiting for servers to start...
timeout /t 5 >nul

echo Starting Cloudflare Named Tunnel (social-hub)...
start "Cloudflare Tunnel" "%CLOUDFLARED%" tunnel run social-hub

echo.
echo ============================================
echo   Social Hub is running!
echo ============================================
echo.
echo Local URLs:
echo   Frontend:  http://127.0.0.1:4173
echo   Backend:   http://127.0.0.1:8000
echo   Storage:   http://127.0.0.1:8001
echo.
echo PERMANENT PUBLIC DOMAIN (never changes):
echo   https://social.simonadhikari.com.np
echo.
echo Share this URL with anyone - it works everywhere, forever!
echo.
echo Test accounts:
echo   Online:  demo@test.com / Demo@Pass123!
echo   Offline: demo@example.test / DemoPass1!
echo.
echo Press Ctrl+C in each window to stop servers...
echo.

pause