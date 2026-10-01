$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot

# Application processes always use the least-privileged project account.
if (-not $env:DB_USERNAME) { $env:DB_USERNAME = 'fileversion_user' }
if (-not $env:DB_PASSWORD) {
    $userPassword = [Environment]::GetEnvironmentVariable('DB_PASSWORD', 'User')
    if ($userPassword) { $env:DB_PASSWORD = $userPassword }
}
if (-not $env:DB_PASSWORD) {
    throw 'DB_PASSWORD is missing. Set it in your Windows user environment, then run run-all.bat again.'
}
$env:STORAGE_ROOT = Join-Path $projectRoot 'storage\versioned-files'

$maven = (Get-Command mvn.cmd -ErrorAction SilentlyContinue).Source
if (-not $maven) {
    $candidate = 'C:\ProgramData\chocolatey\lib\maven\apache-maven-3.9.16\bin\mvn.cmd'
    if (Test-Path $candidate) { $maven = $candidate }
}
if (-not $maven) { throw 'Maven was not found. Install Maven or add mvn.cmd to PATH.' }

$services = @(
    @{ Name = 'file-service'; Port = 8081 },
    @{ Name = 'storage-service'; Port = 8084 },
    @{ Name = 'activity-service'; Port = 8083 },
    @{ Name = 'version-service'; Port = 8082 },
    @{ Name = 'api-gateway'; Port = 8080 }
)

Write-Host 'Starting FileGuard. Each service opens in a visible PowerShell window.'
foreach ($service in $services) {
    $serviceDirectory = Join-Path $projectRoot "services\$($service.Name)"
    $command = "Set-Location -LiteralPath '$serviceDirectory'; & '$maven' spring-boot:run"
    $process = Start-Process -FilePath 'powershell.exe' -WorkingDirectory $serviceDirectory -ArgumentList @('-NoExit', '-NoProfile', '-Command', $command) -PassThru
    Write-Host "$($service.Name) launch window opened (PID $($process.Id), port $($service.Port))."
    Start-Sleep -Seconds 2
}

$python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
if ($python) {
    $frontend = Join-Path $projectRoot 'frontend'
    $frontendArgument = '"' + $frontend + '"'
    $process = Start-Process -FilePath $python -WorkingDirectory $projectRoot -ArgumentList @('-m', 'http.server', '5500', '--bind', '127.0.0.1', '--directory', $frontendArgument) -PassThru
    Write-Host "Frontend server started at http://127.0.0.1:5500/ (PID $($process.Id))."
} else {
    Write-Host 'Python was not found. Serve frontend/index.html with VS Code Live Server on port 5500.'
}

Write-Host 'Wait until each service window reports Started, then open http://127.0.0.1:5500/.'
