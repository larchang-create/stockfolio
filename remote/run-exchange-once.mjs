import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import config from '../exchange/config.json' with {type:'json'};
import {unseal,seal,encode,digest} from '../exchange/crypto.mjs';
import {codexAnalyze} from './native-codex.mjs';
import {reviewEvents} from './event-review.mjs';
import {researchReason,prioritizeResearch,EVENT_CHECK_INTERVAL_MS} from './research-policy.mjs';
const dir=resolve('remote-state'),keys=JSON.parse(await readFile(join(dir,'exchange-keys.json'),'utf8')),statusFile=join(dir,'exchange-status.json'),reportsDir=join(dir,'exchange-reports');await mkdir(reportsDir,{recursive:true,mode:0o700});
async function readJSON(file,fallback){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function saveJSON(file,data){await writeFile(file+'.tmp',JSON.stringify(data),{mode:0o600});await rename(file+'.tmp',file)}
const r=await fetch('https://raw.githubusercontent.com/'+config.repository+'/'+encodeURIComponent(process.env.STOCKFOLIO_SNAPSHOT_REF||config.snapshotBranch)+'/snapshot.json?run='+Date.now(),{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('尚未取得加密名單，HTTP '+r.status);
const snapshot=await unseal(await r.json(),keys.decryptPrivate,'snapshot');await saveJSON(join(dir,'exchange-snapshot.json'),snapshot);
const automatic=process.env.STOCKFOLIO_AUTOMATIC==='1',eventsFile=join(dir,'event-reviews.json'),failureFile=join(dir,'research-retries.json'),events=await readJSON(eventsFile,{}),failures=await readJSON(failureFile,{});
const status={pid:process.pid,startedAt:new Date().toISOString(),phase:'researching',current:null,total:snapshot.stocks.length,completed:[],failed:[],pendingDelivery:0,researched:0,deferred:[],newsChecked:[],newsError:null};const results=[],checks=[];
async function save(){await saveJSON(statusFile,status)}
async function outbox(){if(!results.length&&!automatic)return;const payload=JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),reports:results,runner:{checkedAt:new Date().toISOString(),automatic,errors:status.failed.length+(status.newsError?1:0),checks}}),key=await crypto.subtle.importKey('jwk',keys.signPrivate,{name:'Ed25519'},false,['sign']),signature=encode(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(payload)));await saveJSON('exchange/outbox.json',await seal({payload,signature},snapshot.serverPublic,'results'))}
await save();
if(automatic){
 const due=snapshot.stocks.filter(s=>Date.now()-Date.parse(events[s.market+':'+s.symbol]?.attemptedAt||0)>=EVENT_CHECK_INTERVAL_MS).sort((a,b)=>Date.parse(events[a.market+':'+a.symbol]?.attemptedAt||0)-Date.parse(events[b.market+':'+b.symbol]?.attemptedAt||0)).slice(0,5);
 if(due.length){status.current='重大事件查核';await save();const attemptedAt=new Date().toISOString();for(const s of due){const key=s.market+':'+s.symbol;events[key]={...events[key],attemptedAt}}
  try{for(const row of await reviewEvents(due,{dataDir:dir})){events[row.key]={...row,attemptedAt};status.newsChecked.push(row.key)}}catch(e){status.newsError=e.message;for(const s of due)events[s.market+':'+s.symbol].attemptedAt=new Date(Date.now()-EVENT_CHECK_INTERVAL_MS+2*3600000).toISOString()}
  await saveJSON(eventsFile,events);await save();
 }
}
const candidates=[];
for(const stock of snapshot.stocks){
 if(process.env.STOCKFOLIO_ONLY_MISSING==='1'&&stock.analysis)continue;
 const key=stock.market+':'+stock.symbol,filename=join(reportsDir,(stock.market==='台股'?'TW-':'US-')+stock.symbol+'.json'),cached=await readJSON(filename,null),fingerprint=await digest(JSON.stringify({filings:stock.publicData?.filings||[],note:stock.researchNote}));
 const material=(events[key]?.events||[]).filter(e=>e.date>=new Date(Date.now()-7*86400000).toISOString().slice(0,10));
 const eventDigest=material.length?await digest(JSON.stringify([...new Set(material.map(e=>e.url))].sort())):null;
 candidates.push({stock,key,filename,cached,fingerprint,eventDigest,reason:researchReason(stock,cached,fingerprint,eventDigest),events:material});
}
for(const item of candidates.sort(prioritizeResearch)){
 const {stock,key,filename,cached,fingerprint,eventDigest,reason}=item;status.current=key;await save();
 const check={id:stock.id,market:stock.market,symbol:stock.symbol,checkedAt:new Date().toISOString(),eventCheckedAt:events[key]?.checkedAt||null,state:reason?'pending':'current'};checks.push(check);
 try{
  let report=cached?.report;
  if(reason){
   if(status.researched>=(automatic?2:Infinity)||Date.parse(failures[key]?.retryAfter||0)>Date.now()){status.deferred.push(key);await save();continue}status.researched++;
   report=await codexAnalyze({market:stock.market,symbol:stock.symbol,evidence:{...(stock.publicData||{market:stock.market,symbol:stock.symbol,filings:[]}),materialEvents:item.events},researchNote:stock.researchNote},{dataDir:dir});
   report={...report,schemaVersion:1,generatedAt:new Date().toISOString(),method:'Omni 公開來源研究，含近期重大事件查核及七日定期複查；筆記作待驗證問題。'};await saveJSON(filename,{fingerprint,eventDigest,report});delete failures[key];await saveJSON(failureFile,failures);
  }
  if(report&&(!stock.analysis?.generatedAt||report.generatedAt>stock.analysis.generatedAt))results.push({id:stock.id,market:stock.market,symbol:stock.symbol,noteDigest:await digest(stock.researchNote),report});
  check.state='current';status.pendingDelivery=results.length;status.completed.push(key);await outbox();
 }catch(error){check.state='error';status.failed.push({key,error:error.message});failures[key]={retryAfter:new Date(Date.now()+2*3600000).toISOString()};await saveJSON(failureFile,failures)}
 await save();
}
status.current=null;status.phase=status.failed.length?'completed_with_errors':'ready_to_deliver';status.finishedAt=new Date().toISOString();await outbox();await save();console.log(JSON.stringify({total:status.total,completed:status.completed.length,failed:status.failed.length,researched:status.researched,deferred:status.deferred.length,newsChecked:status.newsChecked.length}));
