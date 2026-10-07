$ErrorActionPreference = 'Stop'
$server = Join-Path $PSScriptRoot 'server.cjs'
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($server) } | ForEach-Object { Stop-Process -Id $_.ProcessId }
Write-Output 'Orbit service stopped. Other Node processes were left untouched.'
