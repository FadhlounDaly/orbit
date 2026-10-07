$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$cache=Join-Path $root '.cache'
New-Item -ItemType Directory -Force $cache | Out-Null
$file=Join-Path $cache 'ViGEmBus_1.22.0_x64_x86_arm64.exe'
if(-not(Test-Path $file)){Invoke-WebRequest 'https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe' -OutFile $file -UseBasicParsing}
if((Get-FileHash $file -Algorithm SHA256).Hash -ne '89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a'){throw 'Controller driver checksum mismatch'}
$signature=Get-AuthenticodeSignature $file
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Nefarius Software Solutions'){throw 'Controller driver signature is not valid'}
$process=Start-Process $file -Verb RunAs -ArgumentList @('/exenoui','/qn','/norestart') -Wait -PassThru
if($process.ExitCode -notin @(0,3010)){throw "Controller driver installation failed ($($process.ExitCode))"}
@{exitCode=$process.ExitCode;restartRequired=($process.ExitCode -eq 3010);devices=@(Get-PnpDevice -PresentOnly | Where-Object {$_.FriendlyName -match 'Virtual Gamepad Emulation Bus'} | Select-Object Status,FriendlyName)} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $cache 'controller-driver-install.json')
Write-Host 'Controller forwarding is installed. Restart Orbit Host before playing.'
