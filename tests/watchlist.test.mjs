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
