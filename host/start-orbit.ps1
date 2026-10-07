$ErrorActionPreference = 'Stop'
$url = 'http://127.0.0.1:38741/'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$ready = $false
try { $ready = (Invoke-RestMethod ($url + 'api/status') -TimeoutSec 2).reachable -eq $true } catch {}
if (-not $ready) {
    if (-not $node) { throw 'Install Node.js and reopen PowerShell to run the optional PC host preview.' }
    $server = Join-Path $PSScriptRoot 'server.cjs'
    Start-Process -FilePath $node -ArgumentList ('"' + $server + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
    for ($i=0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 250
        try { $ready = (Invoke-RestMethod ($url + 'api/status') -TimeoutSec 1).reachable -eq $true } catch {}
        if ($ready) { break }
    }
}
if (-not $ready) { throw 'Orbit could not start. Port 38741 may be in use.' }
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (Test-Path -LiteralPath $edge) { Start-Process -FilePath $edge -ArgumentList ('--app=' + $url) }
else { Start-Process $url }
