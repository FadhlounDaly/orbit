$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'runtime\Orbit.exe'))) {
    & (Join-Path $root 'Setup Orbit.ps1')
}
$cache = Join-Path $root '.cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$file = Join-Path $cache 'sunshine.zip'
if (-not (Test-Path -LiteralPath $file)) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/LizardByte/Sunshine/releases/download/v2026.914.233613/Sunshine-Windows-AMD64-lite.zip' -OutFile $file
}
$actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
if ($actual -ne '233008e46f4c0e501a586cbfd6c4fd4a4c0d414a0b5fc7f13c070eb92ec3824b') {
    throw 'Sunshine checksum mismatch. Remove the downloaded archive and retry.'
}
$backend = Join-Path $root 'backend'
Expand-Archive -LiteralPath $file -DestinationPath $backend -Force
if (-not (Test-Path (Join-Path $backend 'Sunshine\sunshine.exe'))) { throw 'Sunshine executable is missing.' }
Write-Host 'Orbit Host is ready to open. Run Start Orbit Host.cmd.'
Write-Host 'No firewall rules, drivers, startup services, or existing hosts were changed.'
