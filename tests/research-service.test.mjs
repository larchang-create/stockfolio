import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initializeDB} from '../backend/password-auth.mjs';
import {readState,writeState} from '../backend/worker.mjs';
import {researchConfig,checkResearch,runCompanyResearch} from '../backend/research-service.mjs';
const env={OPENAI_API_KEY:'fixture-api-key-not-real'};
function database(){const db=new DatabaseSync(':memory:');return {prepare(sql){return {bind(...args){return {async run(){const s=db.prepare(sql);return {results:s.columns().length?s.all(...args):(s.run(...args),[])}}}}}},async batch(items){db.exec('BEGIN');try{const results=[];for(const q of items)results.push(await q.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}}}
const raw=()=>({companyName:'Fixture Company',instrumentType:'company',business:'fixture business',periodEnd:'2026-09-30',sections:Array.from({length:6},()=>({summary:'事實：fixture',support:'fixture',counter:'fixture',unknown:'fixture',sourceIds:['S1']}))});
const envelope=(text,extra=[])=>({status:'completed',output:[...extra,{type:'message',content:[{type:'output_text',text}]}]});
function provider(){let count=0;return {get count(){return count},fetch:async(url,options)=>{count++;const body=JSON.parse(options.body);assert.equal(body.model,'gpt-5.4-mini');assert.equal(body.store,false);assert.deepEqual(body.reasoning,{effort:'low'});return Response.json(count%2===1?envelope('fixture financial evidence',[{type:'web_search_call',action:{sources:[{url:'https://www.sec.gov/fixture',title:'Fixture official filing'}]}}]):envelope(JSON.stringify(raw())))}}}
const input={market:'美股',symbol:'AMZN'};
test('one API key enables a default model; checking connection does not generate paid responses',async()=>{
 assert.deepEqual(researchConfig(env),{configured:true,model:'gpt-5.4-mini'});assert.equal(researchConfig({}).configured,false);
 const result=await checkResearch(env,async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/models/gpt-5.4-mini');assert.equal(options.body,undefined);return Response.json({id:'gpt-5.4-mini'})});assert.equal(result.connected,true);assert.ok(!JSON.stringify(result).includes(env.OPENAI_API_KEY));
 for(const status of [401,403,404,429])await assert.rejects(checkResearch(env,async()=>new Response('{}',{status})));
});
test('real SQLite cache stores a sourced report, preserves notes, and syncs it to other devices',async()=>{
 const DB=database(),settings={...env,DB},api=provider();await initializeDB(DB);await readState(DB,'personal');const stock={id:crypto.randomUUID(),...input,name:'AMZN',notes:'personal note',research:{thesis:'my thesis'}};await writeState(DB,'personal',{revision:0,stocks:[stock]});
 const report=await runCompanyResearch(settings,'personal',input,api.fetch);assert.equal(report.cached,false);assert.equal(api.count,2);
 const state=await readState(DB,'personal');assert.equal(state.revision,2);assert.equal(state.stocks[0].analysis.sections.length,6);assert.equal(state.stocks[0].research.thesis,'my thesis');assert.equal(state.stocks[0].notes,'personal note');assert.equal(state.stocks[0].name,'Fixture Company');
 const cached=await runCompanyResearch(settings,'personal',input,()=>assert.fail('cached report must not call provider'));assert.equal(cached.cached,true);assert.equal(cached.generatedAt,report.generatedAt);
 assert.equal((await writeState(DB,'personal',{revision:1,stocks:[stock]})).conflict,true);
});
test('parallel requests do not duplicate paid calls; failure releases the account lock',async()=>{
 const DB=database(),settings={...env,DB};await initializeDB(DB);let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const pending=runCompanyResearch(settings,'personal',input,async()=>{entered();await gate;return new Response('{}',{status:429})});await started;
 await assert.rejects(runCompanyResearch(settings,'personal',{market:'台股',symbol:'2330'},()=>assert.fail('no concurrent provider call')),/正在執行/);release();await assert.rejects(pending,/額度/);
 const api=provider();assert.equal((await runCompanyResearch(settings,'personal',input,api.fetch)).sections.length,6);
});
test('expired cached reports are refreshed and malformed output never replaces prior notes',async()=>{
 const DB=database(),settings={...env,DB};await initializeDB(DB);await readState(DB,'personal');const stock={id:crypto.randomUUID(),...input,name:'AMZN',notes:'keep this'};await writeState(DB,'personal',{revision:0,stocks:[stock]});
 await DB.prepare('INSERT INTO research_reports VALUES (?,?,?,?,?)').bind('personal','美股:AMZN','gpt-5.4-mini',JSON.stringify({old:true}),'2020-01-01T00:00:00Z').run();
 await assert.rejects(runCompanyResearch(settings,'personal',input,async()=>Response.json(envelope('no cited sources'))));const state=await readState(DB,'personal');assert.equal(state.revision,1);assert.equal(state.stocks[0].notes,'keep this');assert.equal(state.stocks[0].analysis,undefined);
});
