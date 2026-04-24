param(
    [string]$ApiBaseUrl = "",
    [switch]$NoStart,
    [switch]$UpdateDeps,
    [switch]$UseDevClient,
    [switch]$UseExpoGo,
    [switch]$UsbDebugging,
    [ValidateSet("lan", "tunnel", "localhost")]
    [string]$ExpoHost = "lan"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $repoRoot "frontend"
$backendEnvFile = Join-Path $repoRoot "backend\.env"
$frontendEnvLocalFile = Join-Path $frontendDir ".env.local"
$frontendPackageLock = Join-Path $frontendDir "package-lock.json"
$frontendPackageJson = Join-Path $frontendDir "package.json"
$frontendNodeModules = Join-Path $frontendDir "node_modules"
$frontendDepsStamp = Join-Path $frontendNodeModules ".gramwin-install-stamp"
$apiCandidates = @()
$publicFrontendEnv = @{}
$backendPort = "8000"
$metroPort = "8081"

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

function Invoke-AdbReverseIfAvailable {
    param(
        [string[]]$Ports
    )

    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    if (-not $adbCommand) {
        Write-Host "USB debugging requested, but adb was not found on PATH. Skipping adb reverse." -ForegroundColor Yellow
        return
    }

    $deviceRows = & $adbCommand.Source devices 2>$null | Select-Object -Skip 1 | Where-Object { $_.Trim() }
    $connectedDevices = @($deviceRows | Where-Object { $_ -match "\sdevice$" })
    if ($connectedDevices.Count -eq 0) {
        Write-Host "USB debugging requested, but no authorized Android device was detected. Skipping adb reverse." -ForegroundColor Yellow
        return
    }

    foreach ($port in $Ports) {
        Write-Host "Running adb reverse for tcp:$port" -ForegroundColor DarkCyan
        & $adbCommand.Source reverse "tcp:$port" "tcp:$port" | Out-Null
    }
}

if (Test-Path $backendEnvFile) {
    $backendEnvLines = Get-Content $backendEnvFile
    $publicBaseUrlLine = $backendEnvLines | Where-Object { $_ -match '^\s*BACKEND_PUBLIC_BASE_URL\s*=' } | Select-Object -Last 1
    $portLine = $backendEnvLines | Where-Object { $_ -match '^\s*BACKEND_PORT\s*=' } | Select-Object -Last 1
    $candidateLine = $backendEnvLines | Where-Object { $_ -match '^\s*EXPO_PUBLIC_API_CANDIDATES\s*=' } | Select-Object -Last 1
    $apiLine = $backendEnvLines | Where-Object { $_ -match '^\s*EXPO_PUBLIC_API_BASE_URL\s*=' } | Select-Object -Last 1
    foreach ($line in $backendEnvLines) {
        if ($line -match '^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$') {
            $key = $matches[1]
            $value = $matches[2].Trim().Trim('"').Trim("'")
            $publicFrontendEnv[$key] = $value
            continue
        }
        if ($line -match '^\s*(FIREBASE_[A-Z0-9_]+)\s*=\s*(.*)$') {
            $key = "EXPO_PUBLIC_$($matches[1])"
            $value = $matches[2].Trim().Trim('"').Trim("'")
            $publicFrontendEnv[$key] = $value
        }
    }
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

foreach ($entry in $publicFrontendEnv.GetEnumerator()) {
    if ($entry.Key -eq "EXPO_PUBLIC_API_BASE_URL" -or $entry.Key -eq "EXPO_PUBLIC_API_CANDIDATES") {
        continue
    }
    Set-Item -Path "env:$($entry.Key)" -Value $entry.Value
}

$envKeys = @($publicFrontendEnv.Keys) + @("EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_API_CANDIDATES")
$envFileContents = @()
foreach ($key in ($envKeys | Select-Object -Unique | Sort-Object)) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($null -ne $value -and $value -ne "") {
        $envFileContents += "$key=$value"
    }
}
Set-Content -Path $frontendEnvLocalFile -Value $envFileContents
Write-Host "Wrote generated frontend env to $frontendEnvLocalFile" -ForegroundColor DarkCyan

Write-Host "Starting frontend from $frontendDir" -ForegroundColor Cyan

function Ensure-FrontendDeps {
    if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
        return
    }

    $signatureFile = if (Test-Path $frontendPackageLock) { $frontendPackageLock } else { $frontendPackageJson }
    $dependencySignature = if (Test-Path $signatureFile) { (Get-FileHash -Path $signatureFile -Algorithm SHA256).Hash } else { "" }

    if (-not $UpdateDeps -and (Test-Path $frontendNodeModules)) {
        if (-not (Test-Path $frontendDepsStamp) -and $dependencySignature) {
            Set-Content -Path $frontendDepsStamp -Value $dependencySignature
            Write-Host "Frontend dependencies detected. Skipping reinstall. Use -UpdateDeps to refresh." -ForegroundColor DarkCyan
            return
        }

        if (Test-Path $frontendDepsStamp) {
            $installedSignature = [string](Get-Content $frontendDepsStamp -ErrorAction SilentlyContinue | Select-Object -First 1)
            $installedSignature = $installedSignature.Trim()
            if ($installedSignature -and $installedSignature -eq $dependencySignature) {
                Write-Host "Frontend dependencies already installed. Skipping reinstall. Use -UpdateDeps to refresh." -ForegroundColor DarkCyan
                return
            }
        }
    }

    if ($UpdateDeps) {
        Write-Host "Refreshing frontend dependencies..." -ForegroundColor DarkCyan
    } else {
        Write-Host "Installing frontend dependencies..." -ForegroundColor DarkCyan
    }
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

        if ((Test-Path $frontendNodeModules) -and $dependencySignature) {
            Set-Content -Path $frontendDepsStamp -Value $dependencySignature
        }
    } finally {
        Pop-Location
    }
}

Ensure-FrontendDeps

if (-not $NoStart) {
    if ($UsbDebugging) {
        Invoke-AdbReverseIfAvailable -Ports @($metroPort, $backendPort)
    }

    $expoArgs = @("start", "--clear")
    switch ($ExpoHost) {
        "tunnel" {
            $expoArgs += "--tunnel"
        }
        "localhost" {
            $expoArgs += "--localhost"
        }
        default {
            $expoArgs += "--lan"
        }
    }

    $launchDevClient = $UseDevClient
    $launchExpoGo = -not $launchDevClient

    Remove-Item Env:EXPO_USE_DEV_CLIENT -ErrorAction SilentlyContinue

    if ($launchDevClient) {
        $expoArgs += "--dev-client"
        $env:EXPO_USE_DEV_CLIENT = "1"
    } elseif ($UseExpoGo -or $launchExpoGo) {
        $expoArgs += "--go"
    }

    Push-Location $frontendDir
    try {
        Write-Host "Starting Expo with host mode '$ExpoHost'" -ForegroundColor DarkCyan
        if ($launchDevClient) {
            Write-Host "Launching in Expo dev client mode." -ForegroundColor DarkCyan
        } else {
            Write-Host "Launching for Expo Go." -ForegroundColor DarkCyan
        }
        npx expo @expoArgs
    } finally {
        Pop-Location
    }
}
