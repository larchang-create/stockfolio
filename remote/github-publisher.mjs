import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import config from '../exchange/config.json' with {type:'json'};
export async function githubCredential({launch=spawn}={}){
 return new Promise(resolve=>{const p=launch('git',['credential','fill'],{env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',GPG_TTY:process.env.GPG_TTY||'/dev/null'},stdio:['pipe','pipe','pipe']});let output='';const timer=setTimeout(()=>p.kill(),10000);p.stdout.on('data',x=>{output+=x;if(output.length>32000)p.kill()});p.on('error',()=>{clearTimeout(timer);resolve(null)});p.on('close',code=>{clearTimeout(timer);const token=output.match(/^password=(.+)$/m)?.[1];resolve(code===0&&token?token:null)});p.stdin.end('protocol=https\nhost=github.com\n\n')});
}
export async function publishOutbox(token,{fetcher=fetch,file='exchange/outbox.json'}={}){
 const content=await readFile(file,'utf8'),box=JSON.parse(content);if(box.version!==1||box.purpose!=='results'||!box.ciphertext)throw Error('invalid_encrypted_outbox');
 const url='https://api.github.com/repos/'+config.repository+'/contents/exchange/outbox.json',headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
 const r=await fetcher(url+'?ref=main',{headers,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok&&r.status!==404)throw Error('github_read_http_'+r.status);const old=r.ok?await r.json():{};
 const response=await fetcher(url,{method:'PUT',headers,redirect:'error',signal:AbortSignal.timeout(25000),body:JSON.stringify({message:'Update owner-authorized encrypted research results',branch:'main',sha:old.sha,content:Buffer.from(content).toString('base64')})});if(!response.ok)throw Error('github_publish_http_'+response.status);const data=await response.json();return {commit:data.commit.sha};
}
export async function requestFreshSnapshot(token,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),attempts=60}={}){
 const base='https://api.github.com/repos/'+config.repository,headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
 async function call(path,options={}){const r=await fetcher(base+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('github_exchange_http_'+r.status);return r.status===204?null:r.json()}
 const started=Date.now(),runsPath='/actions/workflows/'+config.workflow+'/runs?event=workflow_dispatch&per_page=5',before=await call(runsPath),seen=new Set(before.workflow_runs.map(r=>r.id));
 await call('/actions/workflows/'+config.workflow+'/dispatches',{method:'POST',body:JSON.stringify({ref:'main'})});
 let run;
 for(let i=0;i<attempts;i++){
  if(!run){const list=await call(runsPath);run=list.workflow_runs.find(r=>!seen.has(r.id)&&Date.parse(r.created_at)>=started-5000)}
  else run=await call('/actions/runs/'+run.id);
  if(run?.status==='completed'){if(run.conclusion!=='success')throw Error('exchange_workflow_failed');const ref=await call('/git/ref/heads/'+config.snapshotBranch);return ref.object.sha}
  await pause(5000);
 }
 throw Error('exchange_workflow_timeout');
}
