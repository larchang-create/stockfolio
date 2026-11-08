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
