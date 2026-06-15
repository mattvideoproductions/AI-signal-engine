param(
  [int]$Port = 9222,
  [string]$UserDataDir = "$env:USERPROFILE\.hermes\chrome-debug"
)

$ErrorActionPreference = "Stop"

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $candidates) {
  Write-Error "No Chrome, Brave, or Edge executable found. Install one, then rerun this script."
}

$browser = $candidates[0]
New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null

$args = @(
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$Port",
  "--user-data-dir=$UserDataDir",
  "--no-first-run",
  "--no-default-browser-check"
)

Start-Process -FilePath $browser -ArgumentList $args
Start-Sleep -Seconds 2

try {
  $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 3
  Write-Host "CDP browser ready at http://127.0.0.1:$Port"
  Write-Host "WebSocket: $($version.webSocketDebuggerUrl)"
  Write-Host "In Hermes CLI, run: /browser connect"
} catch {
  Write-Error "Browser launched, but CDP did not answer on 127.0.0.1:$Port. Close existing browser windows and rerun."
}
