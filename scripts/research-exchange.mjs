import {digest} from '../exchange/crypto.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import config from '../exchange/config.json' with {type:'json'};
if(config.paused){console.log('Private exchange paused pending owner confirmation.');process.exit(0)}
const tokenUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);tokenUrl.searchParams.set('audience',config.site+'/research-exchange');
const identity=await fetch(tokenUrl,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(15000)});if(!identity.ok)throw Error('無法建立工作身分');const {value:token}=await identity.json();
async function call(path,body){const r=await fetch(config.site+'/api/exchange/'+path,{method:'POST',headers:{Origin:config.site,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body||{}),redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok){const error=await r.json().catch(()=>({}));throw Error('Exchange '+path+' HTTP '+r.status+' '+String(error.error||'').slice(0,180))}const box=await r.json();if(box.version!==1||!box.ciphertext)throw Error('未取得加密交換資料');return box}
async function retryCall(path,body){for(let i=0;i<6;i++){try{return await call(path,body)}catch(e){if(i===5)throw e;console.log(e.message);await new Promise(r=>setTimeout(r,6000))}}}
async function cached(name){try{const r=await fetch('https://raw.githubusercontent.com/'+config.repository+'/'+config.snapshotBranch+'/'+name+'?run='+process.env.GITHUB_RUN_ID,{signal:AbortSignal.timeout(15000)});return r.ok?await r.json():null}catch{return null}}
const oldSnapshot=await cached('snapshot.json'),oldReceipt=await cached('receipt.json');let receipt;
let snapshot;for(let i=0;i<6;i++){try{snapshot=await call('snapshot');if(snapshot.protocolVersion!==2)throw Error('Waiting for current exchange deployment');break}catch(e){if(i===5)throw e;if(i===0||i%6===0)console.log(e.message);await new Promise(r=>setTimeout(r,6000))}}if(!snapshot)throw Error('網站尚未部署交換服務');
try{const outbox=JSON.parse(await readFile('exchange/outbox.json','utf8')),outboxDigest=await digest(JSON.stringify(outbox));if(outboxDigest!==oldReceipt?.outboxDigest){receipt=await retryCall('results',outbox);receipt.outboxDigest=outboxDigest}}catch(e){if(e.code!=='ENOENT')throw e}
if(receipt)snapshot=await retryCall('snapshot');
await mkdir('/tmp/stockfolio-exchange',{recursive:true});await writeFile('/tmp/stockfolio-exchange/snapshot.json',JSON.stringify(snapshot));
if(receipt)await writeFile('/tmp/stockfolio-exchange/receipt.json',JSON.stringify(receipt));
if(snapshot.etag===oldSnapshot?.etag&&!receipt){console.log('No research inputs changed; no snapshot commit needed.');process.exit(0)}
// The branch contains ciphertext only, never watchlist identifiers, notes or reports.
execFileSync('git',['config','user.name','stockfolio-exchange']);execFileSync('git',['config','user.email','stockfolio-exchange@users.noreply.github.com']);
const remote=execFileSync('git',['ls-remote','--heads','origin',config.snapshotBranch],{encoding:'utf8'}).trim();
if(remote){execFileSync('git',['fetch','origin',config.snapshotBranch]);execFileSync('git',['checkout','-B',config.snapshotBranch,'FETCH_HEAD'])}else{execFileSync('git',['checkout','--orphan',config.snapshotBranch]);execFileSync('git',['rm','-rf','.'])}
for(const file of ['snapshot.json','receipt.json']){try{await writeFile(file,await readFile('/tmp/stockfolio-exchange/'+file))}catch(e){if(e.code!=='ENOENT')throw e}}
execFileSync('git',['add','snapshot.json']);try{execFileSync('git',['add','receipt.json'])}catch{}
execFileSync('git',['commit','-m','Update encrypted research exchange']);execFileSync('git',['push','origin',config.snapshotBranch]);console.log('Encrypted exchange completed. No personal data was logged.');
