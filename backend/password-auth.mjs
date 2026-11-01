import {ServiceError} from './research.mjs';
const enc=new TextEncoder(),COOKIE='__Host-stockfolio_session',AGE=30*24*60*60;
const schema=[
 "CREATE TABLE IF NOT EXISTS sync_accounts(owner_id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,mutation_id TEXT NOT NULL DEFAULT '',updated_at TEXT)",
 'CREATE TABLE IF NOT EXISTS sync_stocks(owner_id TEXT NOT NULL,stock_key TEXT NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(owner_id,stock_key),FOREIGN KEY(owner_id) REFERENCES sync_accounts(owner_id))',
 'CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS auth_attempts(bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts(expires_at)',
 'CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at)'
];
const initialized=new WeakMap();
export async function initializeDB(db){
 if(!db)throw new ServiceError('資料庫尚未連接，請確認最新部署已完成。',503);
 if(!initialized.has(db)){const pending=db.batch(schema.map(sql=>db.prepare(sql).bind()));initialized.set(db,pending);pending.catch(()=>initialized.delete(db))}
 await initialized.get(db);
}
export function passwordState(env){
 if(env.SITE_PASSWORD===undefined||env.SITE_PASSWORD===null||env.SITE_PASSWORD==='')return 'missing';
 if(typeof env.SITE_PASSWORD!=='string')return 'invalid_type';
 if([...env.SITE_PASSWORD].length<16)return 'too_short';
 if(env.SITE_PASSWORD.length>256)return 'too_long';
 return 'ready';
}
export function passwordReady(env){return passwordState(env)==='ready'}
function configured(env){if(!passwordReady(env))throw new ServiceError('請先在網站設定新增至少 16 字元的 SITE_PASSWORD 密碼。',503)}
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const digest=async text=>base64(await crypto.subtle.digest('SHA-256',enc.encode(text)));
async function signingKey(env){return crypto.subtle.importKey('raw',enc.encode(env.SITE_PASSWORD),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export const clearCookie=()=>COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
function cookie(request){return (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||''}
function now(){return Math.floor(Date.now()/1000)}
export async function identity(request,env){
 configured(env);const token=cookie(request),parts=token.split('.');
 if(parts.length!==3||!parts.every(x=>/^[A-Za-z0-9_-]{1,100}$/.test(x)))throw new ServiceError('請登入網站。',401);
 const expires=Number(parts[1]);if(!Number.isSafeInteger(expires)||expires<=now()||expires>now()+AGE+60)throw new ServiceError('登入已過期，請重新登入。',401);
 try{if(!await crypto.subtle.verify('HMAC',await signingKey(env),unbase64(parts[2]),enc.encode(parts[0]+'.'+parts[1])))throw Error()}catch{throw new ServiceError('請重新登入網站。',401)}
 await initializeDB(env.DB);
 const result=await env.DB.prepare('SELECT token_hash FROM auth_sessions WHERE token_hash=? AND expires_at>?').bind(await digest(token),now()).run();
 if(!result.results.length)throw new ServiceError('登入已結束，請重新登入。',401);
 return 'personal';
}
export async function login(request,env){
 configured(env);await initializeDB(env.DB);
 const text=await request.text();if(enc.encode(text).length>4096)throw new ServiceError('登入資料過長。',413);
 let password;try{password=JSON.parse(text).password}catch{throw new ServiceError('請輸入網站密碼。',400)}
 if(typeof password!=='string'||password.length>256)throw new ServiceError('請輸入網站密碼。',400);
 const time=now(),window=Math.floor(time/900),ip=await digest(request.headers.get('CF-Connecting-IP')||'unknown');
 const counts=await env.DB.batch([
 env.DB.prepare('DELETE FROM auth_attempts WHERE expires_at<=?').bind(time),
 env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(time),
 ...['ip:'+ip+':'+window,'all:'+window].map(bucket=>env.DB.prepare('INSERT INTO auth_attempts(bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,(window+1)*900))
 ]);
 if(counts[2].results[0].attempts>10||counts[3].results[0].attempts>100)throw new ServiceError('登入嘗試過多，請約 15 分鐘後再試。',429);
 const a=await digest(password),b=await digest(env.SITE_PASSWORD);let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);
 if(different)throw new ServiceError('密碼不正確，請再試一次。',401);
 const id=base64(crypto.getRandomValues(new Uint8Array(32))),expires=time+AGE,data=id+'.'+expires;
 const token=data+'.'+base64(await crypto.subtle.sign('HMAC',await signingKey(env),enc.encode(data)));
 await env.DB.prepare('INSERT INTO auth_sessions(token_hash,expires_at) VALUES (?,?)').bind(await digest(token),expires).run();
 return COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+AGE;
}
export async function logout(request,env){
 if(env.DB){await initializeDB(env.DB);await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await digest(cookie(request))).run()}
 return clearCookie();
}
