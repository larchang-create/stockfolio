import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{identity,readState,writeState} from '../backend/worker.mjs';
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
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='fixture';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const env={ACCESS_TEAM_DOMAIN:'stockfolio-test.cloudflareaccess.com',ACCESS_AUD:'test-aud',OWNER_EMAIL:'person@example.test'};
async function token(extra={}){const h=encode({alg:'RS256',kid:'fixture'}),p=encode({iss:'https://'+env.ACCESS_TEAM_DOMAIN,aud:[env.ACCESS_AUD],email:env.OWNER_EMAIL,exp:Date.now()/1000+600,...extra}),input=h+'.'+p;return input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url')}
const req=t=>new Request('https://stockfolio.test/api/state',{headers:{'Cf-Access-Jwt-Assertion':t}});
const jwks=async()=>Response.json({keys:[jwk]});
test('Access signature, intended app, expiration, issuer and personal owner are verified',async()=>{
 assert.equal(await identity(req(await token()),env,jwks),env.OWNER_EMAIL);
 for(const claims of [{aud:['wrong']},{exp:1},{iss:'https://evil.test'},{email:'other@example.test'},{nbf:Date.now()/1000+600}])await assert.rejects(identity(req(await token(claims)),env,jwks));
 const parts=(await token()).split('.');parts[1]=encode({iss:'https://'+env.ACCESS_TEAM_DOMAIN,aud:['test-aud'],email:env.OWNER_EMAIL,exp:Date.now()/1000+600,forged:true});await assert.rejects(identity(req(parts.join('.')),env,jwks));
 await assert.rejects(identity(new Request('https://test',{headers:{'Cf-Access-Authenticated-User-Email':env.OWNER_EMAIL}}),env,jwks));
});
test('unconfigured deployment fails closed; health reveals no keys and foreign writes fail',async()=>{assert.equal((await worker.fetch(new Request('https://test/'),{})).status,503);assert.deepEqual(await (await worker.fetch(new Request('https://test/api/health'),{})).json(),{syncReady:false});const t=await token();const response=await worker.fetch(new Request('https://stockfolio.test/api/state',{method:'PUT',headers:{'Cf-Access-Jwt-Assertion':t,Origin:'https://evil.test'}}),env);assert.equal(response.status,403)});
test('authenticated API round trip works without any model API credentials',async()=>{
 const db=database(),t=await token(),settings={...env,DB:db};
 const call=(path,method='GET',body)=>worker.fetch(new Request('https://stockfolio.test'+path,{method,headers:{'Cf-Access-Jwt-Assertion':t,Origin:'https://stockfolio.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),settings);
 const session=await (await call('/api/session')).json();assert.equal(session.syncReady,true);assert.equal(session.analysisReady,false);
 const before=await (await call('/api/state')).json(),s=stock();assert.equal((await call('/api/state','PUT',{revision:before.revision,stocks:[s]})).status,200);
 assert.equal((await call('/api/state','PUT',{revision:before.revision,stocks:[]})).status,409);
 assert.deepEqual((await (await call('/api/state')).json()).stocks,[s]);
 assert.equal((await call('/api/research','POST',{market:'美股',symbol:'MSFT'})).status,503);
});
test('large watchlists use a bounded number of database statements',async()=>{
 const db=database();let count=0;const batch=db.batch.bind(db);db.batch=items=>{count=items.length;return batch(items)};
 const list=Array.from({length:1000},(_,i)=>stock('S'+i,{notes:'x'.repeat(1000)}));await writeState(db,'me',{revision:0,stocks:list});assert.ok(count<10);assert.equal((await readState(db,'me')).stocks.length,1000);
});
