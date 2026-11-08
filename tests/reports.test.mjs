import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../public/reports.js';
const document=JSON.parse(fs.readFileSync(new URL('../public/reports/AMZN-2026-11-08.json',import.meta.url)));
const stock={id:'existing-id',market:'美股',symbol:'AMZN',name:'自訂名稱',notes:'my notes',research:{thesis:'my thesis'},watch:true};
const now=new Date(Math.max(Date.now(),Date.parse(document.report.generatedAt)+1000));
const apply=(doc,s=stock,options={})=>StockfolioReports.apply(doc,s,{now,...options});
test('completed report loads all six sections and preserves personal data',()=>{
 const next=apply(document);assert.equal(next.notes,stock.notes);assert.equal(next.research,stock.research);assert.equal(next.id,stock.id);assert.equal(next.watch,true);assert.equal(next.name,stock.name);assert.equal(next.analysis.sections.length,6);assert.equal(next.analysis.generatedAt,document.report.generatedAt);assert.equal(stock.analysis,undefined);
 assert.equal(apply(document,{...stock,name:'AMZN'}).name,'Amazon.com, Inc.');
});
test('wrong market or ticker, bad periods, future dates, missing evidence and unsafe URLs never replace a report',()=>{
 for(const mutate of [d=>d.symbol='MSFT',d=>d.market='台股',d=>d.type='backup',d=>d.report.periodEnd='2026-02-30',d=>d.report.generatedAt='2099-01-01T00:00:00Z',d=>d.report.sections.pop(),d=>d.report.sections[0].sourceIds=['unknown'],d=>d.report.sources[0].url='javascript:alert(1)',d=>d.report.sources[0].url='https://user:password@example.com',d=>d.report.sources[1].id='S1',d=>d.report.sections[0].summary='',d=>d.report.sections[0].summary='x'.repeat(12001)]){
  const bad=structuredClone(document);mutate(bad);assert.throws(()=>apply(bad));
 }
});
test('older imported report cannot overwrite newer account research',()=>{
 const current={...stock,analysis:{generatedAt:new Date(Date.parse(document.report.generatedAt)+1).toISOString()}};
 assert.throws(()=>apply(document,current),/較新/);assert.equal(apply(document,current,{allowOlder:true}).analysis.business,document.report.business);
});
test('catalog includes only valid, matching, independently loadable research files',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../public/reports/index.json',import.meta.url)));
 for(const entry of catalog.reports){assert.match(entry.file,/^reports\/[A-Za-z0-9_-]+\.json$/);const data=JSON.parse(fs.readFileSync(new URL('../public/'+entry.file,import.meta.url)));assert.doesNotThrow(()=>apply(data,{...stock,...entry}));}
});
