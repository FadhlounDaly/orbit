$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OrbitDisplay {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool EnumDisplaySettingsW(string name,int mode,IntPtr data);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int ChangeDisplaySettingsExW(string name,IntPtr data,IntPtr window,uint flags,IntPtr parameter);
 public static byte[] Read(int mode){var p=Marshal.AllocHGlobal(220);try{var b=new byte[220];BitConverter.GetBytes((short)220).CopyTo(b,68);Marshal.Copy(b,0,p,220);if(!EnumDisplaySettingsW(null,mode,p))return null;Marshal.Copy(p,b,0,220);return b;}finally{Marshal.FreeHGlobal(p);}}
 public static int Set(byte[] b,bool test){if(b.Length!=220)throw new Exception("Invalid display snapshot");var p=Marshal.AllocHGlobal(220);try{Marshal.Copy(b,0,p,220);return ChangeDisplaySettingsExW(null,p,IntPtr.Zero,test?2u:0u,IntPtr.Zero);}finally{Marshal.FreeHGlobal(p);}}
 public static byte[] Target(byte[] previous,int width,int height,int hz){var b=(byte[])previous.Clone();BitConverter.GetBytes(0x580000).CopyTo(b,72);BitConverter.GetBytes(width).CopyTo(b,172);BitConverter.GetBytes(height).CopyTo(b,176);BitConverter.GetBytes(hz).CopyTo(b,184);return b;}
}
'@
function Mode($b){@{width=[BitConverter]::ToInt32($b,172);height=[BitConverter]::ToInt32($b,176);hz=[BitConverter]::ToInt32($b,184)}}
if($orbitAction -eq 'snapshot'){
 $b=[OrbitDisplay]::Read(-1);if(-not $b){throw 'The primary display could not be read'}
 $modes=@();for($i=0;$i -lt 2000;$i++){$m=[OrbitDisplay]::Read($i);if(-not $m){break};$modes+=Mode $m}
 @{mode=(Mode $b);native=[Convert]::ToBase64String($b);modes=$modes}|ConvertTo-Json -Depth 4 -Compress
}elseif($orbitAction -eq 'apply'){
 $b=[OrbitDisplay]::Target([OrbitDisplay]::Read(-1),$orbitWidth,$orbitHeight,$orbitHz)
 $test=[OrbitDisplay]::Set($b,$true);if($test -ne 0){throw "Windows does not support this handheld display mode ($test)"}
 $code=[OrbitDisplay]::Set($b,$false);if($code -ne 0){throw "Windows could not fit the display ($code)"}
 @{applied=$true;mode=(Mode ([OrbitDisplay]::Read(-1)))}|ConvertTo-Json -Compress
}elseif($orbitAction -eq 'restore'){
 $code=[OrbitDisplay]::Set([Convert]::FromBase64String($orbitSnapshot),$false);if($code -ne 0){throw "Windows could not restore the display ($code)"}
 @{restored=$true;mode=(Mode ([OrbitDisplay]::Read(-1)))}|ConvertTo-Json -Compress
}else{throw 'Unsupported display operation'}
