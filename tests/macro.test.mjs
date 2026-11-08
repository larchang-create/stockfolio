import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import '../public/macro.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/macro-data.json',import.meta.url)));const now=new Date('2026-11-08T12:00:00Z');
test('published snapshot has sourced data with distinct reference and publication dates',()=>{
 const d=StockfolioMacro.validate(data,now);assert.equal(d.indicators.length,6);assert.equal(d.events.length,4);assert.equal(d.indicators.find(x=>x.id==='unemployment').periodEnd,'2026-10-31');assert.equal(d.indicators.find(x=>x.id==='unemployment').publishedAt,'2026-11-06');assert.equal(d.events.find(x=>x.id==='china-technology').stage,'consultation');
});
test('related-company filters use market and exact symbol and exclude unwatched stocks',()=>{
 const d=StockfolioMacro.validate(data,now);const stocks=[{market:'美股',symbol:'AMZN',watch:true},{market:'美股',symbol:'XOM',watch:false},{market:'台股',symbol:'NVDA',watch:true}];
 assert.equal(StockfolioMacro.filter(d.events,{topic:'科技管制',onlyRelated:true,stocks}).length,1);assert.equal(StockfolioMacro.filter(d.events.filter(e=>e.id==='eu-russia'),{topic:'地緣風險',onlyRelated:true,stocks}).length,0);assert.equal(StockfolioMacro.filter(d.events,{onlyRelated:true,stocks:[]}).length,0);
});
test('invalid dates, unsafe citations, unknown source IDs and nonnumeric charts are rejected',()=>{
 for(const edit of [d=>d.checkedAt='2099-01-01',d=>d.sources[0].url='javascript:alert(1)',d=>d.indicators[0].publishedAt='2026-02-30',d=>d.events[0].sourceIds=['missing'],d=>d.indicators[3].history[0].value='oops',d=>d.indicators[3].history.reverse(),d=>d.events[0].stage='rumor',d=>d.events.find(e=>e.id==='china-technology').targets[0].symbol='bad<>']){const d=structuredClone(data);edit(d);assert.throws(()=>StockfolioMacro.validate(d,now));}
});
test('charts are drawn only from real points, with dates and accessible numeric labels',()=>{
 const h=data.indicators.find(x=>x.id==='usd-twd').history;const svg=StockfolioMacro.sparkline(h);assert.match(svg,/role="img"/);assert.match(svg,/32.768/);assert.match(svg,/2026-11-06/);assert.equal(StockfolioMacro.sparkline([]),'');assert.equal(StockfolioMacro.sparkline(h.slice(0,1)),'');
});
test('event briefs validate paths, source provenance and independent analysis dates',()=>{
 const d=StockfolioMacro.validate(data,now),e=d.events.find(e=>e.id==='middle-east-energy');assert.equal(e.paths.length,5);assert.equal(e.date,'2026-11-03');assert.equal(e.updatedAt,'2026-11-08');assert.equal(d.eventsReviewedAt,'2026-11-08');
 for(const edit of [e=>e.updatedAt='2099-01-01',e=>e.updatedAt='2026-11-01',e=>e.importance='invented',e=>e.paths[0].nodes.pop(),e=>e.paths[1].id=e.paths[0].id,e=>e.paths[0].targets[0].symbol='bad<>',e=>e.paths[0].checks=[]]){const raw=structuredClone(data);edit(raw.events[0]);assert.throws(()=>StockfolioMacro.validate(raw,now))}
});
test('focus events are recent, sparse days are not padded and breaking events exceed the regular cap',()=>{
 const e=StockfolioMacro.validate(data,now).events[0],events=Array.from({length:8},(_,i)=>({...e,id:'event-'+i,importance:i<6?'major':'normal'}));
 const grouped=StockfolioMacro.groupEvents(events,{now});assert.equal(grouped.focus.length,6);assert.equal(grouped.ongoing.length,2);
 const sparse=StockfolioMacro.groupEvents(StockfolioMacro.validate(data,now).events,{now});assert.equal(sparse.focus.length,1);assert.equal(sparse.ongoing.length,2);assert.equal(sparse.other.length,1);
 const tomorrow=StockfolioMacro.groupEvents([e],{now:new Date('2026-11-12T12:00:00Z')});assert.equal(tomorrow.focus.length,0);assert.equal(tomorrow.ongoing.length,1);
});
test('a developing event occupies one card and only actual watched tickers are linked to each path',()=>{
 const e=StockfolioMacro.validate(data,now).events[0],stocks=[{market:'美股',symbol:'MSFT',watch:true},{market:'美股',symbol:'AMZN',watch:true}];
 assert.equal(StockfolioMacro.groupEvents([e,e],{now}).focus.length,1);
 assert.deepEqual(StockfolioMacro.related(e.paths.find(p=>p.id==='energy'),stocks),[]);assert.equal(StockfolioMacro.related(e.paths.find(p=>p.id==='tech'),stocks).length,2);
 const older={...e,id:'older',updatedAt:'2026-11-05'},unrelated={...e,id:'unrelated',importance:'normal',allStocks:false,targets:[]},direct={...unrelated,id:'direct',targets:[{market:'美股',symbol:'MSFT'}]};
 assert.equal(StockfolioMacro.groupEvents([unrelated,direct],{now,stocks}).focus[0].id,'direct');assert.equal(StockfolioMacro.groupEvents([older],{now}).ongoing.length,1);
});
