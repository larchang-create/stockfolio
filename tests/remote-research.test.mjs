import {EventEmitter} from 'node:events';import {writeFile} from 'node:fs/promises';import {codexAnalyze} from '../remote/native-codex.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {mkdtemp,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import worker,{readState,writeState} from '../backend/worker.mjs';import {initializePublicDB} from '../backend/public-data.mjs';import {remoteMachine,remoteOwner,hash} from '../backend/remote-research.mjs';import {analyze,documents,sourceURL,loadIdentity,RemoteRunner} from '../remote/engine.mjs';
const now=new Date('2026-11-08T08:00:00Z'),site='https://site.test',token='A'.repeat(43);
function db(){const sql=new DatabaseSync(':memory:');return {prepare(text){return {bind(...args){return {async run(){const s=sql.prepare(text);return {results:s.columns().length?s.all(...args):(s.run(...args),[])}}}}}},async batch(items){sql.exec('BEGIN');try{const results=[];for(const s of items)results.push(await s.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}}}
const stock=()=>({id:crypto.randomUUID(),market:'美股',symbol:'AMZN',name:'my custom name',watch:true,notes:'SECRET PERSONAL NOTE',price:123,research:{thesis:'PRIVATE THESIS'}});
const data={market:'美股',symbol:'AMZN',companyName:'Amazon test',filings:[{title:'10-Q',form:'10-Q',periodEnd:'2026-09-30',date:'2026-10-30',url:'https://www.sec.gov/Archives/edgar/data/1018724/000101872426000040/amzn.htm'}]};
const report=()=>({market:'美股',symbol:'AMZN',companyName:'Amazon test',instrumentType:'company',business:'business fixture',periodEnd:'2026-09-30',sections:Array.from({length:6},()=>({summary:'事實：fixture',support:'evidence',counter:'risk',unknown:'未知',sourceIds:['S1']})),sources:[{id:'S1',title:'Official filing',url:data.filings[0].url}]});
async function setup(){const env={DB:db(),SITE_PASSWORD:'fixture-only-long-password'};await initializePublicDB(env.DB);await readState(env.DB,'personal');await writeState(env.DB,'personal',{revision:0,stocks:[stock()]});await env.DB.prepare('INSERT INTO public_stocks(stock_key,data_json,checked_at,last_success,state) VALUES (?,?,?,?,?)').bind('美股:AMZN',JSON.stringify(data),now.toISOString(),now.toISOString(),'ok').run();for(const id of ['fed','cpi','employment','fx','exports','news-fed','news-eu'])await env.DB.prepare('INSERT INTO public_sources(source_id,label,state,last_attempt,last_success) VALUES (?,?,?,?,?)').bind(id,id,'ok',now.toISOString(),now.toISOString()).run();return env}
function request(path,body,t=token){return new Request(site+'/api/remote/'+path,{method:body?'POST':'GET',headers:{Origin:site,Authorization:'Bearer '+t,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}
const machine=(env,path,body,t=token,time=now)=>remoteMachine(request(path,body,t),env,{now:time});
async function pair(env){await remoteOwner(request('pair/approve',{tokenHash:await hash(token)}),env,{now})}
async function claim(env){const work=await machine(env,'work');assert.equal(work.complete,true);const item=work.candidates[0];return machine(env,'claim',{market:'美股',symbol:'AMZN',fingerprint:item.fingerprint})}
test('unapproved and revoked devices cannot read evidence or submit reports; browser approval requires login and same origin',async()=>{
 const env=await setup();await assert.rejects(machine(env,'work'),/授權/);const payload={tokenHash:await hash(token)};
 const r=await worker.fetch(request('pair/approve',payload),env);assert.equal(r.status,401);
 const cross=await worker.fetch(new Request(site+'/api/remote/pair/approve',{method:'POST',headers:{Origin:'https://other.test'},body:JSON.stringify(payload)}),env);assert.equal(cross.status,403);
 await pair(env);await assert.rejects(machine(env,'work',undefined,'B'.repeat(43)),/授權/);const state=await remoteOwner(request('status'),env,{now});await remoteOwner(request('revoke',{deviceId:state.devices[0].id}),env,{now});await assert.rejects(machine(env,'work'),/授權/);
 assert.equal(JSON.stringify(state).includes(token),false);
});
test('remote evidence excludes private fields, waits for the full data batch and deduplicates unchanged filings',async()=>{
 const env=await setup();await pair(env);const work=await machine(env,'work');assert.equal(work.candidates.length,1);assert.ok(!JSON.stringify(work).includes('SECRET PERSONAL')&&!JSON.stringify(work).includes('PRIVATE THESIS')&&!JSON.stringify(work).includes('my custom name'));
 await env.DB.prepare('DELETE FROM public_sources WHERE source_id=?').bind('fx').run();const pending=await machine(env,'work');assert.equal(pending.complete,false);assert.deepEqual(pending.candidates,[]);
});
test('completed reports update only analysis, synchronize revision and do not re-run unchanged documents',async()=>{
 const env=await setup(),before=await readState(env.DB,'personal');await pair(env);const candidate=(await machine(env,'work')).candidates[0];const job=await claim(env);assert.ok(job.jobId);assert.equal((await machine(env,'claim',{market:'美股',symbol:'AMZN',fingerprint:candidate.fingerprint})).busy,true);
 const result=await machine(env,'result',{jobId:job.jobId,report:report()},token,new Date(now.getTime()+1000));assert.equal(result.ok,true);
 const after=await readState(env.DB,'personal');assert.equal(after.revision,before.revision+1);const {analysis,...fields}=after.stocks[0];assert.deepEqual(fields,before.stocks[0]);assert.equal(analysis.sections.length,6);assert.deepEqual((await machine(env,'work')).candidates,[]);
 await assert.rejects(machine(env,'result',{jobId:job.jobId,report:report()}),/失效/);
});
test('a deleted stock is never resurrected and a newer manual report is never overwritten',async()=>{
 for(const scenario of ['delete','newer']){const env=await setup();await pair(env);const job=await claim(env);const current=await readState(env.DB,'personal');await writeState(env.DB,'personal',{revision:current.revision,stocks:scenario==='delete'?[]:[{...current.stocks[0],analysis:{generatedAt:'2026-11-08T08:00:01.000Z',business:'NEWER MANUAL REPORT'}}]});const before=await readState(env.DB,'personal');await assert.rejects(machine(env,'result',{jobId:job.jobId,report:report()},token,new Date(now.getTime()+2000)),/未覆寫/);assert.deepEqual(await readState(env.DB,'personal'),before)}
});
test('bad identity, unsupported sources and failed model attempts preserve the existing stock',async()=>{
 const env=await setup();await pair(env);const job=await claim(env),before=await readState(env.DB,'personal');const wrong=report();wrong.symbol='MSFT';await assert.rejects(machine(env,'result',{jobId:job.jobId,report:wrong}),/身分/);await machine(env,'error',{jobId:job.jobId,error:'source unavailable'});assert.deepEqual(await readState(env.DB,'personal'),before);assert.equal((await machine(env,'work')).candidates.length,0);
 assert.equal(sourceURL('http://www.sec.gov/Archives/edgar/data/test'),null);assert.equal(sourceURL('https://www.sec.gov.attacker.test/Archives/edgar/data/test'),null);assert.equal(sourceURL('https://127.0.0.1/private'),null);
});
test('remote engine uses only fetched official documents and validates citations before upload',async()=>{
 let calls=0;const options={key:'fixture-secret',model:'fixture-authorized-model',modelBase:'https://provider.test/v1'},job={market:'美股',symbol:'AMZN',evidence:data};
 const fetcher=async(url,init)=>{calls++;if(url.startsWith('https://www.sec.gov/'))return new Response('<h1>Financial statement fixture</h1><p>'+('official public evidence '.repeat(20))+'</p>',{headers:{'Content-Type':'text/html'}});assert.equal(url,'https://provider.test/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer fixture-secret');const body=JSON.parse(init.body);assert.equal(body.model,'fixture-authorized-model');assert.ok(body.messages[1].content.includes('official public evidence'));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(report())}}]})};
 const result=await analyze(job,options,{fetcher});assert.equal(calls,2);assert.equal(result.sources.length,1);assert.equal(result.sources[0].url,data.filings[0].url);
 await assert.rejects(analyze(job,{...options,key:''},{fetcher:()=>assert.fail('no model call without authorization')}),/授權/);
 await assert.rejects(documents(job,async()=>new Response('forbidden',{status:403})),/原文/);
});
test('device identity persists privately and missing model authorization never invokes the model',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'stockfolio-remote-'));try{const a=await loadIdentity(directory),b=await loadIdentity(directory);assert.equal(a.token,b.token);assert.equal((await stat(join(directory,'remote-identity.json'))).mode&0o777,0o600);
 const env=await setup(),events=[];const runner=new RemoteRunner({site,dataDir:directory,key:'',model:'',modelBase:'https://provider.test/v1'},{now:()=>now,reporter:s=>events.push(s),fetcher:async(url,init)=>{assert.ok(url.startsWith(site));try{const result=await remoteMachine(new Request(url,init),env,{now});return Response.json(result)}catch(e){return Response.json({error:e.message},{status:e.status||500})}}});await runner.start();assert.equal(runner.state.phase,'awaiting_website_authorization');await remoteOwner(request('pair/approve',{tokenHash:await hash(runner.identity.token)}),env,{now});await runner.tick();assert.equal(runner.state.phase,'awaiting_model_authorization');assert.ok(!events.join('').includes(a.token));
 }finally{await rm(directory,{recursive:true,force:true})}
});

