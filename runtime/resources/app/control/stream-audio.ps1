$ErrorActionPreference='Stop'
$target=Get-Process -Id $OrbitAudioPid -ErrorAction SilentlyContinue
if(!$target -or $target.Path -ne $OrbitAudioExe){throw 'The owned stream process is no longer active'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
 [PreserveSig]int Enum(int flow,int mask,out IntPtr devices);
 [PreserveSig]int Default(int flow,int role,out IDevice device);
}
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
 [PreserveSig]int Activate(ref Guid id,int context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object value);
}
[ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessions {
 [PreserveSig]int Control(IntPtr id,int flags,out IntPtr control);
 [PreserveSig]int Volume(IntPtr id,int flags,out IntPtr volume);
 [PreserveSig]int Enumerate(out ISessionList sessions);
}
[ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessionList {
 [PreserveSig]int Count(out int count);
 [PreserveSig]int Get(int index,out IControl control);
}
[ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IControl {
 [PreserveSig]int State(out int state);
 [PreserveSig]int Display(out IntPtr name);
 [PreserveSig]int SetDisplay(IntPtr name,IntPtr context);
 [PreserveSig]int Icon(out IntPtr name);
 [PreserveSig]int SetIcon(IntPtr name,IntPtr context);
 [PreserveSig]int Group(out Guid group);
 [PreserveSig]int SetGroup(IntPtr group,IntPtr context);
 [PreserveSig]int Register(IntPtr events);
 [PreserveSig]int Unregister(IntPtr events);
 [PreserveSig]int Identifier(out IntPtr name);
 [PreserveSig]int Instance(out IntPtr name);
 [PreserveSig]int Process(out uint pid);
}
[ComImport,Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IVolume {
 [PreserveSig]int Set(float level,ref Guid context);
 [PreserveSig]int Get(out float level);
 [PreserveSig]int Mute([MarshalAs(UnmanagedType.Bool)]bool mute,ref Guid context);
 [PreserveSig]int Muted([MarshalAs(UnmanagedType.Bool)]out bool mute);
}
public static class OrbitStreamAudio {
 public static string Apply(uint pid,int level) {
  IDevices devices=(IDevices)new DeviceEnumerator();IDevice device=null;object manager=null;ISessionList list=null;
  try {
   Marshal.ThrowExceptionForHR(devices.Default(0,1,out device));Guid iid=new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out manager));Marshal.ThrowExceptionForHR(((ISessions)manager).Enumerate(out list));int count;Marshal.ThrowExceptionForHR(list.Count(out count));
   for(int i=0;i<count;i++){IControl control=null;try {Marshal.ThrowExceptionForHR(list.Get(i,out control));uint owner;Marshal.ThrowExceptionForHR(control.Process(out owner));if(owner!=pid)continue;IVolume volume=(IVolume)control;Guid context=Guid.Empty;if(level>=0){Marshal.ThrowExceptionForHR(volume.Set(level/100f,ref context));Marshal.ThrowExceptionForHR(volume.Mute(level==0,ref context));}float value;bool muted;Marshal.ThrowExceptionForHR(volume.Get(out value));Marshal.ThrowExceptionForHR(volume.Muted(out muted));return "{\"available\":true,\"percent\":"+Math.Round(value*100)+",\"muted\":"+(muted?"true":"false")+"}";}finally{if(control!=null)Marshal.ReleaseComObject(control);}}
   return "{\"available\":false,\"reason\":\"Stream audio is not ready on this device\"}";
  }finally{if(list!=null)Marshal.ReleaseComObject(list);if(manager!=null)Marshal.ReleaseComObject(manager);if(device!=null)Marshal.ReleaseComObject(device);Marshal.ReleaseComObject(devices);}
 }
}
'@
[OrbitStreamAudio]::Apply([uint32]$OrbitAudioPid,[int]$OrbitAudioLevel)
