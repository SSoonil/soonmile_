param(
    [switch]$StopPostgresOnExit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootDir = $PSScriptRoot
$frontendDir = Join-Path $rootDir "frontend"
$backendDir = Join-Path $rootDir "backend"

$frontendPort = 5173
$backendPort = 8080
$postgresContainerName = "soonmile-postgres"

function Write-Step {
    param([string]$Message)
    Write-Host "[soonmile-dev] $Message"
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-ListeningPid {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $conn) {
        return $null
    }
    return [int]$conn.OwningProcess
}

function Wait-DockerReady {
    param([int]$TimeoutSeconds = 90)

    if (-not (Test-Command "docker")) {
        throw "docker command not found. Install Docker Desktop first."
    }

    try {
        docker info | Out-Null
        return
    }
    catch {
        $dockerDesktopExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
        if (Test-Path $dockerDesktopExe) {
            Write-Step "Launching Docker Desktop..."
            Start-Process -FilePath $dockerDesktopExe | Out-Null
        }
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            docker info | Out-Null
            return
        }
        catch {
            Start-Sleep -Seconds 3
        }
    }

    throw "Docker daemon is not ready. Open Docker Desktop and retry."
}

function Ensure-PostgresContainer {
    $running = docker ps --filter "name=^${postgresContainerName}$" --format "{{.Names}}"
    if (-not [string]::IsNullOrWhiteSpace($running)) {
        Write-Step "Postgres container (${postgresContainerName}) already running, reusing."
        return $false
    }

    $existing = docker ps -a --filter "name=^${postgresContainerName}$" --format "{{.Names}}"

    if ([string]::IsNullOrWhiteSpace($existing)) {
        Write-Step "Creating postgres container (${postgresContainerName})..."
        docker run -d `
            --name $postgresContainerName `
            -e POSTGRES_USER=postgres `
            -e POSTGRES_PASSWORD=1q2w3e4r `
            -e POSTGRES_DB=postgres `
            -p 5432:5432 `
            postgres:16 | Out-Null
        return $true
    }
    else {
        Write-Step "Starting postgres container (${postgresContainerName})..."
        docker start $postgresContainerName | Out-Null
        return $true
    }
}

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$OutLogPath,
        [string]$ErrLogPath
    )

    $argText = $Arguments -join " "
    Write-Step "Starting ${Name}: ${FilePath} ${argText}"
    $proc = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -PassThru `
        -RedirectStandardOutput $OutLogPath `
        -RedirectStandardError $ErrLogPath

    return [pscustomobject]@{
        Name = $Name
        Process = $proc
        OutLogPath = $OutLogPath
        ErrLogPath = $ErrLogPath
    }
}

$startedProcesses = @()
$postgresStartedByScript = $false

try {
    if (-not (Test-Command "mvn")) {
        throw "mvn command not found. Install Maven and ensure PATH is configured."
    }
    if (-not (Test-Command "npm")) {
        throw "npm command not found. Install Node.js and ensure PATH is configured."
    }

    Write-Step "Checking Docker daemon..."
    Wait-DockerReady
    $postgresStartedByScript = Ensure-PostgresContainer

    $frontendPid = Get-ListeningPid -Port $frontendPort
    if ($null -eq $frontendPid) {
        $frontendOut = Join-Path $frontendDir "dev-server.out.log"
        $frontendErr = Join-Path $frontendDir "dev-server.err.log"
        $startedProcesses += Start-ManagedProcess `
            -Name "frontend" `
            -FilePath "cmd.exe" `
            -Arguments @("/c", "npm run dev -- --host 0.0.0.0 --port 5173") `
            -WorkingDirectory $frontendDir `
            -OutLogPath $frontendOut `
            -ErrLogPath $frontendErr
    }
    else {
        Write-Step "Frontend already listening on ${frontendPort} (PID ${frontendPid}), reusing."
    }

    $backendPid = Get-ListeningPid -Port $backendPort
    if ($null -eq $backendPid) {
        $backendOut = Join-Path $backendDir "backend-server.out.log"
        $backendErr = Join-Path $backendDir "backend-server.err.log"
        $startedProcesses += Start-ManagedProcess `
            -Name "backend" `
            -FilePath "cmd.exe" `
            -Arguments @("/c", "mvn spring-boot:run") `
            -WorkingDirectory $backendDir `
            -OutLogPath $backendOut `
            -ErrLogPath $backendErr
    }
    else {
        Write-Step "Backend already listening on ${backendPort} (PID ${backendPid}), reusing."
    }

    Write-Step "Services are booting..."
    Write-Step "Frontend: http://localhost:5173"
    Write-Step "Backend:  http://localhost:8080"
    Write-Step "Postgres: localhost:5432 (${postgresContainerName})"
    Write-Step "Press Ctrl+C to stop processes started by this script."

    while ($true) {
        foreach ($managed in $startedProcesses) {
            if ($managed.Process.HasExited) {
                throw "$($managed.Name) exited (code $($managed.Process.ExitCode)). Check logs: $($managed.OutLogPath), $($managed.ErrLogPath)"
            }
        }
        Start-Sleep -Seconds 2
    }
}
finally {
    foreach ($managed in $startedProcesses) {
        if (-not $managed.Process.HasExited) {
            Write-Step "Stopping $($managed.Name) (PID $($managed.Process.Id))..."
            Stop-Process -Id $managed.Process.Id -Force -ErrorAction SilentlyContinue
        }
    }

    if ($StopPostgresOnExit -and $postgresStartedByScript) {
        Write-Step "Stopping postgres container (${postgresContainerName})..."
        docker stop $postgresContainerName | Out-Null
    }
}
