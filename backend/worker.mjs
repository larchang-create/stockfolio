import {ServiceError,researchCompany,validateInput} from './research.mjs';
export {collectSources,validateInput,validateReport,researchCompany} from './research.mjs';
const encoder=new TextEncoder();
const keys=new Map();
function fail(message,status=401){throw new ServiceError(message,status)}
function decode(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0))}
export async function identity(request,env,fetcher=fetch){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL)fail('尚未完成個人登入設定。',503);
 const issuer='https://'+env.ACCESS_TEAM_DOMAIN;
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))fail('登入網域設定不正確。',503);
 try{
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||'',parts=token.split('.');if(parts.length!==3)fail('請重新登入。');
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')fail('登入憑證無效。');
  const now=Date.now()/1000;
  if(claims.iss!==issuer||![claims.aud].flat().includes(env.ACCESS_AUD)||!Number.isFinite(claims.exp)||claims.exp<=now||(claims.nbf&&claims.nbf>now))fail('登入已過期或憑證無效。');
  let cached=keys.get(issuer);
  if(!cached||cached.until<Date.now()||!cached.list.some(k=>k.kid===header.kid)){
   const res=await fetcher(issuer+'/cdn-cgi/access/certs');if(!res.ok)fail('暫時無法確認登入，請重試。',503);
   const data=await res.json();cached={until:Date.now()+300000,list:data.keys||[]};keys.set(issuer,cached);
  }
  const jwk=cached.list.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)fail('登入憑證無效。');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))fail('登入憑證無效。');
  if(typeof claims.email!=='string'||claims.email.toLowerCase()!==env.OWNER_EMAIL.trim().toLowerCase())fail('此帳號沒有權限。',403);
  return claims.email.toLowerCase();
 }catch(e){if(e instanceof ServiceError)throw e;fail('登入憑證無效。')}
}
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
export default {async fetch(request,env){
 const url=new URL(request.url),reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 try{
  if(url.pathname==='/api/health')return reply({syncReady:!!(env.DB&&env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD&&env.OWNER_EMAIL)});
  const owner=await identity(request,env);
  if(request.method!=='GET'&&request.method!=='HEAD'&&request.headers.get('Origin')!==url.origin)fail('請從網站內操作。',403);
  if(url.pathname==='/api/session'&&request.method==='GET')return reply({email:owner,syncReady:!!env.DB,analysisReady:!!(env.OPENAI_API_KEY&&env.OPENAI_MODEL)});
  if(url.pathname==='/api/state'){
   if(!env.DB)fail('雲端資料庫尚未連接。',503);
   if(request.method==='GET')return reply(await readState(env.DB,owner));
   if(request.method==='PUT'){
    if(Number(request.headers.get('Content-Length')||0)>6000000)fail('資料過大。',413);
    const text=await request.text();if(encoder.encode(text).length>6000000)fail('資料過大。',413);
    let body;try{body=JSON.parse(text)}catch{fail('資料格式不正確。',400)}
    const result=await writeState(env.DB,owner,body);return reply(result,result.conflict?409:200);
   }
   return reply({error:'不支援此操作。'},405);
  }
  if(url.pathname==='/api/research'&&request.method==='POST'){
   if(!env.OPENAI_API_KEY||!env.OPENAI_MODEL)fail('資料抓取與分析尚未啟用；名單與筆記同步可正常使用。',503);
   const text=await request.text();if(text.length>2048)fail('請求過大。',413);
   let body;try{body=JSON.parse(text)}catch{fail('請求格式不正確。',400)}
   return reply(await researchCompany(env,validateInput(body)));
  }
  if(url.pathname.startsWith('/api/'))return reply({error:'找不到此服務。'},404);
  if(!env.ASSETS)fail('網站檔案尚未部署。',503);
  const asset=await env.ASSETS.fetch(request);const response=new Response(asset.body,asset);response.headers.set('Cache-Control','private,no-store');return response;
 }catch(e){return reply({error:e instanceof ServiceError?e.message:'服務暫時無法完成，請稍後重試。'},e instanceof ServiceError?e.status:503)}
}};
