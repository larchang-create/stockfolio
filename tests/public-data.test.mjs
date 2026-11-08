import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import worker,{readState,writeState} from '../backend/worker.mjs';
import {initializeDB} from '../backend/password-auth.mjs';
import {initializePublicDB,runPublicCycle,refreshStock,publicMacro,publicStocks,publicStatus,PUBLIC_CRON} from '../backend/public-data.mjs';
import {parseCPI,parseEmployment,parsePolicy,parseFX,parseExports,parseFeed,parseSEC,parseTWQuote,latestExportsURL,rocDate} from '../backend/public-data-parsers.mjs';
function database(){const db=new DatabaseSync(':memory:');return {db,prepare(sql){return {bind(...args){return {async run(){const s=db.prepare(sql);return {results:s.columns().length?s.all(...args):(s.run(...args),[])}}}}}},async batch(items){db.exec('BEGIN');try{const results=[];for(const q of items)results.push(await q.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}}}
const now=new Date('2026-11-08T00:00:00Z');
const cpi='<h1>CONSUMER PRICE INDEX - SEPTEMBER 2026</h1><p>Transmission embargoed until October 14, 2026</p><p>The all items index increased 3.7 percent before seasonal adjustment. The all items less food and energy index rose 2.6 percent over the year.</p>';
const employment='<p>Transmission embargoed until November 6, 2026</p><h1>THE EMPLOYMENT SITUATION - OCTOBER 2026</h1><p>The unemployment rate changed little at 4.1 percent.</p>';
const policy='<time>October 28, 2026</time><p>Maintain the target range for the federal funds rate at 3-3/4 to 4 percent.</p>';
const fx='<table><tr><td>2026/11/06</td><td>32.768</td></tr><tr><td>2026/11/05</td><td>32.876</td></tr></table>';
const exportsPage='<h1>115年9月海關進出口貿易初步統計</h1><p>發布日期：115年10月8日</p><p>一、出口：9月出口872.2億美元，較上年同月增60.9%</p>';
const sec={cik:1018724,name:'Amazon fixture',tickers:['AMZN'],filings:{recent:{form:['10-Q','8-K'],filingDate:['2026-10-30','2026-10-29'],reportDate:['2026-09-30','2026-10-29'],accessionNumber:['0001018724-26-000040','0001018724-26-000039'],primaryDocument:['amzn-20260930.htm','earnings.htm']}}};
function fixtureProvider(){const calls=[];return {calls,fetch:async(url,options)=>{calls.push(url);assert.ok(!url.includes('openai')&&!url.includes('generativelanguage'));assert.ok(options.headers['User-Agent'].includes('Stockfolio'));if(url.includes('2026-press-fomc'))return new Response('<a href="monetary20261028a.htm">latest</a>');if(url.includes('monetary20261028a'))return new Response(policy);if(url.includes('/cpi.htm'))return new Response(cpi);if(url.includes('/empsit.htm'))return new Response(employment);if(url.includes('cbc.gov.tw'))return new Response(fx);if(url==='https://www.mof.gov.tw/')return new Response('<a href="/singlehtml/test?cntId=release">115年9月海關進出口貿易初步統計</a>');if(url.includes('/singlehtml/'))return new Response(exportsPage);if(url.includes('company_tickers'))return Response.json({0:{ticker:'AMZN',cik_str:1018724}});if(url.includes('submissions/CIK'))return Response.json(sec);if(url.includes('/feeds/')||url.includes('pressreleases.ashx'))return new Response('<rss><channel><item><title>Official fixture release</title><link>'+(url.includes('consilium')?'https://www.consilium.europa.eu/en/press/fixture/':'https://www.federalreserve.gov/newsevents/fixture.htm')+'</link><pubDate>Fri, 06 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>');if(url.includes('t187ap03'))return Response.json([{'公司代號':'2330','公司簡稱':'台積電 fixture'}]);if(url.includes('t187ap04'))return Response.json([{'公司代號':'2330','發言日期':'1151106','主旨':'Fixture company announcement'}]);if(url.includes('t187ap14'))return Response.json([{'公司代號':'2330','年度':'115','季別':'3','出表日期':'1151106'}]);if(url.includes('STOCK_DAY_ALL'))return Response.json([{Code:'2330',Name:'台積電 fixture',Date:'20261106',ClosingPrice:'1,000.00'},{Code:'0050',Name:'ETF fixture',Date:'20261106',ClosingPrice:'100.00'}]);throw Error('Unexpected fixture URL '+url)}}}
const stock=(symbol='AMZN',market='美股')=>({id:crypto.randomUUID(),market,symbol,name:symbol,watch:true,notes:'private note',research:{thesis:'private thesis'},analysis:{generatedAt:'2026-11-01T00:00:00Z',business:'existing report'}});
async function setup(stocks=[]){const DB=database();await initializeDB(DB);await readState(DB,'personal');await writeState(DB,'personal',{revision:0,stocks});return {DB,SITE_PASSWORD:'fixture-long-enough-password'}}
test('official parsers preserve dates, units and actual figures without AI',()=>{
 assert.deepEqual(parseCPI(cpi).map(x=>x.value),['3.7','2.6']);assert.equal(parseCPI(cpi)[0].periodEnd,'2026-09-30');assert.equal(parseCPI(cpi)[0].publishedAt,'2026-10-14');assert.equal(parseEmployment(employment)[0].value,'4.1');assert.equal(parsePolicy(policy)[0].value,'3.75–4.00');assert.equal(parseFX(fx)[0].value,'32.768');assert.match(parseFX(fx)[0].comparison,/升值/);assert.equal(parseExports(exportsPage)[0].value,'60.9');assert.equal(rocDate('1151106'),'2026-11-06');assert.throws(()=>parseCPI('missing data'));assert.throws(()=>rocDate('1150230'));assert.throws(()=>parseTWQuote([{Code:'2330',ClosingPrice:'100'}],'2330','https://example.org'));
});
test('source links, report identity and RSS dates cannot be injected or invented',()=>{
 assert.equal(parseSEC(sec,'AMZN',now).filings.length,2);assert.throws(()=>parseSEC(sec,'MSFT',now));const malicious=structuredClone(sec);malicious.filings.recent.primaryDocument[0]='../../secret';assert.equal(parseSEC(malicious,'AMZN',now).filings.length,1);
 assert.throws(()=>latestExportsURL('<a href="https://attacker.test">115年9月海關進出口貿易初步統計</a>'));
 assert.throws(()=>parseFeed('<html>not feed</html>',{hosts:['example.org']},now));assert.throws(()=>parseFeed('<rss><item><title>bad</title><link>javascript:alert(1)</link><pubDate>2026-11-06</pubDate></item></rss>',{hosts:['example.org']},now));
});
test('scheduled rotations persist official data without touching any private stock fields or revision',async()=>{
 const s=stock(),env=await setup([s]),provider=fixtureProvider();const before=await readState(env.DB,'personal');
 for(let i=0;i<12;i++)await runPublicCycle(env,{fetcher:provider.fetch,now:new Date(now.getTime()+i*900000),trigger:'cron'});
 const after=await readState(env.DB,'personal');assert.deepEqual(after,before);
 const macro=await publicMacro(env);assert.equal(macro.sync.enabled,true);assert.equal(macro.sync.cron,PUBLIC_CRON);assert.ok(macro.sync.lastCronRun);assert.ok(macro.announcements.length>=2);assert.ok(macro.sync.sources.every(s=>s.state==='ok'));
 const records=await publicStocks(env);assert.equal(records.stocks[0].data.filings[0].form,'10-Q');assert.equal(records.stocks[0].state,'ok');assert.equal(JSON.stringify(records).includes('private note'),false);assert.ok(provider.calls.every(url=>!url.includes('/responses')));
});
test('failed source refresh retains last good company data and reports the failed attempt',async()=>{
 const env=await setup([stock()]),provider=fixtureProvider();await refreshStock(env,{market:'美股',symbol:'AMZN'},{fetcher:provider.fetch,now});const good=(await publicStocks(env)).stocks[0];
 const later=new Date(now.getTime()+86400000);await refreshStock(env,{market:'美股',symbol:'AMZN'},{fetcher:async()=>new Response('rate limited',{status:429}),now:later,force:true});
 const bad=(await publicStocks(env)).stocks[0];assert.equal(bad.state,'error');assert.deepEqual(bad.data,good.data);assert.equal(bad.lastSuccess,good.lastSuccess);assert.match(bad.error,/429/);
});
test('unwatched, deleted and unknown stocks cannot overwrite or reappear in the private watchlist',async()=>{
 const s=stock(),env=await setup([s]),provider=fixtureProvider();await refreshStock(env,{market:'美股',symbol:'AMZN'},{fetcher:provider.fetch,now});await writeState(env.DB,'personal',{revision:1,stocks:[]});assert.deepEqual((await publicStocks(env)).stocks,[]);await assert.rejects(refreshStock(env,{market:'美股',symbol:'AMZN'},{fetcher:provider.fetch,now}),/觀察名單/);
});
test('Taiwan company records contain original announcements, financial index and dated closing quote',async()=>{
 const env=await setup([stock('2330','台股')]),provider=fixtureProvider();const result=await refreshStock(env,{market:'台股',symbol:'2330'},{fetcher:provider.fetch,now});assert.equal(result.state,'ok');assert.equal(result.stock.quote.price,1000);assert.equal(result.stock.quote.date,'2026-11-06');assert.equal(result.stock.filings.length,2);assert.ok(result.stock.filings.every(x=>x.url.startsWith('https://openapi.twse.com.tw/')));assert.equal(result.stock.filings.find(x=>x.form==='財報彙總').dateLabel,'出表日');
});
test('concurrent stock refreshes are deduplicated and recent data is reused',async()=>{
 const env=await setup([stock()]),provider=fixtureProvider();let resume;const paused=new Promise(r=>resume=r);let entered;const began=new Promise(r=>entered=r);const first=refreshStock(env,{market:'美股',symbol:'AMZN'},{now,fetcher:async(...args)=>{entered();await paused;return provider.fetch(...args)}});await began;const second=await refreshStock(env,{market:'美股',symbol:'AMZN'},{now,fetcher:provider.fetch});assert.equal(second.state,'running');resume();await first;const count=provider.calls.length;assert.equal((await refreshStock(env,{market:'美股',symbol:'AMZN'},{now,fetcher:provider.fetch,force:true})).cached,true);assert.equal(provider.calls.length,count);
});
test('public-data APIs require login and same-origin mutations; scheduled handler is declared',async()=>{
 const env=await setup();for(const path of ['/api/public-data/status','/api/public-data/macro','/api/public-data/stocks'])assert.equal((await worker.fetch(new Request('https://site.test'+path),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://site.test/api/public-data/refresh',{method:'POST',headers:{Origin:'https://other.test'},body:'{}'}),env)).status,403);assert.equal(typeof worker.scheduled,'function');
});
test('actual scheduled handler runs the collector with the event clock and leaves user data unchanged',async()=>{
 const env=await setup([stock()]),provider=fixtureProvider(),before=await readState(env.DB,'personal'),original=globalThis.fetch;
 try{globalThis.fetch=provider.fetch;await worker.scheduled({scheduledTime:now.getTime(),cron:PUBLIC_CRON},env)}finally{globalThis.fetch=original}
 const status=await publicStatus(env);assert.equal(status.lastCronRun,now.toISOString());assert.deepEqual(await readState(env.DB,'personal'),before);assert.equal(status.sources.find(s=>s.id==='fed').state,'ok');
});
test('bad and future macro releases retain original data and surface the source error',async()=>{
 const env=await setup(),provider=fixtureProvider();await initializePublicDB(env.DB);const before=await publicMacro(env);
 await runPublicCycle(env,{fetcher:async()=>new Response('<a href="monetary20990101a.htm">future</a>'),now});
 const after=await publicMacro(env);assert.deepEqual(after.indicators,before.indicators);assert.equal(after.sync.sources.find(s=>s.id==='fed').state,'error');assert.equal(after.checkedAt,before.checkedAt);
});
