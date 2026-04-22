param(
    [string]$ApiBaseUrl = "",
    [switch]$UpdateDeps,
    [switch]$UseDevClient,
    [switch]$UseExpoGo,
    [switch]$UsbDebugging,
    [ValidateSet("lan", "tunnel", "localhost")]
    [string]$ExpoHost = "lan"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendScript = Join-Path $repoRoot "run-backend.ps1"
$frontendScript = Join-Path $repoRoot "run-frontend.ps1"

Write-Host "Launching backend and frontend in separate PowerShell windows..." -ForegroundColor Cyan

Start-Process pwsh -ArgumentList @(
    "-NoProfile",
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", $backendScript
    $(if ($UpdateDeps) { "-UpdateDeps" })
)

$frontendArgs = @(
    "-NoProfile",
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", $frontendScript
)

if ($ApiBaseUrl) {
    $frontendArgs += @("-ApiBaseUrl", $ApiBaseUrl)
}

if ($UpdateDeps) {
    $frontendArgs += "-UpdateDeps"
}

if ($UseDevClient) {
    $frontendArgs += "-UseDevClient"
}

if ($UseExpoGo) {
    $frontendArgs += "-UseExpoGo"
}

if ($UsbDebugging) {
    $frontendArgs += "-UsbDebugging"
}

if ($ExpoHost) {
    $frontendArgs += @("-ExpoHost", $ExpoHost)
}

Start-Process pwsh -ArgumentList $frontendArgs
