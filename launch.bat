@echo off
REM ===========================================================================
REM  HangOwl local launcher
REM  Starts the Vite dev server (http://localhost:5173).
REM  The link-preview cloud function runs locally too, in-process, so bookmark
REM  auto-fill works without deploying anything to Supabase.
REM ===========================================================================
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found on your PATH. Install Node.js 18+ from https://nodejs.org and retry.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies ^(first run^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo.
  echo [WARN] No .env found. Copy .env.example to .env and add your Supabase
  echo        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then run this again.
  echo.
)

echo.
echo   HangOwl is starting on http://localhost:5173
echo   Link-preview function is served locally at /api/link-preview
echo   Press Ctrl+C to stop.
echo.

REM Open the browser shortly after the server boots (non-blocking).
start "" cmd /c "timeout /t 3 >nul & start "" http://localhost:5173"

call npm run dev

endlocal
