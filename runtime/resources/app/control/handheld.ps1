$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]class OrbitAudioDevices{}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface OrbitDevices{[PreserveSig]int Enum(int f,int m,out IntPtr d);[PreserveSig]int Default(int f,int r,out OrbitDevice d);}
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface OrbitDevice{[PreserveSig]int Activate(ref Guid id,int c,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)]out object v);}
[ComImport,Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface OrbitEndpoint{
 [PreserveSig]int Register(IntPtr c);[PreserveSig]int Unregister(IntPtr c);[PreserveSig]int Channels(out uint n);
 [PreserveSig]int SetDb(float v,ref Guid c);[PreserveSig]int SetScalar(float v,ref Guid c);[PreserveSig]int Db(out float v);[PreserveSig]int Scalar(out float v);
 [PreserveSig]int SetChannelDb(uint n,float v,ref Guid c);[PreserveSig]int SetChannelScalar(uint n,float v,ref Guid c);[PreserveSig]int ChannelDb(uint n,out float v);[PreserveSig]int ChannelScalar(uint n,out float v);
 [PreserveSig]int SetMute([MarshalAs(UnmanagedType.Bool)]bool m,ref Guid c);[PreserveSig]int GetMute([MarshalAs(UnmanagedType.Bool)]out bool m);
}
public static class OrbitHandheld{
 [StructLayout(LayoutKind.Sequential)]public struct Power{public byte ac,flags,percent,status;public uint seconds,full;}
 [DllImport("kernel32.dll")]public static extern bool GetSystemPowerStatus(out Power p);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct WifiInfo{public Guid id;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)]public string name;public int state;}
 [DllImport("wlanapi.dll")]static extern uint WlanOpenHandle(uint v,IntPtr r,out uint n,out IntPtr h);
 [DllImport("wlanapi.dll")]static extern uint WlanEnumInterfaces(IntPtr h,IntPtr r,out IntPtr p);
 [DllImport("wlanapi.dll")]static extern uint WlanCloseHandle(IntPtr h,IntPtr r);
 [DllImport("wlanapi.dll")]static extern void WlanFreeMemory(IntPtr p);
 public static string Wifi(){IntPtr h=IntPtr.Zero,p=IntPtr.Zero;uint n;try{if(WlanOpenHandle(2,IntPtr.Zero,out n,out h)!=0)return "{\"available\":false,\"reason\":\"Wi-Fi status unavailable\"}";if(WlanEnumInterfaces(h,IntPtr.Zero,out p)!=0)return "{\"available\":false,\"reason\":\"Wi-Fi status unavailable\"}";int count=Marshal.ReadInt32(p);if(count==0)return "{\"available\":false,\"reason\":\"No Wi-Fi adapter\"}";bool connecting=false;for(int i=0;i<count;i++){WifiInfo info=(WifiInfo)Marshal.PtrToStructure(IntPtr.Add(p,8+i*Marshal.SizeOf(typeof(WifiInfo))),typeof(WifiInfo));if(info.state==1)return "{\"available\":true,\"connected\":true,\"status\":\"Connected\"}";if(info.state>=5)connecting=true;}return "{\"available\":true,\"connected\":false,\"status\":\""+(connecting?"Connecting":"Disconnected")+"\"}";}finally{if(p!=IntPtr.Zero)WlanFreeMemory(p);if(h!=IntPtr.Zero)WlanCloseHandle(h,IntPtr.Zero);}}
 public static string Audio(int level){OrbitDevices devices=(OrbitDevices)new OrbitAudioDevices();OrbitDevice d=null;object endpoint=null;try{Marshal.ThrowExceptionForHR(devices.Default(0,1,out d));Guid id=new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");Marshal.ThrowExceptionForHR(d.Activate(ref id,23,IntPtr.Zero,out endpoint));OrbitEndpoint e=(OrbitEndpoint)endpoint;Guid context=Guid.Empty;if(level>=0){Marshal.ThrowExceptionForHR(e.SetScalar(level/100f,ref context));Marshal.ThrowExceptionForHR(e.SetMute(level==0,ref context));}float v;bool m;Marshal.ThrowExceptionForHR(e.Scalar(out v));Marshal.ThrowExceptionForHR(e.GetMute(out m));return "{\"available\":true,\"percent\":"+Math.Round(v*100)+",\"muted\":"+(m?"true":"false")+"}";}finally{if(endpoint!=null)Marshal.ReleaseComObject(endpoint);if(d!=null)Marshal.ReleaseComObject(d);Marshal.ReleaseComObject(devices);}}
}
'@
$power=New-Object OrbitHandheld+Power
$battery=@{available=$false;reason='Battery status unavailable'}
if([OrbitHandheld]::GetSystemPowerStatus([ref]$power) -and ($power.flags -band 128) -eq 128 -and $power.flags -ne 255){$battery=@{available=$false;reason='No battery detected'}}
if([OrbitHandheld]::GetSystemPowerStatus([ref]$power) -and $power.flags -ne 255 -and ($power.flags -band 128) -eq 0 -and $power.percent -le 100){$battery=@{available=$true;percent=[int]$power.percent;pluggedIn=($power.ac -eq 1)}}
try{$wifi=[OrbitHandheld]::Wifi()|ConvertFrom-Json}catch{$wifi=@{available=$false;reason='Wi-Fi status unavailable'}}
$brightness=@{available=$false;reason='Display brightness unavailable on this device'}
try{
 $panel=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop|Where-Object Active|Select-Object -First 1
 if($panel){
  if($OrbitAction -eq 'brightness'){$method=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods|Where-Object {$_.Active -and $_.InstanceName -eq $panel.InstanceName}|Select-Object -First 1;if(!$method){throw 'No controllable built-in display'};$result=Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{Timeout=[uint32]1;Brightness=[byte]$OrbitLevel};if($result.ReturnValue -ne 0){throw 'Display rejected brightness change'};$panel=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness|Where-Object {$_.InstanceName -eq $panel.InstanceName}|Select-Object -First 1}
  $brightness=@{available=$true;percent=[int]$panel.CurrentBrightness}
 }
}catch{if($OrbitAction -eq 'brightness'){throw 'Could not change this device brightness'}}
if($OrbitAction -eq 'brightness' -and !$brightness.available){throw 'Display brightness unavailable on this device'}
try{$level=-1;if($OrbitAction -eq 'volume'){$level=$OrbitLevel};$volume=[OrbitHandheld]::Audio($level)|ConvertFrom-Json}catch{if($OrbitAction -eq 'volume'){throw 'Could not change this device volume'};$volume=@{available=$false;reason='No usable audio device'}}
@{deviceName=$env:COMPUTERNAME;battery=$battery;wifi=$wifi;brightness=$brightness;volume=$volume;observedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json -Depth 4 -Compress
