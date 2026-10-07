$ErrorActionPreference='Stop'
$ws=New-Object -ComObject WScript.Shell
$shortcut=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Orbit Legion Go.lnk'
if(Test-Path -LiteralPath $shortcut){throw 'An Orbit Legion Go shortcut already exists. It was not replaced.'}
$s=$ws.CreateShortcut($shortcut)
$s.TargetPath=Join-Path $PSScriptRoot 'runtime\Orbit.exe'
$s.WorkingDirectory=$PSScriptRoot
$s.Description='Orbit handheld launcher'
$s.IconLocation=Join-Path $PSScriptRoot 'runtime\Orbit.exe'
$s.Save()
Write-Output 'Created Orbit Legion Go desktop shortcut. No startup entry was added.'
