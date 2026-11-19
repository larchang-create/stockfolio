import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {githubCredential,publishOutbox,requestFreshSnapshot} from './github-publisher.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),stateFile=resolve(root,'remote-state/exchange-daemon.json');await mkdir(resolve(root,'remote-state'),{recursive:true,mode:0o700});
let busy=false;const state={pid:process.pid,intervalSeconds:900,phase:'starting',lastCheck:null,lastPublished:null};
async function save(){await writeFile(stateFile,JSON.stringify(state),{mode:0o600})}
async function cycle(){if(busy)return;busy=true;state.lastCheck=new Date().toISOString();delete state.error;try{
 let batch;try{batch=JSON.parse(await readFile(resolve(root,'remote-state/exchange-status.json')))}catch{}
 if(batch?.phase==='researching'){try{process.kill(batch.pid,0);state.phase='waiting_for_current_batch';await save();return}catch{}}
 const credential=await githubCredential();if(!credential){state.phase='github_login_required';await save();return}
 state.phase='refreshing_watchlist';await save();const snapshotRef=await requestFreshSnapshot(credential);state.phase='researching';await save();await new Promise((ok,no)=>{const p=spawn(process.execPath,['remote/run-exchange-once.mjs'],{cwd:root,env:{...process.env,STOCKFOLIO_AUTOMATIC:'1',STOCKFOLIO_ONLY_MISSING:'0',STOCKFOLIO_SNAPSHOT_REF:snapshotRef},stdio:'ignore'});p.on('error',()=>no(Error('research_start_failed')));p.on('close',code=>code===0?ok():no(Error('research_cycle_failed')))});
 const result=JSON.parse(await readFile(resolve(root,'remote-state/exchange-status.json')));if(result.pendingDelivery||Date.now()-Date.parse(state.lastPublished?.at||0)>600000){state.phase='publishing';await save();const published=await publishOutbox(credential,{file:resolve(root,'exchange/outbox.json')});state.lastPublished={at:new Date().toISOString(),commit:published.commit};state.phase='awaiting_cloud_receipt';await save();await requestFreshSnapshot(credential);state.phase='published_and_exchanged'}else state.phase=result.failed?.length?'research_incomplete':'no_changes';
 }catch(e){state.phase='error';state.error=String(e.message).replace(/[^a-zA-Z0-9_ -]/g,'').slice(0,100)}finally{busy=false;await save()}}
await cycle();setInterval(()=>cycle(),900000);
