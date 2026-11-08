import seed from '../public/macro-data.json' with {type:'json'};
import {initializeDB} from './password-auth.mjs';
import {ServiceError} from './research.mjs';
import {safeURL,plain,validDate,rocDate,parseCPI,parseEmployment,parsePolicy,latestPolicyURL,parseFX,latestExportsURL,parseExports,parseFeed,parseSEC,parseTWAnnouncements,parseTWQuote} from './public-data-parsers.mjs';
export const PUBLIC_CRON='*/15 * * * *';
// Tick frequently to keep each invocation small; fetch each source only once per Taipei 07:00 batch.
export const publicBatchStart=now=>new Date(Math.floor((now.getTime()+3600000)/86400000)*86400000-3600000).toISOString();
const UA='Stockfolio public-data collector/1.0 (+https://stockfolio.larry17342.workers.dev/)';
const SOURCES={
 fed:{label:'聯準會政策利率',url:'https://www.federalreserve.gov/newsevents/pressreleases/'},
 cpi:{label:'BLS 整體與核心 CPI',url:'https://www.bls.gov/news.release/cpi.htm'},
 employment:{label:'BLS 就業與失業率',url:'https://www.bls.gov/news.release/empsit.htm'},
 fx:{label:'央行美元／新台幣匯率',url:'https://www.cbc.gov.tw/tw/lp-645-1-1-60.html'},
 exports:{label:'財政部出口統計',url:'https://www.mof.gov.tw/'},
 'news-fed':{label:'聯準會官方公告',id:'news-fed',url:'https://www.federalreserve.gov/feeds/press_all.xml',hosts:['www.federalreserve.gov']},
 'news-eu':{label:'歐盟理事會官方公告',id:'news-eu',url:'https://www.consilium.europa.eu/en/rss/pressreleases.ashx',hosts:['www.consilium.europa.eu']}
};
const schema=[
 'CREATE TABLE IF NOT EXISTS public_cache(cache_key TEXT PRIMARY KEY,data_json TEXT NOT NULL,updated_at TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS public_sources(source_id TEXT PRIMARY KEY,label TEXT NOT NULL,state TEXT NOT NULL,last_attempt TEXT NOT NULL,last_success TEXT,error TEXT)',
 'CREATE TABLE IF NOT EXISTS public_stocks(stock_key TEXT PRIMARY KEY,data_json TEXT,checked_at TEXT NOT NULL,last_success TEXT,state TEXT NOT NULL,error TEXT)',
 'CREATE TABLE IF NOT EXISTS public_jobs(job_key TEXT PRIMARY KEY,job_id TEXT NOT NULL,lease_until INTEGER NOT NULL,last_start TEXT,last_finish TEXT,state TEXT,last_cron TEXT,cursor INTEGER NOT NULL DEFAULT 0)'
];
const initialized=new WeakMap();
export async function initializePublicDB(db){await initializeDB(db);if(!initialized.has(db)){const p=db.batch(schema.map(sql=>db.prepare(sql).bind()));initialized.set(db,p);p.catch(()=>initialized.delete(db))}await initialized.get(db)}
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const rows=async(db,sql,...args)=>(await run(db,sql,...args)).results;
async function readCache(db,key){const r=await rows(db,'SELECT data_json,updated_at FROM public_cache WHERE cache_key=?',key);return r.length?{data:JSON.parse(r[0].data_json),updatedAt:r[0].updated_at}:null}
async function saveCache(db,key,data,now){const json=JSON.stringify(data);if(new TextEncoder().encode(json).length>850000)throw Error('資料超出單筆快取上限，保留舊資料');await run(db,'INSERT INTO public_cache(cache_key,data_json,updated_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at',key,json,now.toISOString())}
async function download(url,fetcher,{json=false,max=3000000}={}){
 const response=await fetcher(url,{headers:{'User-Agent':UA,Accept:json?'application/json':'text/html,application/rss+xml,application/atom+xml,application/xml,text/xml'},redirect:'follow',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error(response.status===403||response.status===429?`來源暫時限制讀取（HTTP ${response.status}）`:`來源回應 HTTP ${response.status}`);
 if(response.url&&new URL(response.url).hostname!==new URL(url).hostname)throw Error('來源重新導向至其他網站，未採用資料');
 if(Number(response.headers.get('Content-Length'))>max){response.body?.cancel();throw Error('來源資料過大，保留舊資料')}
 const body=await response.text();if(body.length>max||new TextEncoder().encode(body).length>max)throw Error('來源資料過大，保留舊資料');
 if(json){try{return JSON.parse(body)}catch{throw Error('來源未傳回有效 JSON')}}return body;
}
async function status(db,id,definition,state,now,error=null){await run(db,'INSERT INTO public_sources(source_id,label,state,last_attempt,last_success,error) VALUES (?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET label=excluded.label,state=excluded.state,last_attempt=excluded.last_attempt,last_success=CASE WHEN excluded.state=\'ok\' THEN excluded.last_success ELSE public_sources.last_success END,error=excluded.error',id,definition.label,state,now.toISOString(),state==='ok'?now.toISOString():null,error)}
function applyIndicators(snapshot,updates,sourceId,sourceURL,now){
 const today=now.toISOString().slice(0,10),sourceKey={fed:'fed',cpi:'cpi',employment:'jobs',fx:'fx',exports:'exports'}[sourceId];
 for(const u of updates){if(!validDate(u.periodEnd)||!validDate(u.publishedAt)||u.periodEnd>u.publishedAt||u.publishedAt>today)throw Error('來源資料日期無效，保留舊資料');const old=snapshot.indicators.find(i=>i.id===u.id);if(!old||u.periodEnd<old.periodEnd)throw Error('來源資料較現有資料舊，保留原版本')}
 for(const u of updates){const i=snapshot.indicators.findIndex(x=>x.id===u.id),old=snapshot.indicators[i];const value=Number(u.value);const history=Number.isFinite(value)?[...new Map([...old.history,{date:u.periodEnd,value}].map(p=>[p.date,p])).values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-24):old.history;
  const comparison=u.comparison||(u.id==='policy-rate'?'最新公布的政策利率目標區間':u.id==='taiwan-exports'?'美元計價年增率；不是月增率':old.periodEnd<u.periodEnd?`${old.period}：${old.value}% → ${u.period}：${u.value}%`:'本期官方公布值；來源可能修訂歷史數據');
  snapshot.indicators[i]={...old,...u,history:u.history||history,comparison,sourceIds:[sourceKey]};
 }
 const source=snapshot.sources.find(s=>s.id===sourceKey);if(source){source.url=sourceURL;source.title=SOURCES[sourceId].label+'｜官方來源'}snapshot.checkedAt=today;return snapshot;
}
async function updateMacro(db,id,fetcher,now){
 const def=SOURCES[id];try{
  let url=def.url,updates;
  if(id==='fed'){try{const index=await download(`https://www.federalreserve.gov/newsevents/pressreleases/${now.getUTCFullYear()}-press-fomc.htm`,fetcher);url=latestPolicyURL(index,now.toISOString().slice(0,10))}catch{const index=await download(`https://www.federalreserve.gov/newsevents/pressreleases/${now.getUTCFullYear()-1}-press-fomc.htm`,fetcher);url=latestPolicyURL(index,now.toISOString().slice(0,10))}updates=parsePolicy(await download(url,fetcher))}
  else if(id==='cpi')updates=parseCPI(await download(url,fetcher));
  else if(id==='employment')updates=parseEmployment(await download(url,fetcher));
  else if(id==='fx')updates=parseFX(await download(url,fetcher));
  else {url=latestExportsURL(await download(url,fetcher));updates=parseExports(await download(url,fetcher))}
  const current=(await readCache(db,'macro'))?.data||structuredClone(seed);const next=applyIndicators(structuredClone(current),updates,id,url,now);await saveCache(db,'macro',next,now);await status(db,id,def,'ok',now);
 }catch(error){await status(db,id,def,'error',now,error.message?.slice(0,300)||'來源更新失敗')}
}
async function updateNews(db,id,fetcher,now){const def=SOURCES[id];try{const news=parseFeed(await download(def.url,fetcher),def,now);await saveCache(db,id,news,now);await status(db,id,def,'ok',now)}catch(error){await status(db,id,def,'error',now,error.message?.slice(0,300)||'公告來源更新失敗')}}
async function dataset(db,key,url,fetcher,now,project){const cached=await readCache(db,key);if(cached&&cached.updatedAt>=publicBatchStart(now))return cached.data;const data=project(await download(url,fetcher,{json:true}));await saveCache(db,key,data,now);return data}
async function company(db,input,fetcher,now){
 if(input.market==='美股'){
  const url='https://www.sec.gov/files/company_tickers.json';
  const mapping=await dataset(db,'sec-tickers',url,fetcher,now,raw=>{if(!raw||typeof raw!=='object')throw Error('SEC 代號對照格式變更');const out={};for(const row of Object.values(raw))if(row&&typeof row.ticker==='string'&&/^\d{1,10}$/.test(String(row.cik_str)))out[row.ticker]={cik:String(row.cik_str).padStart(10,'0')};if(!Object.keys(out).length)throw Error('SEC 對照表為空');return out});
  const item=mapping[input.symbol]||mapping[input.symbol.replace(/\./g,'-')];if(!item)throw Error('SEC 公司索引未找到此代號；基金或其他證券可能不適用');
  const result=parseSEC(await download(`https://data.sec.gov/submissions/CIK${item.cik}.json`,fetcher,{json:true}),input.symbol,now);return {...input,...result,quote:null,checkedAt:now.toISOString()};
 }
 const errors=[],filings=[];let name=input.symbol,quote=null,recognized=false;
 for(const venue of ['listed','otc']){
  const base=venue==='listed'?'https://openapi.twse.com.tw/v1/opendata/':'https://www.tpex.org.tw/openapi/v1/mopsfin_';const suffix=venue==='listed'?'_L':'_O';
  try{
   const profile=await dataset(db,'tw-'+venue+'-profiles',base+'t187ap03'+suffix,fetcher,now,raw=>{if(!Array.isArray(raw)||!raw.length)throw Error('公司名冊格式變更');return raw.map(r=>({code:String(r['公司代號']||r.CompanyCode||''),name:String(r['公司簡稱']||r.CompanyAbbreviation||r.CompanyName||r['公司名稱']||'').slice(0,100)}))});
   const match=profile.find(r=>r.code===input.symbol);if(!match)continue;recognized=true;name=match.name||name;
   const announcementURL=base+'t187ap04'+suffix;
   try{const data=await dataset(db,'tw-'+venue+'-announcements',announcementURL,fetcher,now,raw=>{if(!Array.isArray(raw))throw Error('公告格式變更');raw=raw.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.trim(),value])));if(raw.length&&!raw.some(r=>'主旨'in r||'Subject'in r))throw Error('來源沒有公告主旨欄位');return raw.map(r=>({'公司代號':r['公司代號']||r.CompanyCode,'發言日期':r['發言日期']||r['公告日期']||r.Date,'主旨':String(r['主旨']||r.Subject||'').slice(0,300)}))});filings.push(...parseTWAnnouncements(data,input.symbol,announcementURL,now))}catch(e){errors.push(e.message)}
   // This is a financial index, not an AI analysis or a claim that every company has filed.
   const financialURL=base+'t187ap14'+suffix;
   try{const data=await dataset(db,'tw-'+venue+'-financial-index',financialURL,fetcher,now,raw=>{if(!Array.isArray(raw))throw Error('財報彙總格式變更');return raw.map(r=>({code:String(r['公司代號']||r.CompanyCode||''),year:String(r['年度']||r.Year||''),quarter:String(r['季別']||r.Season||''),date:String(r['出表日期']||r.Date||'')}))});const record=data.find(r=>r.code===input.symbol);if(record){const year=Number(record.year)+(Number(record.year)<1911?1911:0),quarter=Number(record.quarter);const date=rocDate(record.date);if(year>=2000&&year<=now.getUTCFullYear()&&quarter>=1&&quarter<=4&&date<=now.toISOString().slice(0,10))filings.push({title:`${year} 年第 ${quarter} 季財報彙總（原始資料）`,form:'財報彙總',date,periodEnd:new Date(Date.UTC(year,quarter*3,0)).toISOString().slice(0,10),url:financialURL,dateLabel:'出表日'})}}catch(e){errors.push(e.message)}
   break;
  }catch(error){errors.push(error.message)}
 }
 const quoteURL='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
 try{const data=await dataset(db,'tw-listed-quotes',quoteURL,fetcher,now,raw=>{if(!Array.isArray(raw))throw Error('收盤資料格式變更');return raw.map(r=>({Code:r.Code||r['證券代號'],Name:r.Name||r['證券名稱'],Date:r.Date||r['日期'],ClosingPrice:r.ClosingPrice||r['收盤價']}))});quote=parseTWQuote(data,input.symbol,quoteURL);if(quote&&quote.date>now.toISOString().slice(0,10))throw Error('收盤日期無效');if(quote){recognized=true;if(name===input.symbol)name=quote.companyName}}catch(e){errors.push(e.message)}
 if(!recognized)throw Error(errors[0]||'官方公司／收盤索引未找到此代號；ETF 不適用公司財報分析');
 return {...input,companyName:name,quote,filings:filings.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20),coverage:'官方本次公告與財報彙總索引，並非完整歷史申報；出表日不等於公司申報日。上櫃即時／收盤價格尚未串接。',warnings:errors,checkedAt:now.toISOString()};
}
export async function refreshStock(env,input,{fetcher=fetch,now=new Date(),force=false}={}){
 await initializePublicDB(env.DB);const db=env.DB,key=input.market+':'+input.symbol;const exists=await rows(db,"SELECT stock_key FROM sync_stocks WHERE owner_id='personal' AND stock_key=? AND json_extract(data_json,'$.watch')=1",key);if(!exists.length)throw new ServiceError('請先將股票加入觀察名單。',404);
 const previous=(await rows(db,'SELECT * FROM public_stocks WHERE stock_key=?',key))[0];const age=previous?now.getTime()-Date.parse(previous.checked_at):Infinity;
 if(force?age<900000:previous?.checked_at>=publicBatchStart(now))return {cached:true,stock:previous?.data_json?JSON.parse(previous.data_json):null,state:previous?.state};
 const job=crypto.randomUUID(),seconds=Math.floor(now.getTime()/1000);
 const lock=await rows(db,"INSERT INTO public_jobs(job_key,job_id,lease_until,state) VALUES (?,?,?,'running') ON CONFLICT(job_key) DO UPDATE SET job_id=excluded.job_id,lease_until=excluded.lease_until,state='running' WHERE public_jobs.lease_until<=? RETURNING job_id",'stock:'+key,job,seconds+180,seconds);
 if(!lock.length)return {cached:true,state:'running'};
 try{try{const data=await company(db,input,fetcher,now);if(previous?.data_json){const old=JSON.parse(previous.data_json);if(!data.quote&&old.quote)data.quote=old.quote;data.filings=[...new Map([...(data.filings||[]),...(old.filings||[])].map(f=>[f.url+'|'+f.date+'|'+f.title,f])).values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40)}const state=data.warnings?.length?'partial':'ok';await run(db,"INSERT INTO public_stocks(stock_key,data_json,checked_at,last_success,state,error) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_stocks WHERE owner_id='personal' AND stock_key=? AND json_extract(data_json,'$.watch')=1) ON CONFLICT(stock_key) DO UPDATE SET data_json=excluded.data_json,checked_at=excluded.checked_at,last_success=excluded.last_success,state=excluded.state,error=excluded.error",key,JSON.stringify(data),now.toISOString(),now.toISOString(),state,data.warnings?.join('；').slice(0,500)||null,key);return {cached:false,stock:data,state};}
 catch(error){await run(db,"INSERT INTO public_stocks(stock_key,checked_at,state,error) SELECT ?,?,'error',? WHERE EXISTS(SELECT 1 FROM sync_stocks WHERE owner_id='personal' AND stock_key=? AND json_extract(data_json,'$.watch')=1) ON CONFLICT(stock_key) DO UPDATE SET checked_at=excluded.checked_at,state=excluded.state,error=excluded.error",key,now.toISOString(),error.message?.slice(0,500)||'來源更新失敗',key);return {state:'error',error:error.message,stock:previous?.data_json?JSON.parse(previous.data_json):null};}}finally{await run(db,"UPDATE public_jobs SET lease_until=0,state='done' WHERE job_key=? AND job_id=?",'stock:'+key,job)}
}
export async function runPublicCycle(env,{fetcher=fetch,now=new Date(),trigger='manual'}={}){
 await initializePublicDB(env.DB);const db=env.DB,job=crypto.randomUUID(),seconds=Math.floor(now.getTime()/1000);
 const acquired=await rows(db,"INSERT INTO public_jobs(job_key,job_id,lease_until,last_start,state,cursor,last_cron) VALUES ('cycle',?,?,?,'running',1,?) ON CONFLICT(job_key) DO UPDATE SET job_id=excluded.job_id,lease_until=excluded.lease_until,last_start=excluded.last_start,state='running',cursor=public_jobs.cursor+1,last_cron=COALESCE(excluded.last_cron,public_jobs.last_cron) WHERE public_jobs.lease_until<=? RETURNING cursor-1 AS cursor",job,seconds+300,now.toISOString(),trigger==='cron'?now.toISOString():null,seconds);
 if(!acquired.length)return {busy:true};
 try{
  const start=publicBatchStart(now),attempts=await rows(db,'SELECT source_id,last_attempt FROM public_sources');
  const id=Object.keys(SOURCES).find(key=>!attempts.some(s=>s.source_id===key&&s.last_attempt>=start))||null;
  if(id?.startsWith('news-'))await updateNews(db,id,fetcher,now);else if(id)await updateMacro(db,id,fetcher,now);
  const pending=await rows(db,"SELECT s.stock_key FROM sync_stocks s LEFT JOIN public_stocks p ON s.stock_key=p.stock_key WHERE s.owner_id='personal' AND json_extract(s.data_json,'$.watch')=1 AND (p.checked_at IS NULL OR p.checked_at<?) ORDER BY COALESCE(p.checked_at,''),s.stock_key LIMIT 2",start);
  for(const row of pending){const at=row.stock_key.indexOf(':');await refreshStock(env,{market:row.stock_key.slice(0,at),symbol:row.stock_key.slice(at+1)},{fetcher,now})}
  await run(db,"UPDATE public_jobs SET lease_until=0,last_finish=?,state='done' WHERE job_key='cycle' AND job_id=?",now.toISOString(),job);return {busy:false,source:id,companies:pending.length};
 }catch(error){await run(db,"UPDATE public_jobs SET lease_until=0,last_finish=?,state='error' WHERE job_key='cycle' AND job_id=?",now.toISOString(),job);throw error}
}
export async function publicStatus(env,now=new Date()){await initializePublicDB(env.DB);const db=env.DB,job=(await rows(db,"SELECT * FROM public_jobs WHERE job_key='cycle'"))[0];const sources=await rows(db,'SELECT * FROM public_sources ORDER BY source_id');const watched=await rows(db,"SELECT stock_key FROM sync_stocks WHERE owner_id='personal' AND json_extract(data_json,'$.watch')=1");return {enabled:true,cron:PUBLIC_CRON,timezone:'Asia/Taipei',frequency:'daily',batchStart:publicBatchStart(now),schedule:'每天台灣時間 07:00 起分批更新；每個來源與公司每日自動檢查一次，完成後當天不重抓。手動更新另計。',lastRun:job?.last_start||null,lastCronRun:job?.last_cron||null,lastFinished:job?.last_finish||null,state:job?.state==='running'&&job.lease_until<Math.floor(Date.now()/1000)?'expired':job?.state||'pending',watched:watched.length,sources:Object.entries(SOURCES).map(([id,def])=>({id,label:def.label,...sources.find(s=>s.source_id===id),state:sources.find(s=>s.source_id===id)?.state||'pending'}))};}
export async function publicMacro(env){await initializePublicDB(env.DB);const snapshot=(await readCache(env.DB,'macro'))?.data||structuredClone(seed);const news=[];for(const id of ['news-fed','news-eu'])news.push(...((await readCache(env.DB,id))?.data||[]));return {...snapshot,sync:await publicStatus(env),announcements:news.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40)};}
export async function publicStocks(env){await initializePublicDB(env.DB);const data=await rows(env.DB,"SELECT s.stock_key,p.data_json,p.checked_at,p.last_success,p.state,p.error FROM sync_stocks s LEFT JOIN public_stocks p ON s.stock_key=p.stock_key WHERE s.owner_id='personal' AND json_extract(s.data_json,'$.watch')=1 ORDER BY s.stock_key");return {stocks:data.map(r=>({key:r.stock_key,data:r.data_json?JSON.parse(r.data_json):null,checkedAt:r.checked_at||null,lastSuccess:r.last_success||null,state:r.state||'pending',error:r.error||null}))};}
