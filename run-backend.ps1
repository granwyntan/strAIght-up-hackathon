param(
    [switch]$NoReload,
    [switch]$UpdateDeps
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$venvDir = Join-Path $backendDir ".venv"
$backendEnvFile = Join-Path $backendDir ".env"
$requirementsFile = Join-Path $backendDir "requirements.txt"
$backendHost = "0.0.0.0"
$backendPort = "8000"

if (Test-Path $backendEnvFile) {
    $hostLine = Get-Content $backendEnvFile | Where-Object { $_ -match '^\s*BACKEND_HOST\s*=' } | Select-Object -Last 1
    $portLine = Get-Content $backendEnvFile | Where-Object { $_ -match '^\s*BACKEND_PORT\s*=' } | Select-Object -Last 1
    if ($hostLine) {
        $backendHost = (($hostLine -split '=', 2)[1]).Trim().Trim('"').Trim("'")
    }
    if ($portLine) {
        $backendPort = (($portLine -split '=', 2)[1]).Trim().Trim('"').Trim("'")
    }
}

$systemPython = "python"
if (Test-Path $venvPython) {
    $pythonCommand = $venvPython
} else {
    $pythonCommand = $systemPython
}

function Ensure-BackendVenv {
    if (Test-Path $venvPython) {
        return
    }

    Write-Host "Creating backend virtualenv at $venvDir" -ForegroundColor DarkCyan
    Push-Location $backendDir
    try {
        & $systemPython -m venv ".venv"
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $venvPython)) {
        throw "Failed to create backend virtualenv. Ensure Python is installed and available on PATH."
    }

    $script:pythonCommand = $venvPython
}

function Ensure-BackendDeps {
    if (-not (Test-Path $requirementsFile)) {
        return
    }

    $installArgs = @("-m", "pip", "install", "-r", $requirementsFile)
    if ($UpdateDeps) {
        $installArgs += "--upgrade"
    }

    Write-Host "Ensuring backend dependencies (UpdateDeps=$UpdateDeps)..." -ForegroundColor DarkCyan
    Push-Location $backendDir
    try {
        & $pythonCommand @installArgs
    } finally {
        Pop-Location
    }
}

Ensure-BackendVenv
Ensure-BackendDeps

$arguments = @(
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    $backendHost,
    "--port",
    $backendPort
)

if (-not $NoReload) {
    $arguments += "--reload"
}

Write-Host "Starting backend from $backendDir" -ForegroundColor Cyan
Write-Host "Using Python: $pythonCommand" -ForegroundColor DarkCyan
Write-Host "Binding API to http://$backendHost`:$backendPort" -ForegroundColor DarkCyan

Push-Location $backendDir
try {
    & $pythonCommand @arguments
} finally {
    Pop-Location
}
