import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{readState,writeState} from '../backend/worker.mjs';
import {identity,initializeDB,passwordState} from '../backend/password-auth.mjs';
import '../public/sync.js';
const {merge,Client}=globalThis.StockfolioSync;
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_sync.sql',import.meta.url),'utf8'));const prepare=sql=>({bind(...args){return {sql,args,async run(){const s=db.prepare(sql);return {results:s.columns().length?s.all(...args):(s.run(...args),[])}}}}});return {prepare,async batch(items){db.exec('BEGIN');try{const results=[];for(const q of items)results.push(await q.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}},db}}
const stock=(symbol='MSFT',extra={})=>({id:crypto.randomUUID(),market:'美股',symbol,name:symbol,watch:true,notes:'',...extra});
test('transactional CAS preserves additions, detects stale devices, keeps owners apart',async()=>{
 const db=database(),s=stock();assert.equal((await readState(db,'a')).revision,0);
 assert.equal((await writeState(db,'a',{revision:0,stocks:[s]})).revision,1);
 const old=await writeState(db,'a',{revision:0,stocks:[]});assert.equal(old.conflict,true);assert.deepEqual(old.stocks,[s]);
 assert.deepEqual((await readState(db,'b')).stocks,[]);
 assert.equal((await writeState(db,'a',{revision:1,stocks:[]})).revision,2);assert.deepEqual((await readState(db,'a')).stocks,[]);
});
test('failed insert rolls back revision and deletion in the same transaction',async()=>{
 const db=database(),s=stock();await writeState(db,'a',{revision:0,stocks:[s]});
 db.db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON sync_stocks BEGIN SELECT RAISE(ABORT,'test'); END;");
 await assert.rejects(writeState(db,'a',{revision:1,stocks:[stock('AAPL')]}));const state=await readState(db,'a');assert.equal(state.revision,1);assert.deepEqual(state.stocks,[s]);
});
test('duplicate records and invalid payloads are rejected before writes',async()=>{const db=database(),s=stock();await assert.rejects(writeState(db,'a',{revision:0,stocks:[s,s]}));await assert.rejects(writeState(db,'a',{revision:-1,stocks:[]}));assert.equal((await readState(db,'a')).revision,0)});
test('three way merges additions and separate edits; deletion remains deleted',()=>{
 const s=stock(),t=stock('AAPL');assert.equal(merge([s],[{...s,watch:false}],[s,t]).stocks.length,2);
 const out=merge([s],[{...s,watch:false}],[{...s,notes:'cloud'}]);assert.equal(out.conflicts.length,0);assert.equal(out.stocks[0].watch,false);assert.equal(out.stocks[0].notes,'cloud');
 assert.deepEqual(merge([s],[],[s]).stocks,[]);assert.deepEqual(merge([s],[s],[]).stocks,[]);
});
test('same note edit and deletion versus edit require explicit resolution',()=>{const s=stock(),l={...s,notes:'local'},r={...s,notes:'remote'};assert.equal(merge([s],[l],[r]).conflicts.length,1);assert.equal(merge([s],[l],[r],'remote').stocks[0].notes,'remote');assert.equal(merge([s],[],[r]).conflicts.length,1);assert.deepEqual(merge([s],[],[r],'local').stocks,[])});
test('six research questions merge separately rather than discard another section',()=>{const sections=Array.from({length:6},()=>({summary:'',counter:''})),s=stock('MSFT',{research:{sections}}),l=structuredClone(s),r=structuredClone(s);l.research.sections[0].summary='local';r.research.sections[1].counter='remote';const result=merge([s],[l],[r]);assert.equal(result.conflicts.length,0);assert.equal(result.stocks[0].research.sections[1].counter,'remote')});
const tick=()=>new Promise(r=>setTimeout(r,0));
function device(db,owner,cached=null){let online=true,cache,display,status;const client=new Client({cached,request:async(path,options)=>{if(!online)throw Error('offline');await tick();return Response.json(options.method==='GET'?await readState(db,owner):await writeState(db,owner,JSON.parse(options.body)),{status:200})},save:x=>cache=structuredClone(x),onData:x=>display=x,onStatus:x=>status=x});return {client,offline:()=>online=false,online:()=>online=true,get cache(){return cache},get display(){return display},get status(){return status}}}
test('two devices and offline reload converge without losing additions or deleted records',async()=>{
 const db=database(),a=device(db,'me'),b=device(db,'me');await a.client.sync();await b.client.sync();
 const s=stock(),t=stock('AAPL');a.client.commit([s]);await a.client.sync();b.offline();b.client.commit([t]);await b.client.sync();assert.equal(b.status,'offline');
 const restored=device(db,'me',b.cache);await restored.client.sync();await a.client.sync();assert.equal(a.display.length,2);
 a.client.commit(a.display.filter(x=>x.symbol!=='MSFT'));await a.client.sync();await restored.client.sync();assert.deepEqual(restored.display.map(x=>x.symbol),['AAPL']);
 for(const x of [a,b,restored])x.client.stop();
});
test('conflicting notes pause upload until a person chooses a version',async()=>{
 const db=database(),s=stock();await writeState(db,'me',{revision:0,stocks:[s]});const a=device(db,'me'),b=device(db,'me');await a.client.sync();await b.client.sync();a.client.commit([{...s,notes:'a'}]);await a.client.sync();b.client.commit([{...s,notes:'b'}]);await b.client.sync();assert.equal(b.status,'conflict');assert.equal((await readState(db,'me')).stocks[0].notes,'a');b.client.resolve('local');await b.client.sync();assert.equal((await readState(db,'me')).stocks[0].notes,'b');a.client.stop();b.client.stop();
});
test('in flight save retains edits made while a write was pending',async()=>{
 const db=database(),s=stock(),a=device(db,'me');await a.client.sync();a.client.commit([s]);const pending=a.client.sync();await tick();a.client.commit([{...s,notes:'later'}]);await pending;await a.client.sync();assert.equal((await readState(db,'me')).stocks[0].notes,'later');a.client.stop();
});
test('editing a form defers remote changes',async()=>{let applied=false;const c=new Client({request:async()=>Response.json({revision:0,stocks:[]}),onData:()=>applied=true,onStatus:()=>{},isEditing:()=>true});await c.sync();assert.equal(applied,false);c.stop()});
test('large watchlists use a bounded number of database statements',async()=>{
 const db=database();let count=0;const batch=db.batch.bind(db);db.batch=items=>{count=items.length;return batch(items)};
 const list=Array.from({length:1000},(_,i)=>stock('S'+i,{notes:'x'.repeat(1000)}));await writeState(db,'me',{revision:0,stocks:list});assert.ok(count<10);assert.equal((await readState(db,'me')).stocks.length,1000);
});

