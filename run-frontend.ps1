param(
    [string]$ApiBaseUrl = "",
    [switch]$NoStart,
    [switch]$UpdateDeps
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $repoRoot "frontend"
$backendEnvFile = Join-Path $repoRoot "backend\.env"
$frontendEnvLocalFile = Join-Path $frontendDir ".env.local"
$frontendPackageLock = Join-Path $frontendDir "package-lock.json"
$apiCandidates = @()
$backendPort = "8000"

function Add-ApiCandidate {
    param([string]$Value)

    if (-not $Value) {
        return
    }

    $normalized = $Value.Trim().Trim('"').Trim("'")
    if (-not $normalized) {
        return
    }

    if ($normalized -notmatch '^https?://') {
        $normalized = "http://$normalized"
    }

    $normalized = $normalized.TrimEnd('/')
    if ($script:apiCandidates -notcontains $normalized) {
        $script:apiCandidates += $normalized
    }
}

if (Test-Path $backendEnvFile) {
    $publicBaseUrlLine = Get-Content $backendEnvFile | Where-Object { $_ -match '^\s*BACKEND_PUBLIC_BASE_URL\s*=' } | Select-Object -Last 1
    $portLine = Get-Content $backendEnvFile | Where-Object { $_ -match '^\s*BACKEND_PORT\s*=' } | Select-Object -Last 1
    $candidateLine = Get-Content $backendEnvFile | Where-Object { $_ -match '^\s*EXPO_PUBLIC_API_CANDIDATES\s*=' } | Select-Object -Last 1
    $apiLine = Get-Content $backendEnvFile | Where-Object { $_ -match '^\s*EXPO_PUBLIC_API_BASE_URL\s*=' } | Select-Object -Last 1
    if ($portLine) {
        $backendPort = (($portLine -split '=', 2)[1]).Trim().Trim('"').Trim("'")
    }
    if (-not $ApiBaseUrl -and $publicBaseUrlLine) {
        $ApiBaseUrl = (($publicBaseUrlLine -split '=', 2)[1]).Trim().Trim('"').Trim("'")
    }
    if (-not $ApiBaseUrl -and $apiLine) {
        $ApiBaseUrl = (($apiLine -split '=', 2)[1]).Trim().Trim('"').Trim("'")
    }
    if ($candidateLine) {
        (($candidateLine -split '=', 2)[1] -split '[,\n]') | ForEach-Object { Add-ApiCandidate $_ }
    }
}

Add-ApiCandidate $ApiBaseUrl

$ipconfigOutput = ipconfig
$ipv4Matches = [regex]::Matches($ipconfigOutput, 'IPv4 Address[^\:]*:\s*(\d+\.\d+\.\d+\.\d+)')
foreach ($match in $ipv4Matches) {
    $ip = $match.Groups[1].Value
    if ($ip -notmatch '^127\.' -and $ip -notmatch '^169\.254\.' -and $ip -notmatch '^192\.168\.91\.' -and $ip -notmatch '^192\.168\.236\.') {
        Add-ApiCandidate "$ip`:$backendPort"
    }
}

Add-ApiCandidate "10.0.2.2:$backendPort"
Add-ApiCandidate "127.0.0.1:$backendPort"
Add-ApiCandidate "localhost:$backendPort"

if (-not $ApiBaseUrl -and $apiCandidates.Count -gt 0) {
    $ApiBaseUrl = $apiCandidates[0]
}

if ($ApiBaseUrl) {
    $env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl
    Write-Host "Using EXPO_PUBLIC_API_BASE_URL=$ApiBaseUrl" -ForegroundColor DarkCyan
}

if ($apiCandidates.Count -gt 0) {
    $env:EXPO_PUBLIC_API_CANDIDATES = ($apiCandidates -join ",")
    Write-Host "Using EXPO_PUBLIC_API_CANDIDATES=$($env:EXPO_PUBLIC_API_CANDIDATES)" -ForegroundColor DarkCyan
}

$envFileContents = @(
    "EXPO_PUBLIC_API_BASE_URL=$($env:EXPO_PUBLIC_API_BASE_URL)"
    "EXPO_PUBLIC_API_CANDIDATES=$($env:EXPO_PUBLIC_API_CANDIDATES)"
)
Set-Content -Path $frontendEnvLocalFile -Value $envFileContents
Write-Host "Wrote generated frontend env to $frontendEnvLocalFile" -ForegroundColor DarkCyan

Write-Host "Starting frontend from $frontendDir" -ForegroundColor Cyan

function Ensure-FrontendDeps {
    if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
        return
    }

    Write-Host "Ensuring frontend dependencies (UpdateDeps=$UpdateDeps)..." -ForegroundColor DarkCyan
    Push-Location $frontendDir
    try {
        if (Test-Path $frontendPackageLock) {
            npm ci
        } else {
            npm install
        }

        if ($UpdateDeps) {
            npm update
        }
    } finally {
        Pop-Location
    }
}

Ensure-FrontendDeps

if (-not $NoStart) {
    Push-Location $frontendDir
    try {
        npx expo start --clear --lan
    } finally {
        Pop-Location
    }
}
