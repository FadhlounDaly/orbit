'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WindowsDisplay,chooseMode}=require('../runtime/resources/app/control/windows-display.cjs');
test('handheld fitting selects a supported aspect ratio and never uses the ultrawide desktop',()=>{
 const modes=[{width:5120,height:1440,hz:144},{width:1920,height:1200,hz:60},{width:1920,height:1200,hz:120}];
 assert.deepEqual(chooseMode({resolution:'1920x1200',fps:120},modes),modes[2]);
 assert.deepEqual(chooseMode({resolution:'2560x1600',fps:60},[modes[1],{width:2560,height:1440,hz:60}]),modes[1]);
 assert.throws(()=>chooseMode({resolution:'1920x1200',fps:60},[modes[0]]),/no supported display mode/);
});
test('display changes require a durable restorable snapshot and restore that exact original mode',async()=>{
 const calls=[],original={native:'original-mode',mode:{width:5120,height:1440,hz:144},modes:[{width:1920,height:1200,hz:60}]};
 const display=new WindowsDisplay({run:async input=>{calls.push(input);return input.action==='snapshot'?original:{applied:true};}});
 await assert.rejects(display.prepare({resolution:'1920x1200',fps:60}),/Snapshot/);
 const saved=await display.snapshot();assert.equal(saved.changed,true);assert.equal(saved.policy,'handheld-fit');
 await display.prepare({resolution:'1920x1200',fps:60});await display.restore(saved);
 assert.deepEqual(calls,[{action:'snapshot'},{action:'apply',width:1920,height:1200,hz:60},{action:'restore',native:'original-mode'}]);
});
test('fresh display adapter restores a session journal after a host restart',async()=>{
 let input;const display=new WindowsDisplay({run:async value=>{input=value;}});
 await display.restore({policy:'handheld-fit',changed:true,native:'saved-before-crash'});assert.equal(input.native,'saved-before-crash');
 await assert.rejects(display.restore({changed:true,native:'bad',policy:'unknown'}),/Unsupported/);
});