const env={SITE_PASSWORD:'fixture-only-password-long-enough'};
function request(path,method='GET',body,token,origin='https://stockfolio.test'){
 return new Request('https://stockfolio.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:token}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
async function signin(settings){const res=await worker.fetch(request('/api/login','POST',{password:settings.SITE_PASSWORD}),settings);assert.equal(res.status,200);return res.headers.get('Set-Cookie').split(';')[0]}
test('empty databases initialize automatically without manual SQL or Access',async()=>{
 const db=database();db.db.exec('DROP TABLE sync_stocks; DROP TABLE sync_accounts');await initializeDB(db);assert.deepEqual((await readState(db,'personal')).stocks,[]);assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='auth_sessions'").get().n,1);
});
test('login page works before setup; private app and APIs remain protected',async()=>{
 const settings={ASSETS:{fetch:async req=>new Response('fixture asset '+new URL(req.url).pathname)}};
 const main=await worker.fetch(request('/'),settings);assert.equal(main.status,302);assert.equal(main.headers.get('Location'),'/login');
 assert.equal((await worker.fetch(request('/login'),settings)).status,200);assert.equal((await worker.fetch(request('/login.js'),settings)).status,200);
 assert.equal((await worker.fetch(request('/api/state'),settings)).status,503);
 assert.deepEqual(await (await worker.fetch(request('/api/setup'),{})).json(),{passwordReady:false,passwordState:'missing',databaseReady:false});
 assert.equal((await worker.fetch(request('/api/login','POST',{password:'anything'}),{SITE_PASSWORD:'short',DB:database()})).status,503);
});
test('login issues a secure HttpOnly session, supports two devices and excludes secrets',async()=>{
 const settings={...env,DB:database()},one=await signin(settings),two=await signin(settings);
 assert.notEqual(one,two);assert.equal(await identity(request('/api/state','GET',null,one),settings),'personal');
 const login=await worker.fetch(request('/api/login','POST',{password:env.SITE_PASSWORD}),settings),cookie=login.headers.get('Set-Cookie');
 for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','__Host-'])assert.ok(cookie.includes(flag));
 const info=await (await worker.fetch(request('/api/session','GET',null,one),settings)).json();assert.equal(info.accountId,'personal');assert.equal(info.analysisReady,false);assert.ok(!JSON.stringify(info).includes(env.SITE_PASSWORD));
 const s=stock(),put=await worker.fetch(request('/api/state','PUT',{revision:0,stocks:[s]},one),settings);assert.equal(put.status,200);
 assert.deepEqual((await (await worker.fetch(request('/api/state','GET',null,two),settings)).json()).stocks,[s]);
 assert.equal((await worker.fetch(request('/api/state','PUT',{revision:0,stocks:[]},two),settings)).status,409);
});
test('wrong passwords, altered or expired cookies, and headers posing as Access are rejected',async()=>{
 const settings={...env,DB:database()};assert.equal((await worker.fetch(request('/api/login','POST',{password:'wrong'}),settings)).status,401);
 const cookie=await signin(settings),[name,value]=cookie.split('='),parts=value.split('.');parts[0]=(parts[0][0]==='a'?'b':'a')+parts[0].slice(1);
 assert.equal((await worker.fetch(request('/api/session','GET',null,name+'='+parts.join('.')),settings)).status,401);
 parts[1]='1';assert.equal((await worker.fetch(request('/api/session','GET',null,name+'='+parts.join('.')),settings)).status,401);
 assert.equal((await worker.fetch(new Request('https://stockfolio.test/api/state',{headers:{'Cf-Access-Authenticated-User-Email':'pretend@example.test'}}),settings)).status,401);
});
test('logout revokes only that device and a password change revokes every old session',async()=>{
 const settings={...env,DB:database()},one=await signin(settings),two=await signin(settings);
 const logout=await worker.fetch(request('/api/logout','POST',null,one),settings);assert.equal(logout.status,200);assert.ok(logout.headers.get('Set-Cookie').includes('Max-Age=0'));
 assert.equal((await worker.fetch(request('/api/session','GET',null,one),settings)).status,401);assert.equal((await worker.fetch(request('/api/session','GET',null,two),settings)).status,200);
 assert.equal((await worker.fetch(request('/api/session','GET',null,two),{...settings,SITE_PASSWORD:'replacement-fixture-password'})).status,401);
});
test('login and mutations reject cross origin requests before authentication',async()=>{
 const settings={...env,DB:database()};for(const path of ['/api/login','/api/logout','/api/state'])assert.equal((await worker.fetch(request(path,'POST',{password:env.SITE_PASSWORD},null,'https://other.test'),settings)).status,403);
});
test('repeated password guessing is rate limited and does not grant a session',async()=>{
 const settings={...env,DB:database()};for(let i=0;i<10;i++)assert.equal((await worker.fetch(request('/api/login','POST',{password:'wrong'}),settings)).status,401);
 const limited=await worker.fetch(request('/api/login','POST',{password:env.SITE_PASSWORD}),settings);assert.equal(limited.status,429);assert.equal(limited.headers.get('Set-Cookie'),null);assert.equal(limited.headers.get('Retry-After'),'900');
});

test('setup distinguishes missing, short and valid credentials without exposing values or exact lengths',async()=>{
 for(const [value,state] of [[undefined,'missing'],['','missing'],['abc123','too_short'],['x'.repeat(257),'too_long'],[{},'invalid_type'],['x'.repeat(16),'ready']]){
  assert.equal(passwordState({SITE_PASSWORD:value}),state);
  const res=await worker.fetch(request('/api/setup'),{SITE_PASSWORD:value});const info=await res.json();
  assert.deepEqual(Object.keys(info).sort(),['databaseReady','passwordReady','passwordState']);assert.equal(info.passwordState,state);assert.equal(info.passwordReady,state==='ready');
 }
});
