// Optional read-only live-source check on GitHub's runner. Uses only fixed public examples.
import {DatabaseSync} from 'node:sqlite';
import {readState,writeState} from '../backend/worker.mjs';
import {initializeDB} from '../backend/password-auth.mjs';
import {runPublicCycle,publicStatus,publicStocks} from '../backend/public-data.mjs';
const sqlite=new DatabaseSync(':memory:');
const DB={prepare(sql){return {bind(...args){return {async run(){const s=sqlite.prepare(sql);return {results:s.columns().length?s.all(...args):(s.run(...args),[])}}}}}},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const q of statements)result.push(await q.run());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}}};
await initializeDB(DB);await readState(DB,'personal');
await writeState(DB,'personal',{revision:0,stocks:[['美股','AMZN'],['台股','2330'],['台股','0050']].map(([market,symbol])=>({id:crypto.randomUUID(),market,symbol,name:symbol,watch:true,notes:''}))});
for(let i=0;i<12;i++)await runPublicCycle({DB});
const status=await publicStatus({DB}),stocks=await publicStocks({DB});
console.log('LIVE_PUBLIC_SOURCE_RESULTS '+JSON.stringify({sources:status.sources.map(s=>({id:s.id,state:s.state,error:s.error||null})),examples:stocks.stocks.map(s=>({symbol:s.key,state:s.state,error:s.error,filings:s.data?.filings?.length||0,quoteDate:s.data?.quote?.date||null}))}));
if(status.sources.every(s=>s.state!=='ok'))process.exitCode=1;
for(const [id,url] of [['tw-announcement-shape','https://openapi.twse.com.tw/v1/opendata/t187ap04_L'],['tw-financial-shape','https://openapi.twse.com.tw/v1/opendata/t187ap14_L'],['eu-feed-shape','https://www.consilium.europa.eu/en/rss/pressreleases.ashx']]){
 try{const response=await fetch(url,{signal:AbortSignal.timeout(8000)});const body=await response.text();let shape;if(id==='eu-feed-shape'){shape=body.match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/i)?.[0]?.slice(0,2600)||body.slice(0,1200)}else{const data=JSON.parse(body);shape={keys:Object.keys(data[0]||{}),rows:data.length,has2330:data.some(r=>String(r['公司代號']||'').trim()==='2330')}}console.log('PUBLIC_SOURCE_SHAPE '+id+' '+JSON.stringify(shape))}catch(error){console.log('PUBLIC_SOURCE_SHAPE '+id+' '+error.message)}
}
