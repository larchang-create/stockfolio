// Wait for the actual browser result instead of fast-forwarding fetch timeouts.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'stockfolio-ui-'));
const browser=spawn('google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--user-data-dir='+profile,'--remote-debugging-pipe'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let sequence=0,buffer='',logs='';const pending=new Map();
browser.stderr.on('data',s=>logs+=s);
function cdp(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser timeout: '+method))},10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0')})}
browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))!==-1){const part=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!part)continue;const data=JSON.parse(part),entry=pending.get(data.id);if(entry){pending.delete(data.id);data.error?entry.reject(Error(data.error.message)):entry.resolve(data.result)}}});
try{
 const target=await cdp('Target.createTarget',{url:process.argv[2]});
 const {sessionId}=await cdp('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 let report='';const deadline=Date.now()+25000;
 while(Date.now()<deadline){
  try{const result=await cdp('Runtime.evaluate',{expression:"document.getElementById('results')?.textContent",returnByValue:true},sessionId);report=result.result?.value||''}catch{}
  if(report.includes('ALL PASSED')||report.includes('\nFAIL '))break;
  await new Promise(r=>setTimeout(r,80));
 }
 console.log(report||logs.slice(-1500));if(!report.includes('ALL PASSED'))process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1}finally{for(const entry of pending.values())entry.reject(Error('Test finished'));pending.clear();browser.kill();await new Promise(r=>setTimeout(r,150));await rm(profile,{recursive:true,force:true});}
