'use strict';
const path=require('node:path'),{execFile}=require('node:child_process');
function focusStream(adapter,{execute=execFile,platform=process.platform}={}){
 const child=adapter.child;if(platform!=='win32'||!child?.pid||child.killed)return Promise.resolve(false);
 if(!Number.isSafeInteger(child.pid)||child.pid<=0)return Promise.resolve(false);
 const script=`$ErrorActionPreference='Stop';$p=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue;if(!$p -or $p.Path -ne '${adapter.exe.replaceAll("'","''")}'){throw 'Stream ended'};Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class OrbitStreamFocus {
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct Rect{public int left,top,right,bottom;}
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 delegate bool Visitor(IntPtr h,IntPtr arg);
 [DllImport("user32.dll")] static extern bool EnumWindows(Visitor visit,IntPtr arg);
 public static bool Focus(uint pid) {
  IntPtr target=IntPtr.Zero;long area=0;EnumWindows((h,a)=>{uint windowPid;GetWindowThreadProcessId(h,out windowPid);Rect r;if(windowPid==pid&&IsWindowVisible(h)&&GetWindowRect(h,out r)){long size=(long)(r.right-r.left)*(r.bottom-r.top);if(size>area){target=h;area=size;}}return true;},IntPtr.Zero);
  if(target==IntPtr.Zero)return false;uint current=GetCurrentThreadId(),owner;uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out owner);bool attached=foreground!=0&&foreground!=current&&AttachThreadInput(current,foreground,true);
  uint targetThread=GetWindowThreadProcessId(target,out owner);bool targetAttached=targetThread!=current&&targetThread!=foreground&&AttachThreadInput(current,targetThread,true);try{ShowWindow(target,9);BringWindowToTop(target);SetForegroundWindow(target);SetFocus(target);System.Threading.Thread.Sleep(100);GetWindowThreadProcessId(GetForegroundWindow(),out owner);return owner==pid;}finally{if(targetAttached)AttachThreadInput(current,targetThread,false);if(attached)AttachThreadInput(current,foreground,false);}
 }
}
'@;[OrbitStreamFocus]::Focus([uint32]$p.Id)|ConvertTo-Json`;

 return new Promise(resolve=>execute(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,maxBuffer:16384},(e,out)=>resolve(!e&&out.trim()==='true')));
}
module.exports={focusStream};