test('native Omni research keeps managed permissions, restricts tools and requires a completed source lookup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'stockfolio-native-'));try{
 const launcher=withSearch=>(binary,args,options)=>{assert.equal(binary,'codex');assert.ok(!args.includes('--model')&&!args.includes('--dangerously-bypass-approvals-and-sandbox'));assert.ok(args.includes('read-only')&&args.includes('on-request')&&args.includes('shell_tool'));const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};child.stdin={end(prompt){assert.ok(prompt.includes('AMZN')&&!prompt.includes('SECRET PERSONAL NOTE'));setTimeout(async()=>{await writeFile(args[args.indexOf('--output-last-message')+1],JSON.stringify(report()));if(withSearch)child.stdout.emit('data',Buffer.from(JSON.stringify({type:'item.completed',item:{type:'web_search'}})+'\n'));child.emit('exit',0)},0)}};return child};
 const result=await codexAnalyze({market:'美股',symbol:'AMZN',evidence:data},{dataDir:directory},{launch:launcher(true)});assert.equal(result.sections.length,6);
 await assert.rejects(codexAnalyze({market:'美股',symbol:'AMZN',evidence:data},{dataDir:directory},{launch:launcher(false)}),/查核紀錄/);
 }finally{await rm(directory,{recursive:true,force:true})}
});
