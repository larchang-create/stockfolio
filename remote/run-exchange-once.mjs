import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import config from '../exchange/config.json' with {type:'json'};
import {unseal,seal,encode,digest} from '../exchange/crypto.mjs';
import {codexAnalyze} from './native-codex.mjs';
const dir=resolve('remote-state'),keys=JSON.parse(await readFile(join(dir,'exchange-keys.json'),'utf8')),statusFile=join(dir,'exchange-status.json'),reportsDir=join(dir,'exchange-reports');await mkdir(reportsDir,{recursive:true,mode:0o700});
const r=await fetch('https://raw.githubusercontent.com/'+config.repository+'/'+encodeURIComponent(process.env.STOCKFOLIO_SNAPSHOT_REF||config.snapshotBranch)+'/snapshot.json?run='+Date.now(),{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('尚未取得加密名單，HTTP '+r.status);
const snapshot=await unseal(await r.json(),keys.decryptPrivate,'snapshot');await writeFile(join(dir,'exchange-snapshot.json'),JSON.stringify(snapshot),{mode:0o600});
const status={pid:process.pid,startedAt:new Date().toISOString(),phase:'researching',current:null,total:snapshot.stocks.length,completed:[],failed:[],pendingDelivery:0,researched:0,deferred:[]};const results=[];
async function save(){await writeFile(statusFile,JSON.stringify(status),{mode:0o600})}
async function outbox(){if(!results.length&&process.env.STOCKFOLIO_AUTOMATIC!=='1')return;const payload=JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),reports:results,runner:{checkedAt:new Date().toISOString(),automatic:process.env.STOCKFOLIO_AUTOMATIC==='1',errors:status.failed.length}}),key=await crypto.subtle.importKey('jwk',keys.signPrivate,{name:'Ed25519'},false,['sign']),signature=encode(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(payload)));await writeFile('exchange/outbox.json.tmp',JSON.stringify(await seal({payload,signature},snapshot.serverPublic,'results'))+'\n');await rename('exchange/outbox.json.tmp','exchange/outbox.json')}
await save();
const researchLimit=process.env.STOCKFOLIO_AUTOMATIC==='1'?2:Infinity;
for(const stock of snapshot.stocks.slice().sort((a,b)=>Number(!!a.analysis)-Number(!!b.analysis))){
 if(process.env.STOCKFOLIO_ONLY_MISSING==='1'&&stock.analysis)continue;
 status.current=stock.market+':'+stock.symbol;await save();
 const filename=join(reportsDir,(stock.market==='台股'?'TW-':'US-')+stock.symbol+'.json'),noteDigest=await digest(stock.researchNote),fingerprint=await digest(JSON.stringify({filings:stock.publicData?.filings||[],note:stock.researchNote}));
 try{
  let cached;try{cached=JSON.parse(await readFile(filename,'utf8'))}catch{}
  let report;if(cached?.fingerprint===fingerprint)report=cached.report;else{
   if(status.researched>=researchLimit){status.deferred.push(stock.market+':'+stock.symbol);await save();continue}status.researched++;
   report=await codexAnalyze({market:stock.market,symbol:stock.symbol,evidence:stock.publicData||{market:stock.market,symbol:stock.symbol,filings:[]},researchNote:stock.researchNote},{dataDir:dir});
   report={...report,schemaVersion:1,generatedAt:new Date().toISOString(),method:'Omni 研究整理，公開來源查核，筆記作待驗證問題。'};await writeFile(filename,JSON.stringify({fingerprint,report}),{mode:0o600});
  }
  if(!stock.analysis?.generatedAt||report.generatedAt>stock.analysis.generatedAt)results.push({id:stock.id,market:stock.market,symbol:stock.symbol,noteDigest,report});status.pendingDelivery=results.length;status.completed.push(stock.market+':'+stock.symbol);await outbox();
 }catch(error){status.failed.push({key:stock.market+':'+stock.symbol,error:error.message})}
 await save();
}
status.current=null;status.phase=status.failed.length?'completed_with_errors':'ready_to_deliver';status.finishedAt=new Date().toISOString();await outbox();await save();console.log(JSON.stringify({total:status.total,completed:status.completed.length,failed:status.failed.length}));
