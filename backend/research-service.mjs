import {ServiceError,researchCompany} from './research.mjs';
import {initializeDB} from './password-auth.mjs';
export const DEFAULT_RESEARCH_MODEL='gpt-5.4-mini';
export function researchConfig(env){const model=String(env.OPENAI_MODEL||DEFAULT_RESEARCH_MODEL).trim();return {configured:typeof env.OPENAI_API_KEY==='string'&&!!env.OPENAI_API_KEY.trim(),model}}
export async function checkResearch(env,fetcher=fetch){
 const config=researchConfig(env);if(!config.configured)throw new ServiceError('尚未設定 OPENAI_API_KEY；請在 Cloudflare Builds 新增同名 Secret，再重新部署。',503);
 let response;try{response=await fetcher('https://api.openai.com/v1/models/'+encodeURIComponent(config.model),{headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},signal:AbortSignal.timeout(15000),redirect:'error'})}catch{throw new ServiceError('暫時無法連接 OpenAI，請稍後重試。',503)}
 if(response.status===401)throw new ServiceError('OpenAI 金鑰無效或已撤銷，請更新 OPENAI_API_KEY 後重新部署。',503);
 if(response.status===403||response.status===404)throw new ServiceError('API 專案無權使用設定的模型，請確認模型與專案權限。',503);
 if(!response.ok)throw new ServiceError('OpenAI 暫時無法確認模型，請稍後重試。',503);
 return {...config,connected:true,note:'金鑰與模型連線正常；搜尋及額度仍需以首次分析確認。本檢查不產生研究報告。'};
}
export async function runCompanyResearch(env,owner,input,fetcher=fetch){
 const config=researchConfig(env);if(!config.configured)throw new ServiceError('研究服務尚未設定；名單及筆記同步不受影響。請至「我的帳號」查看研究服務設定。',503);
 await initializeDB(env.DB);const db=env.DB,key=input.market+':'+input.symbol;
 const previous=await db.prepare('SELECT report_json FROM research_reports WHERE owner_id=? AND stock_key=? AND model=? AND generated_at>?').bind(owner,key,config.model,new Date(Date.now()-21600000).toISOString()).run();
 if(previous.results.length)return {...JSON.parse(previous.results[0].report_json),cached:true};
 const job=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
 const acquired=await db.prepare('INSERT INTO research_lock(owner_id,job_id,lease_until) VALUES (?,?,?) ON CONFLICT(owner_id) DO UPDATE SET job_id=excluded.job_id,lease_until=excluded.lease_until WHERE research_lock.lease_until<=? RETURNING job_id').bind(owner,job,now+400,now).run();
 if(!acquired.results.length)throw new ServiceError('已有一份研究正在執行，請等完成後再試，避免重複付費。',429);
 try{
  // Recheck the durable cache after acquiring the account-wide lease.
  const cached=await db.prepare('SELECT report_json FROM research_reports WHERE owner_id=? AND stock_key=? AND model=? AND generated_at>?').bind(owner,key,config.model,new Date(Date.now()-21600000).toISOString()).run();
  if(cached.results.length)return {...JSON.parse(cached.results[0].report_json),cached:true};
  const report=await researchCompany({...env,OPENAI_MODEL:config.model},input,fetcher),json=JSON.stringify(report);
  await db.batch([
   db.prepare('INSERT INTO research_reports(owner_id,stock_key,model,report_json,generated_at) VALUES (?,?,?,?,?) ON CONFLICT(owner_id,stock_key,model) DO UPDATE SET report_json=excluded.report_json,generated_at=excluded.generated_at').bind(owner,key,config.model,json,report.generatedAt),
   db.prepare("UPDATE sync_stocks SET data_json=json_set(data_json,'$.analysis',json(?),'$.name',CASE WHEN json_extract(data_json,'$.name')=? THEN ? ELSE json_extract(data_json,'$.name') END) WHERE owner_id=? AND stock_key=?").bind(json,input.symbol,report.companyName,owner,key),
   db.prepare('UPDATE sync_accounts SET revision=revision+1,mutation_id=?,updated_at=? WHERE owner_id=? AND EXISTS(SELECT 1 FROM sync_stocks WHERE owner_id=? AND stock_key=?)').bind(job,report.generatedAt,owner,owner,key)
  ]);
  return {...report,cached:false};
 }finally{await db.prepare('DELETE FROM research_lock WHERE owner_id=? AND job_id=?').bind(owner,job).run()}
}
