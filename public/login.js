'use strict';
const form=document.querySelector('#login-form'),error=document.querySelector('#login-error'),button=document.querySelector('#login-submit');
let checking=false;
async function setup(){
 if(checking)return;checking=true;const retry=document.querySelector('#login-retry');retry.disabled=true;
 try{
  const r=await fetch('/api/setup',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const info=await r.json();
  form.hidden=!info.passwordReady||!info.databaseReady;document.querySelector('#login-setup').hidden=info.passwordReady;document.querySelector('#login-setup').open=!info.passwordReady;retry.hidden=!!(info.passwordReady&&info.databaseReady);
  const descriptions={missing:'正式網站尚未收到 SITE_PASSWORD。請在 Settings → Builds 的 Variables and secrets 設定後，重新執行建置部署。',too_short:'網站有收到密碼，但少於 16 個字元。請修改 SITE_PASSWORD 後儲存並部署。',too_long:'網站有收到密碼，但超過 256 字元。請縮短後儲存並部署。',invalid_type:'網站有收到設定，但類型不正確。請使用 Secret 文字值。'};
  error.textContent='';document.querySelector('#login-description').textContent=info.passwordReady?'登入後，電腦與手機共用同一份名單和研究筆記。':descriptions[info.passwordState]||'設定一次網站密碼，就能開始使用。';
  if(info.passwordReady&&!info.databaseReady)error.textContent='密碼設定已生效；資料庫尚未連接，請確認最新部署是否完成。';
 }catch{error.textContent='無法連接網站，請稍後重新檢查。';retry.hidden=false}finally{checking=false;retry.disabled=false}
}
document.querySelector('#login-retry').onclick=setup;
form.onsubmit=async e=>{e.preventDefault();button.disabled=true;error.textContent='';try{const r=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.querySelector('#login-password').value}),signal:AbortSignal.timeout(20000)});const info=await r.json();if(!r.ok)throw Error(info.error||'登入失敗，請再試一次。');document.querySelector('#login-password').value='';location.replace('/')}catch(e){error.textContent=e.name==='TimeoutError'?'連線逾時，請重試。':e.message}finally{button.disabled=false}};
setup();
