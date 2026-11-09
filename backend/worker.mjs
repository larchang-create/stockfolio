import {exchangeRequest,exchangeOwner} from './exchange.mjs';
import {validateTaiwanSymbols} from './symbols.mjs';
import {PUBLIC_CRON,runPublicCycle,refreshStock,publicStatus,publicMacro,publicStocks} from './public-data.mjs';
import {remoteMachine,remoteOwner} from './remote-research.mjs';
import {ServiceError,validateInput} from './research.mjs';
export {collectSources,validateInput,validateReport,researchCompany} from './research.mjs';
import {researchConfig,checkResearch,runCompanyResearch} from './research-service.mjs';
const encoder=new TextEncoder();
import {identity,login,logout,passwordReady,passwordState,initializeDB} from './password-auth.mjs';
export {identity} from './password-auth.mjs';
function fail(message,status=401){throw new ServiceError(message,status)}
export function validateStocks(stocks){
 if(!Array.isArray(stocks)||stocks.length>1000)fail('每份名單最多 1000 檔。',400);
 const seen=new Set();
 for(const stock of stocks){
  if(!stock||typeof stock!=='object'||Array.isArray(stock)||!['台股','美股'].includes(stock.market)||typeof stock.symbol!=='string'||!/^[-A-Z0-9.]{1,20}$/.test(stock.symbol)||typeof stock.id!=='string'||!/^[a-f0-9-]{36}$/.test(stock.id)||typeof stock.name!=='string'||!stock.name.trim()||stock.name.length>80)fail('股票資料格式不正確。',400);
  const key=stock.market+':'+stock.symbol;if(seen.has(key))fail('名單中有重複股票。',400);seen.add(key);
  if(encoder.encode(JSON.stringify(stock)).length>750000)fail('單檔筆記過大，請先匯出備份並精簡。',413);
 }
 return stocks;
}
export async function readState(db,owner){
 const results=await db.batch([
 db.prepare('INSERT OR IGNORE INTO sync_accounts(owner_id) VALUES (?)').bind(owner),
 db.prepare('SELECT revision,updated_at FROM sync_accounts WHERE owner_id=?').bind(owner),
 db.prepare('SELECT data_json FROM sync_stocks WHERE owner_id=? ORDER BY stock_key').bind(owner)]);
 const info=results[1].results[0];return {revision:info.revision,updatedAt:info.updated_at,stocks:results[2].results.map(x=>JSON.parse(x.data_json))};
}
export async function writeState(db,owner,body){
 if(!Number.isSafeInteger(body?.revision)||body.revision<0)fail('同步版本不正確。',400);
 const stocks=validateStocks(body.stocks),mutation=crypto.randomUUID(),date=new Date().toISOString();
 await db.prepare('INSERT OR IGNORE INTO sync_accounts(owner_id) VALUES (?)').bind(owner).run();
 const statements=[db.prepare('UPDATE sync_accounts SET revision=revision+1,mutation_id=?,updated_at=? WHERE owner_id=? AND revision=? RETURNING revision').bind(mutation,date,owner,body.revision),
 db.prepare('DELETE FROM sync_stocks WHERE owner_id=? AND EXISTS (SELECT 1 FROM sync_accounts WHERE owner_id=? AND mutation_id=?)').bind(owner,owner,mutation)];
 // Each parameter remains below D1 row/value limits; the entire batch is one transaction.
 const chunks=[];let chunk=[],bytes=2;
 for(const stock of stocks){const size=encoder.encode(JSON.stringify(stock)).length+1;if(chunk.length&&bytes+size>900000){chunks.push(chunk);chunk=[];bytes=2}chunk.push(stock);bytes+=size}if(chunk.length)chunks.push(chunk);
 for(const group of chunks)statements.push(db.prepare("INSERT INTO sync_stocks(owner_id,stock_key,data_json) SELECT ?,json_extract(value,'$.market')||':'||json_extract(value,'$.symbol'),value FROM json_each(?) WHERE EXISTS (SELECT 1 FROM sync_accounts WHERE owner_id=? AND mutation_id=?)").bind(owner,JSON.stringify(group),owner,mutation));
 const result=await db.batch(statements);
 if(!result[0].results.length)return {conflict:true,...await readState(db,owner)};
 return {revision:body.revision+1,updatedAt:date};
}
export default {async scheduled(controller,env){return runPublicCycle(env,{now:new Date(controller.scheduledTime||Date.now()),trigger:'cron'})},async fetch(request,env,ctx){
 const url=new URL(request.url),reply=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
 const asset=async path=>{
  if(!env.ASSETS)fail('網站檔案尚未部署。',503);
  const target=new URL(path||url.pathname,url);const res=await env.ASSETS.fetch(new Request(target,{method:request.method==='HEAD'?'HEAD':'GET'}));const response=new Response(res.body,res);
  response.headers.set('Cache-Control','private,no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('X-Frame-Options','DENY');response.headers.set('Referrer-Policy','same-origin');return response;
 };
 try{
  if(request.method!=='GET'&&request.method!=='HEAD'&&request.headers.get('Origin')!==url.origin)fail('請從網站內操作。',403);
  if(url.pathname==='/api/health'&&request.method==='GET')return reply({syncReady:!!(env.DB&&passwordReady(env))});
  if(url.pathname==='/api/setup'&&request.method==='GET')return reply({passwordReady:passwordReady(env),passwordState:passwordState(env),databaseReady:!!env.DB});
  if(url.pathname==='/api/login'&&request.method==='POST')return reply({ok:true},200,{'Set-Cookie':await login(request,env)});
  if(url.pathname==='/api/logout'&&request.method==='POST')return reply({ok:true},200,{'Set-Cookie':await logout(request,env)});
  if(['/login','/login.html','/login.js','/style.css'].includes(url.pathname)&&['GET','HEAD'].includes(request.method))return await asset(url.pathname==='/login'?'/login.html':url.pathname);
  const exchange=await exchangeRequest(request,env);if(exchange!==null)return reply(exchange);
  const machine=await remoteMachine(request,env);if(machine!==null)return reply(machine);
  let owner;
  try{owner=await identity(request,env)}catch(e){
   if(!url.pathname.startsWith('/api/')&&['GET','HEAD'].includes(request.method)&&e instanceof ServiceError&&[401,503].includes(e.status))return new Response(null,{status:302,headers:{Location:url.pathname==='/remote-connect'?'/login?next='+encodeURIComponent(url.pathname+url.search):'/login','Cache-Control':'no-store'}});
   throw e;
  }
  if(url.pathname==='/api/session'&&request.method==='GET')return reply({accountId:owner,label:'我的個人資料',syncReady:!!env.DB,analysisReady:researchConfig(env).configured,researchModel:researchConfig(env).model});
  const ownerExchange=await exchangeOwner(request,env);if(ownerExchange!==null)return reply(ownerExchange);
  const remote=await remoteOwner(request,env);if(remote!==null)return reply(remote);
  if(url.pathname==='/remote-connect'&&request.method==='GET')return await asset('/remote-connect.html');
  if(url.pathname==='/api/public-data/status'&&request.method==='GET')return reply(await publicStatus(env));
  if(url.pathname==='/api/public-data/macro'&&request.method==='GET')return reply(await publicMacro(env));
  if(url.pathname==='/api/public-data/stocks'&&request.method==='GET')return reply(await publicStocks(env));
  if(url.pathname==='/api/symbols/validate'&&request.method==='POST'){
   const raw=await request.text();if(raw.length>4096)fail('一次最多檢查 200 個代號。',413);
   let body;try{body=JSON.parse(raw)}catch{fail('代號格式不正確。',400)}
   return reply(await validateTaiwanSymbols(env,body.symbols));
  }
  if(url.pathname==='/api/public-data/refresh'&&request.method==='POST'){
   const raw=await request.text();if(raw.length>2048)fail('請求過大。',413);
   let body;try{body=JSON.parse(raw)}catch{fail('資料格式不正確。',400)}
   if(body.scope==='stock')return reply(await refreshStock(env,validateInput(body),{force:true}));
   if(body.scope!=='cycle')fail('請選擇有效的更新方式。',400);
   const task=runPublicCycle(env);
   if(ctx?.waitUntil){ctx.waitUntil(task.catch(()=>console.error('Public data cycle failed; source status retained.')));return reply({accepted:true,cron:PUBLIC_CRON},202)}
   return reply(await task);
  }
  if(url.pathname==='/api/state'){
   await initializeDB(env.DB);
   if(request.method==='GET')return reply(await readState(env.DB,owner));
   if(request.method==='PUT'){
    if(Number(request.headers.get('Content-Length')||0)>6000000)fail('資料過大。',413);
    const text=await request.text();if(encoder.encode(text).length>6000000)fail('資料過大。',413);
    let body;try{body=JSON.parse(text)}catch{fail('資料格式不正確。',400)}
    validateStocks(body.stocks);
    const current=await readState(env.DB,owner);
    if(body.revision===current.revision){
     const known=new Set(current.stocks.filter(s=>s.watch).map(s=>s.market+':'+s.symbol));
     const added=body.stocks.filter(s=>s.market==='台股'&&s.watch&&!known.has(s.market+':'+s.symbol)).map(s=>s.symbol);
     for(let offset=0;offset<added.length;offset+=200){
      const check=await validateTaiwanSymbols(env,added.slice(offset,offset+200));
      if(check.invalid.length)fail('查不到台股代號：'+check.invalid.join('、')+'，尚未儲存。',422);
      if(check.unverified.length)fail('官方清單暫時無法確認台股代號，請稍後再同步。',503);
     }
    }
    const result=await writeState(env.DB,owner,body);return reply(result,result.conflict?409:200);
   }
   return reply({error:'不支援此操作。'},405);
  }
  if(url.pathname==='/api/research/status'&&request.method==='GET')return reply(researchConfig(env));
  if(url.pathname==='/api/research/check'&&request.method==='POST')return reply(await checkResearch(env));
  if(url.pathname==='/api/research'&&request.method==='POST'){
   const text=await request.text();if(text.length>2048)fail('請求過大。',413);
   let body;try{body=JSON.parse(text)}catch{fail('請求格式不正確。',400)}
   return reply(await runCompanyResearch(env,owner,validateInput(body)));
  }
  if(url.pathname.startsWith('/api/'))return reply({error:'找不到此服務。'},404);
  return await asset();
 }catch(e){return reply({error:e instanceof ServiceError?e.message:'服務暫時無法完成，請稍後重試。'},e instanceof ServiceError?e.status:503,e?.status===429?{'Retry-After':'900'}:{})}
}};
