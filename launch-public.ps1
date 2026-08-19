<# 
.SYNOPSIS
    Social Hub - One-click launcher with PERMANENT public HTTPS domain via Cloudflare Tunnel
.DESCRIPTION
    Starts backend (8000), storage server (8001), frontend preview (4173), 
    and a Cloudflare NAMED tunnel exposing the app at the permanent URL:
    https://social.simonadhikari.com.np
    (Tunnel ID: 15c12677-fff9-4e8a-a752-a8f16ce9873f)
.NOTES
    Requires: Python 3.11+, cloudflared.exe in %USERPROFILE%, npm build already run.
    One-time setup already done: cloudflared tunnel login + tunnel create + route dns.
#>

param(
    [switch]$NoTunnel = $false
)

$ErrorActionPreference = "Stop"
$projectRoot = "E:\oop\project"
$cloudflared = "$env:USERPROFILE\cloudflared.exe"
$permanentUrl = "https://social.simonadhikari.com.np"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Social Hub - Public Domain Launcher" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
if (-not (Test-Path $cloudflared)) {
    Write-Error "cloudflared.exe not found at $cloudflared"
    exit 1
}
if (-not (Test-Path "$projectRoot\frontend\dist\index.html")) {
    Write-Error "Frontend not built. Run 'npm run build' in frontend folder first."
    exit 1
}

# Kill any existing processes on our ports
$ports = @(8000, 8001, 4173)
foreach ($port in $ports) {
    $proc = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    if ($proc) {
        Write-Host "Stopping existing process on port $port (PID $proc)..." -ForegroundColor Yellow
        Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
    }
}

# Start Backend API (port 8000)
Write-Host "Starting Backend API on http://127.0.0.1:8000 ..." -ForegroundColor Green
$backendProc = Start-Process -FilePath "C:\Users\Dell\AppData\Local\Python\bin\python3.exe" `
    -ArgumentList "-m", "uvicorn", "api:app", "--port", "8000", "--reload" `
    -WorkingDirectory "$projectRoot\backend" `
    -PassThru

# Start Storage Server (port 8001)
Write-Host "Starting Storage Server on http://127.0.0.1:8001 ..." -ForegroundColor Green
$storageProc = Start-Process -FilePath "C:\Users\Dell\AppData\Local\Python\bin\python3.exe" `
    -ArgumentList "-m", "uvicorn", "storage:app", "--port", "8001", "--reload" `
    -WorkingDirectory "$projectRoot\storage_server" `
    -PassThru

# Start Frontend Preview (port 4173)
Write-Host "Starting Frontend Preview on http://127.0.0.1:4173 ..." -ForegroundColor Green
$frontendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "cd /d $projectRoot\frontend && npx vite preview --port 4173 --strictPort" `
    -WorkingDirectory "$projectRoot\frontend" `
    -PassThru

# Wait for servers to be ready
Write-Host "Waiting for servers to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$tunnelUrl = $null
$tunnelProc = $null

if (-not $NoTunnel) {
    # Start Cloudflare NAMED tunnel (permanent URL, never changes)
    Write-Host "Starting Cloudflare Named Tunnel (social-hub)..." -ForegroundColor Green
    $tunnelProc = Start-Process -FilePath $cloudflared `
        -ArgumentList "tunnel", "run", "social-hub" `
        -RedirectStandardOutput "$env:TEMP\cf_tunnel_out.txt" `
        -RedirectStandardError "$env:TEMP\cf_tunnel_err.txt" `
        -PassThru

    # Wait for the tunnel connection to be registered
    Write-Host "Waiting for tunnel to connect..." -ForegroundColor Yellow
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        $output = Get-Content "$env:TEMP\cf_tunnel_out.txt", "$env:TEMP\cf_tunnel_err.txt" -ErrorAction SilentlyContinue -Raw
        if ($output -match 'Registered tunnel connection') {
            break
        }
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Social Hub is running!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Local URLs:" -ForegroundColor White
Write-Host "  Frontend:  http://127.0.0.1:4173" -ForegroundColor Gray
Write-Host "  Backend:   http://127.0.0.1:8000" -ForegroundColor Gray
Write-Host "  Storage:   http://127.0.0.1:8001" -ForegroundColor Gray
Write-Host ""

if (-not $NoTunnel) {
    Write-Host "PERMANENT PUBLIC DOMAIN (works in ANY browser on ANY device):" -ForegroundColor Green
    Write-Host "  $permanentUrl" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This URL NEVER changes - share it everywhere!" -ForegroundColor Cyan
} else {
    Write-Host "Tunnel skipped (-NoTunnel). Local access only." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Test accounts:" -ForegroundColor White
Write-Host "  Online:  demo@test.com / Demo@Pass123!" -ForegroundColor Gray
Write-Host "  Offline: demo@example.test / DemoPass1!" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop all servers..." -ForegroundColor Gray

# Keep script running and handle cleanup
try {
    while ($true) { Start-Sleep -Seconds 10 }
}
finally {
    Write-Host "`nShutting down..." -ForegroundColor Yellow
    @($backendProc, $storageProc, $frontendProc, $tunnelProc) | Where-Object { $_ } | ForEach-Object {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Done." -ForegroundColor Green
}