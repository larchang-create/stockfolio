import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import '../public/macro.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/macro-data.json',import.meta.url)));const now=new Date('2026-11-08T12:00:00Z');
test('published snapshot has sourced data with distinct reference and publication dates',()=>{
 const d=StockfolioMacro.validate(data,now);assert.equal(d.indicators.length,6);assert.equal(d.events.length,3);assert.equal(d.indicators.find(x=>x.id==='unemployment').periodEnd,'2026-10-31');assert.equal(d.indicators.find(x=>x.id==='unemployment').publishedAt,'2026-11-06');assert.equal(d.events.find(x=>x.id==='china-technology').stage,'consultation');
});
test('related-company filters use market and exact symbol and exclude unwatched stocks',()=>{
 const d=StockfolioMacro.validate(data,now);const stocks=[{market:'美股',symbol:'AMZN',watch:true},{market:'美股',symbol:'XOM',watch:false},{market:'台股',symbol:'NVDA',watch:true}];
 assert.equal(StockfolioMacro.filter(d.events,{topic:'科技管制',onlyRelated:true,stocks}).length,1);assert.equal(StockfolioMacro.filter(d.events,{topic:'地緣風險',onlyRelated:true,stocks}).length,0);assert.equal(StockfolioMacro.filter(d.events,{onlyRelated:true,stocks:[]}).length,0);
});
test('invalid dates, unsafe citations, unknown source IDs and nonnumeric charts are rejected',()=>{
 for(const edit of [d=>d.checkedAt='2099-01-01',d=>d.sources[0].url='javascript:alert(1)',d=>d.indicators[0].publishedAt='2026-02-30',d=>d.events[0].sourceIds=['missing'],d=>d.indicators[3].history[0].value='oops',d=>d.indicators[3].history.reverse(),d=>d.events[0].stage='rumor',d=>d.events[1].targets[0].symbol='bad<>']){const d=structuredClone(data);edit(d);assert.throws(()=>StockfolioMacro.validate(d,now));}
});
test('charts are drawn only from real points, with dates and accessible numeric labels',()=>{
 const h=data.indicators.find(x=>x.id==='usd-twd').history;const svg=StockfolioMacro.sparkline(h);assert.match(svg,/role="img"/);assert.match(svg,/32.768/);assert.match(svg,/2026-11-06/);assert.equal(StockfolioMacro.sparkline([]),'');assert.equal(StockfolioMacro.sparkline(h.slice(0,1)),'');
});
