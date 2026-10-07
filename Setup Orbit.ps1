$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cache = Join-Path $root '.cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
function Get-VerifiedArchive($Name, $Url, $Sha256) {
    $file = Join-Path $cache $Name
    if (-not (Test-Path -LiteralPath $file)) {
        Invoke-WebRequest -Uri $Url -OutFile $file -UseBasicParsing
    }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    if ($actual -ne $Sha256) { throw "Checksum mismatch for $Name. Remove that archive and retry." }
    return $file
}
$electron = Get-VerifiedArchive 'electron.zip' 'https://github.com/electron/electron/releases/download/v44.5.1/electron-v44.5.1-win32-x64.zip' '9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db'
$moonlight = Get-VerifiedArchive 'moonlight.zip' 'https://github.com/moonlight-stream/moonlight-qt/releases/download/v6.2.0/MoonlightPortable-x64-6.2.0.zip' '6f91d268b41ed5ca8066d9d7578dc403b8db190991ff48f00b1700465f8f7ebf'
$runtime = Join-Path $root 'runtime'
$moonlightDir = Join-Path $root 'moonlight'
Expand-Archive -LiteralPath $electron -DestinationPath $runtime -Force
if (-not (Test-Path (Join-Path $runtime 'Orbit.exe'))) {
    Rename-Item -LiteralPath (Join-Path $runtime 'electron.exe') -NewName 'Orbit.exe'
}
if (-not (Test-Path (Join-Path $moonlightDir 'Moonlight.exe'))) {
    Expand-Archive -LiteralPath $moonlight -DestinationPath $moonlightDir -Force
}
if (-not (Test-Path (Join-Path $moonlightDir 'Moonlight.exe'))) { throw 'Moonlight executable is missing after extraction.' }
Write-Host 'Setup complete. Double-click Start Orbit.cmd, then configure and pair your gaming PC.'
