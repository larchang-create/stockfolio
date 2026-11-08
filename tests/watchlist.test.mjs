import test from 'node:test';import assert from 'node:assert/strict';import '../public/watchlist.js';
const {parse,plan}=StockfolioWatchlist;
const create=x=>({...x,id:'new:'+x.symbol});
test('batch parses Western and Chinese commas, whitespace, newlines and preserves Taiwan leading zeros',()=>{
 assert.deepEqual(parse('美股',' msft,AMZN，aapl、BRK.B\nBRK-B, MSFT,'),{symbols:['MSFT','AMZN','AAPL','BRK.B','BRK-B'],repeated:1});
 assert.deepEqual(parse('台股','0050, 2330，006208'),{symbols:['0050','2330','006208'],repeated:0});
});
test('batch merge skips duplicates, restores watch flag and preserves existing notes, analysis and research',()=>{
 const old={market:'美股',symbol:'MSFT',watch:true,id:'same',notes:'keep',research:{thesis:'keep'},analysis:{business:'keep'}};
 const unwatch={market:'美股',symbol:'AMZN',watch:false,id:'restore',notes:'also keep'};
 const original=[old,unwatch,{market:'台股',symbol:'2330',watch:true}];
 const r=plan(original,'美股','MSFT,AMZN,AAPL,AAPL',create);assert.equal(r.added,1);assert.equal(r.restored,1);assert.equal(r.skipped,2);assert.equal(r.stocks[0],old);assert.deepEqual(r.stocks[1],{...unwatch,watch:true});assert.equal(unwatch.watch,false);assert.equal(original.length,3);assert.equal(r.stocks[3].symbol,'AAPL');
});
test('invalid or oversized batch is rejected before creating any stock',()=>{
 for(const [market,raw] of [['美股','MSFT,2330'],['台股','2330,AAPL'],['美股',',， '],['美股',Array(201).fill('MSFT').join(',')],['unknown','MSFT']]){
  let called=0;assert.throws(()=>plan([],market,raw,()=>called++));assert.equal(called,0);
 }
});
test('Amazon input aliases resolve to AMZN and cannot create another company record',()=>{
 assert.deepEqual(parse('美股','AMZN,Amazon,AMAZON.COM'),{symbols:['AMZN'],repeated:2});
 const original={id:'old',market:'美股',symbol:'AMAZON',name:'Amazon',watch:true,notes:'keep'};
 const result=plan([original],'美股','AMZN',create);assert.equal(result.added,0);assert.equal(result.corrected,1);assert.equal(result.skipped,0);assert.equal(result.stocks[0].symbol,'AMZN');assert.equal(result.stocks[0].id,'old');assert.equal(result.stocks[0].notes,'keep');assert.equal(original.symbol,'AMAZON');
 const both=[original,{...original,id:'canonical',symbol:'AMZN'}];assert.equal(plan(both,'美股','Amazon',create).stocks.length,2);
});
test('existing Amazon duplicates merge notes, drafts and latest report while archiving both originals',()=>{
 const a={id:'a',market:'美股',symbol:'AMZN',name:'My Amazon',watch:true,notes:'canonical note',history:[{date:'2026-11-01',notes:'first review'}],research:{thesis:'first thesis',sections:[{summary:'first business',asOf:'2026-09-30'}]},analysis:{generatedAt:'2026-11-01T00:00:00Z',business:'old report'}};
 const b={id:'b',market:'美股',symbol:'AMAZON',name:'Amazon',watch:false,notes:'alias note',history:[{date:'2026-11-02',notes:'second review'}],research:{thesis:'second thesis',sections:[{summary:'second business',asOf:'2026-06-30'}]},analysis:{generatedAt:'2026-11-08T00:00:00Z',business:'new report'}};
 const before=structuredClone([a,b]);const result=StockfolioWatchlist.mergeDuplicates([a,b],b);
 assert.equal(result.stocks.length,1);const s=result.stock;assert.equal(s.symbol,'AMZN');assert.equal(s.id,a.id);assert.equal(s.name,'My Amazon');assert.match(s.notes,/canonical note/);assert.match(s.notes,/alias note/);assert.match(s.research.thesis,/first thesis/);assert.match(s.research.thesis,/second thesis/);assert.match(s.research.sections[0].summary,/second business/);assert.equal(s.research.sections[0].asOf,'');assert.equal(s.history.length,2);assert.equal(s.analysis.business,'new report');assert.deepEqual(s.duplicateArchive,before);assert.deepEqual([a,b],before);
});
test('merging unrelated records or oversized notes refuses without altering any data',()=>{
 const a={id:'a',market:'美股',symbol:'AMZN',name:'AMZN',notes:'a'.repeat(5000)};
 assert.throws(()=>StockfolioWatchlist.mergeDuplicates([a,{...a,id:'b',symbol:'MSFT'}],a));
 const b={...a,id:'b',symbol:'AMAZON',notes:'b'.repeat(5000)};assert.throws(()=>StockfolioWatchlist.mergeDuplicates([a,b],a),/長度/);assert.equal(a.symbol,'AMZN');assert.equal(b.symbol,'AMAZON');
});
