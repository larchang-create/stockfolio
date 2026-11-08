import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {passwordState} from '../backend/password-auth.mjs';
const project=dirname(dirname(fileURLToPath(import.meta.url)));
const site='https://stockfolio.larry17342.workers.dev';
function runWrangler(args,env){return new Promise((resolve,reject)=>{
 const childEnv={...env};delete childEnv.SITE_PASSWORD;delete childEnv.OPENAI_API_KEY;
 const child=spawn(process.platform==='win32'?'npx.cmd':'npx',['wrangler',...args],{cwd:project,env:childEnv,stdio:'inherit'});
 child.on('error',()=>reject(new Error('無法啟動網站部署工具。')));child.on('exit',code=>code===0?resolve():reject(new Error('Cloudflare 部署失敗，請查看上方建置紀錄；未宣告登入驗證成功。')));
})}
export async function verifySite({password,verifyResearch=false,verifyPublicData=false,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=8}){
 const call=(path,options={})=>fetcher(site+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Origin:site,...options.headers}});
 let ready=false;
 for(let attempt=0;attempt<attempts;attempt++){
  try{const res=await call('/api/setup');const state=res.ok?await res.json():null;ready=state?.passwordReady===true&&state?.databaseReady===true;if(ready)break}catch{}
  if(attempt+1<attempts)await sleep(2500);
 }
 if(!ready)throw new Error('正式網站未通過密碼與資料庫設定檢查，這次部署不能視為完成。');
 let cookie,publicSync;
 try{
  const login=await call('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  if(!login.ok)throw new Error('正式網站的密碼登入驗證失敗，這次部署不能視為完成。');
  cookie=login.headers.get('Set-Cookie')?.split(';')[0];if(!cookie?.startsWith('__Host-stockfolio_session='))throw new Error('正式網站沒有建立登入工作階段。');
  const res=await call('/api/state',{headers:{Cookie:cookie}});const data=res.ok?await res.json():null;
  if(!data||!Number.isSafeInteger(data.revision)||!Array.isArray(data.stocks))throw new Error('登入後無法讀取雲端名單，這次部署不能視為完成。');
  if(verifyPublicData){
   const response=await call('/api/public-data/status',{headers:{Cookie:cookie}});const status=response.ok?await response.json():null;
   if(!status?.enabled||status.cron!=='*/15 * * * *')throw new Error('公開資料排程設定檢查未通過。');
   const started=await call('/api/public-data/refresh',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({scope:'cycle'})});
   if(!started.ok)throw new Error('首次公開資料檢查未能啟動；請登入網站查看自動更新狀態。');
   await sleep(1500);const current=await call('/api/public-data/status',{headers:{Cookie:cookie}});publicSync=current.ok?await current.json():status;
  }
  if(verifyResearch){const checked=await call('/api/research/check',{method:'POST',headers:{Cookie:cookie}});if(!checked.ok)throw new Error('AI 金鑰或模型連線檢查失敗。請登入網站 → 我的帳號 → 研究服務查看原因。');const result=await checked.json();if(!result.connected)throw new Error('AI 連線尚未確認。')}
 }finally{
  if(cookie){const res=await call('/api/logout',{method:'POST',headers:{Cookie:cookie}});if(!res.ok)throw new Error('部署測試的登入工作階段未能正常登出。')}
 }
 return publicSync;
}
export async function deploy({env=process.env,run=runWrangler,verify=verifySite,log=console.log,dryRun=false}={}){
 const state=passwordState(env);
 if(state!=='ready')throw new Error(state==='missing'?'Builds 的 Variables and secrets 缺少 SITE_PASSWORD。請在這個既有區塊填入密碼，無需尋找 Runtime 設定。':'Builds 中的 SITE_PASSWORD 必須為 16 至 256 字元的文字密碼。');
 const apiKey=env.OPENAI_API_KEY;
 if(apiKey!==undefined&&(typeof apiKey!=='string'||!apiKey.trim()||/[\r\n]/.test(apiKey)||apiKey!==apiKey.trim()))throw new Error('OPENAI_API_KEY 不可為空白或含前後空格、換行；請更新 Builds 的同名 Secret。');
 const secrets={SITE_PASSWORD:env.SITE_PASSWORD,...(apiKey?{OPENAI_API_KEY:apiKey}:{})};
 const directory=await mkdtemp(join(tmpdir(),'stockfolio-secret-'));
 try{
  const path=join(directory,'secrets.json');await writeFile(path,JSON.stringify(secrets),{mode:0o600});
  log('將已設定的密碼隨網站部署到執行環境；不顯示密碼內容。');
  await run(['deploy','--secrets-file',path,...(dryRun?['--dry-run']:[])],env);
 }finally{await rm(directory,{recursive:true,force:true})}
 if(dryRun){log('部署打包測試通過；未變更正式網站。');return}
 log('正在驗證正式網站登入與雲端名單存取…');
 const publicSync=await verify({password:env.SITE_PASSWORD,verifyResearch:!!apiKey,verifyPublicData:true});
 if(publicSync)log('公開資料每天台灣時間 07:00 起分批更新已設定；已成功檢查來源 '+publicSync.sources.filter(s=>s.state==='ok').length+'，失敗 '+publicSync.sources.filter(s=>s.state==='error').length+'，其餘等待輪替。首次 cron 執行仍以網站紀錄確認。');
 if(apiKey)log('AI 金鑰與模型連線檢查通過；本次部署沒有呼叫付費研究。首次分析請在研究院手動執行。');
 log('驗證成功：正式網站可用設定的密碼登入、讀取雲端名單，測試工作階段已登出。');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await deploy({dryRun:process.argv.includes('--dry-run')})}catch(e){console.error(e.message);process.exitCode=1}
}
