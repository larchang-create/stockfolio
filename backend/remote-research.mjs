import {exchangeStatus} from './exchange.mjs';
// A remote worker may read public evidence for watched tickers and replace only analysis.
// The owner authorizes only the selected company's research note as additional context.
// General watchlist notes, legacy worksheet sections and the website password remain private.
import {initializePublicDB,publicBatchStart,publicStocks,publicMacro} from './public-data.mjs';
import {ServiceError,validateInput,validateReport} from './research.mjs';
const enc=new TextEncoder(),ready=new WeakMap();
const tables=[
 'CREATE TABLE IF NOT EXISTS remote_devices(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,label TEXT NOT NULL,created_at TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked_at TEXT,last_seen TEXT)',
 'CREATE TABLE IF NOT EXISTS remote_jobs(stock_key TEXT PRIMARY KEY,id TEXT UNIQUE NOT NULL,device_id TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL,started_at TEXT NOT NULL,lease_until INTEGER NOT NULL,error TEXT)',
 'CREATE TABLE IF NOT EXISTS remote_reports(stock_key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,completed_at TEXT NOT NULL,job_id TEXT NOT NULL)'
];
async function init(db){await initializePublicDB(db);if(!ready.has(db)){const p=db.batch(tables.map(s=>db.prepare(s).bind()));ready.set(db,p);p.catch(()=>ready.delete(db))}await ready.get(db)}
const query=async(db,s,...args)=>(await db.prepare(s).bind(...args).run()).results;
export const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const seconds=now=>Math.floor(now.getTime()/1000);
const invalid=(message,status=400)=>{throw new ServiceError(message,status)};
async function json(request,max=400000){const text=await request.text();if(enc.encode(text).length>max)invalid('請求過大。',413);try{return JSON.parse(text)}catch{invalid('資料格式不正確。')}}
async function tokenHash(request){const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];if(!token)invalid('遠端授權無效。',401);return hash(token)}
async function device(request,env,now){const digest=await tokenHash(request);const [d]=await query(env.DB,'SELECT * FROM remote_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',digest,seconds(now));if(!d)invalid('遠端授權已過期或撤銷。',401);await query(env.DB,'UPDATE remote_devices SET last_seen=? WHERE id=?',now.toISOString(),d.id);return d}
async function evidence(env,now){
 const records=(await publicStocks(env)).stocks,macro=await publicMacro(env),start=publicBatchStart(now);
 const notes=await query(env.DB,"SELECT stock_key,json_extract(data_json,'$.research.thesis') AS note FROM sync_stocks WHERE owner_id='personal' AND json_extract(data_json,'$.watch')=1");
 const pendingSources=macro.sync.sources.filter(s=>!s.last_attempt||s.last_attempt<start).length;
 const pendingStocks=records.filter(s=>!s.checkedAt||s.checkedAt<start).length;
 const complete=pendingSources===0&&pendingStocks===0;
 const candidates=[];
 for(const item of records){if(!item.data||!['ok','partial'].includes(item.state))continue;
  // Prices and retrieval timestamps alone do not force a full financial re-analysis.
  const note=notes.find(n=>n.stock_key===item.key)?.note,researchNote=typeof note==='string'?note.slice(0,5000):'';
  const input={key:item.key,companyName:item.data.companyName,filings:item.data.filings||[],researchNote};
  candidates.push({...input,publicData:item.data,fingerprint:await hash(JSON.stringify(input))});
 }
 return {batchStart:start,complete,pendingSources,pendingStocks,candidates,macro};
}
export async function remoteStatus(env,now=new Date()){
 await init(env.DB);
 const devices=await query(env.DB,'SELECT id,label,created_at,expires_at,revoked_at,last_seen FROM remote_devices ORDER BY created_at DESC'),jobs=await query(env.DB,'SELECT stock_key,state,started_at,error FROM remote_jobs ORDER BY started_at DESC LIMIT 30'),reports=await query(env.DB,'SELECT stock_key,fingerprint,completed_at FROM remote_reports ORDER BY completed_at DESC');
 const current=await evidence(env,now),watched=await query(env.DB,"SELECT stock_key,json_extract(data_json,'$.analysis.generatedAt') AS generated_at FROM sync_stocks WHERE owner_id='personal' AND json_extract(data_json,'$.watch')=1");
 const active=devices.filter(d=>!d.revoked_at&&d.expires_at>seconds(now));
 return {exchange:await exchangeStatus(env),devices,jobs,reports:reports.map(({fingerprint,...r})=>r).slice(0,30),pollMinutes:15,deviceAuthorized:active.length>0,deviceOnline:active.some(d=>d.last_seen&&Date.parse(d.last_seen)>=now.getTime()-30*60000),stocks:watched.map(s=>{const candidate=current.candidates.find(c=>c.key===s.stock_key),previous=reports.find(r=>r.stock_key===s.stock_key);return {key:s.stock_key,waitingForPublicData:!candidate,pending:!!candidate&&candidate.fingerprint!==previous?.fingerprint,hasReport:!!s.generated_at,job:jobs.find(j=>j.stock_key===s.stock_key)||null,lastCompleted:previous?.completed_at||s.generated_at||null}})};
}
// These routes establish a device connection or require a device bearer, not a browser session.
export async function remoteMachine(request,env,{now=new Date()}={}){
 const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/remote/'))return null;
 const machine=['/api/remote/work','/api/remote/claim','/api/remote/result','/api/remote/error'];
 if(!machine.includes(path))return null;await init(env.DB);
 const d=await device(request,env,now);
 if(path==='/api/remote/work'&&request.method==='GET'){
  const current=await evidence(env,now),prior=await query(env.DB,'SELECT stock_key,fingerprint FROM remote_reports'),jobs=await query(env.DB,'SELECT stock_key,fingerprint,state,started_at,lease_until FROM remote_jobs');
  const candidates=current.candidates.filter(s=>!prior.some(p=>p.stock_key===s.key&&p.fingerprint===s.fingerprint)&&!jobs.some(j=>j.stock_key===s.key&&(j.lease_until>seconds(now)||(j.state==='error'&&j.fingerprint===s.fingerprint&&j.started_at>=current.batchStart))));
  return {batchStart:current.batchStart,complete:current.complete,pendingSources:current.pendingSources,pendingStocks:current.pendingStocks,candidates:candidates.slice(0,2).map(({researchNote,...s})=>s),macro:{checkedAt:current.macro.checkedAt,indicators:current.macro.indicators,sources:current.macro.sources},deviceExpiresAt:new Date(d.expires_at*1000).toISOString()};
 }
 if(path==='/api/remote/claim'&&request.method==='POST'){
  const body=await json(request,2048),input=validateInput(body),key=input.market+':'+input.symbol,current=await evidence(env,now);
  const record=current.candidates.find(s=>s.key===key);if(!record||record.fingerprint!==body.fingerprint)invalid('這家公司資料尚未完成或筆記已變更，稍後重新檢查。',409);
  const [prior]=await query(env.DB,'SELECT fingerprint FROM remote_reports WHERE stock_key=?',key);if(prior?.fingerprint===record.fingerprint)return {cached:true};
  const id=crypto.randomUUID();const acquired=await query(env.DB,"INSERT INTO remote_jobs(stock_key,id,device_id,fingerprint,state,started_at,lease_until) VALUES (?,?,?,?,'running',?,?) ON CONFLICT(stock_key) DO UPDATE SET id=excluded.id,device_id=excluded.device_id,fingerprint=excluded.fingerprint,state='running',started_at=excluded.started_at,lease_until=excluded.lease_until,error=NULL WHERE remote_jobs.lease_until<=? AND (remote_jobs.state!='error' OR remote_jobs.fingerprint!=excluded.fingerprint OR remote_jobs.started_at<=?) RETURNING id",key,id,d.id,record.fingerprint,now.toISOString(),seconds(now)+1200,seconds(now),publicBatchStart(now));
  if(!acquired.length)return {busy:true};return {jobId:id,...input,evidence:record.publicData,researchNote:record.researchNote};
 }
 if(['/api/remote/result','/api/remote/error'].includes(path)&&request.method==='POST'){
  const body=await json(request),[job]=await query(env.DB,"SELECT * FROM remote_jobs WHERE id=? AND device_id=? AND state='running' AND lease_until>?",String(body.jobId||''),d.id,seconds(now));
  if(!job)invalid('研究工作已失效，未寫入結果。',409);
  if(path==='/api/remote/error'){await query(env.DB,"UPDATE remote_jobs SET state='error',error=?,lease_until=0 WHERE id=? AND device_id=?",String(body.error||'遠端研究未完成').slice(0,300),job.id,d.id);return {ok:true}}
  const [market,symbol]=job.stock_key.split(':'),report=body.report;
  if(report?.market!==market||report?.symbol!==symbol||!Array.isArray(report?.sources)||!report.sources.length||report.sources.length>40)invalid('研究身分或來源不正確。');
  const ids=new Set();const sources=report.sources.map(s=>{let u;try{u=new URL(s.url)}catch{invalid('研究來源網址不正確。')}if(u.protocol!=='https:'||u.username||u.password||typeof s.id!=='string'||ids.has(s.id)||typeof s.title!=='string'||s.title.length>300)invalid('研究來源格式不正確。');ids.add(s.id);return {id:s.id,title:s.title,url:u.href}});
  const checked=validateReport(report,sources),time=now.toISOString();
  const current=await evidence(env,now),candidate=current.candidates.find(s=>s.key===job.stock_key);if(candidate?.fingerprint!==job.fingerprint)invalid('公開資料或研究筆記已更新，未覆寫研究。',409);
  const final={...checked,market,symbol,sources,generatedAt:time,schemaVersion:1,method:'遠端模型依官方文件研究，並回應本公司筆記；筆記不是已確認的事實。'};
  const statements=[
   env.DB.prepare("UPDATE sync_stocks SET data_json=json_set(data_json,'$.analysis',json(?)) WHERE owner_id='personal' AND stock_key=? AND json_extract(data_json,'$.watch')=1 AND COALESCE(json_extract(data_json,'$.research.thesis'),'')=? AND COALESCE(json_extract(data_json,'$.analysis.generatedAt'),'')<=? AND EXISTS(SELECT 1 FROM remote_jobs WHERE id=? AND device_id=? AND state='running' AND lease_until>?) RETURNING stock_key").bind(JSON.stringify(final),job.stock_key,candidate.researchNote,job.started_at,job.id,d.id,seconds(now)),
   env.DB.prepare("INSERT INTO remote_reports(stock_key,fingerprint,completed_at,job_id) SELECT ?,?,?,? WHERE changes()>0 ON CONFLICT(stock_key) DO UPDATE SET fingerprint=excluded.fingerprint,completed_at=excluded.completed_at,job_id=excluded.job_id").bind(job.stock_key,job.fingerprint,time,job.id),
   env.DB.prepare("UPDATE sync_accounts SET revision=revision+1,mutation_id=?,updated_at=? WHERE owner_id='personal' AND EXISTS(SELECT 1 FROM remote_reports WHERE stock_key=? AND job_id=?)").bind(job.id,time,job.stock_key,job.id),
   env.DB.prepare("UPDATE remote_jobs SET state=CASE WHEN EXISTS(SELECT 1 FROM remote_reports WHERE stock_key=? AND job_id=?) THEN 'done' ELSE 'superseded' END,lease_until=0 WHERE id=? AND device_id=?").bind(job.stock_key,job.id,job.id,d.id)
  ];
  const result=await env.DB.batch(statements);if(!result[0].results.length)invalid('股票已刪除或已有較新的研究，未覆寫結果。',409);return {ok:true};
 }
 invalid('不支援此遠端操作。',405);
}
// Browser owner routes remain protected by the normal password session and Origin checks.
export async function remoteOwner(request,env,{now=new Date()}={}){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/remote/'))return null;await init(env.DB);
 if(url.pathname==='/api/remote/status'&&request.method==='GET')return remoteStatus(env,now);
 if(url.pathname==='/api/remote/pair/approve'&&request.method==='POST'){
  const body=await json(request,1024);if(!/^[a-f0-9]{64}$/.test(body.tokenHash||''))invalid('遠端識別碼無效。');
  const id=crypto.randomUUID();await query(env.DB,'INSERT INTO remote_devices(id,token_hash,label,created_at,expires_at) VALUES (?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET revoked_at=NULL,expires_at=excluded.expires_at',id,body.tokenHash,'我的 Omni 遠端研究',now.toISOString(),seconds(now)+90*86400);return {ok:true};
 }
 if(url.pathname==='/api/remote/revoke'&&request.method==='POST'){const body=await json(request,1024);await query(env.DB,'UPDATE remote_devices SET revoked_at=? WHERE id=?',now.toISOString(),String(body.deviceId||''));return {ok:true}}
 return null;
}
