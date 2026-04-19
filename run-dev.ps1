param(
    [string]$ApiBaseUrl = "",
    [switch]$UpdateDeps
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendScript = Join-Path $repoRoot "run-backend.ps1"
$frontendScript = Join-Path $repoRoot "run-frontend.ps1"

Write-Host "Launching backend and frontend in separate PowerShell windows..." -ForegroundColor Cyan

Start-Process pwsh -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", $backendScript
    $(if ($UpdateDeps) { "-UpdateDeps" })
)

$frontendArgs = @(
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

Start-Process pwsh -ArgumentList $frontendArgs
