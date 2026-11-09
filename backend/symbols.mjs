import {initializePublicDB} from './public-data.mjs';
import {ServiceError} from './research.mjs';
const sources=[
 ['https://openapi.twse.com.tw/v1/opendata/t187ap03_L','profile'],
 ['https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O','profile'],
 ['https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL','quote'],
 ['https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes','otc']
];
export function parseSymbols(rows,type){
 if(!Array.isArray(rows)||!rows.length)throw Error('官方代號清單格式異常');
 const out={};for(const r of rows){const code=String(r['公司代號']||r.CompanyCode||r.Code||r.SecuritiesCompanyCode||'').trim(),name=String(r['公司簡稱']||r.CompanyAbbreviation||r.CompanyName||r['公司名稱']||r.Name||r.CompanyName||r.SecuritiesCompanyName||'').trim();if(/^\d{4,6}[A-Z]?$/.test(code)&&name)out[code]=name.slice(0,80)}
 if(!Object.keys(out).length)throw Error('官方代號清單為空');return out;
}
export async function validateTaiwanSymbols(env,symbols,{fetcher=fetch,now=new Date()}={}){
 if(!Array.isArray(symbols)||!symbols.length||symbols.length>200||symbols.some(s=>typeof s!=='string'||!/^\d{4,6}[A-Z]?$/.test(s)))throw new ServiceError('請輸入有效的台股代號格式。',400);
 await initializePublicDB(env.DB);const results=await Promise.allSettled(sources.map(async([url,type],i)=>{
  const key='symbol-catalog-'+i,old=(await env.DB.prepare('SELECT data_json,updated_at FROM public_cache WHERE cache_key=?').bind(key).run()).results[0];
  if(old&&now.getTime()-Date.parse(old.updated_at)<21600000)return JSON.parse(old.data_json);
  const r=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'Stockfolio public symbol validation/1.0'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('官方清單暫時無法讀取');const raw=await r.text();if(raw.length>4000000)throw Error('官方清單過大');const data=parseSymbols(JSON.parse(raw),type);
  await env.DB.prepare('INSERT INTO public_cache(cache_key,data_json,updated_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at').bind(key,JSON.stringify(data),now.toISOString()).run();return data;
 }));
 const catalog=Object.assign({},...results.filter(x=>x.status==='fulfilled').map(x=>x.value)),complete=results.every(x=>x.status==='fulfilled'),valid=[],invalid=[],unverified=[];
 for(const symbol of [...new Set(symbols)]){if(catalog[symbol])valid.push({symbol,name:catalog[symbol]});else(complete?invalid:unverified).push(symbol)}
 return {valid,invalid,unverified,checkedAt:now.toISOString()};
}
