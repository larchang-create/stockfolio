// GitHub Actions publishes only official PUBLIC verification keys. The workflow
// token stays in this runner and is never included in files or logs.
import config from '../exchange/config.json' with {type:'json'};
const base='https://api.github.com/repos/'+config.repository+'/contents/github-jwks.json',headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28'};
async function api(url,options={}){return fetch(url,{...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(20000)})}
const old=await api(base+'?ref='+encodeURIComponent(config.snapshotBranch));if(!old.ok&&old.status!==404)throw Error('Cannot read public identity key mirror');const file=old.ok?await old.json():{};let data;try{data=JSON.parse(Buffer.from(file.content,'base64').toString())}catch{}
const age=Date.now()-Date.parse(data?.fetchedAt);if(age>=0&&age<86400000){console.log('Public identity key mirror is current.');process.exit(0)}
const response=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Official identity keys unavailable');const raw=await response.json();
if(!Array.isArray(raw.keys)||!raw.keys.length||raw.keys.length>20||raw.keys.some(k=>k.kty!=='RSA'||k.use!=='sig'||typeof k.kid!=='string'||typeof k.n!=='string'||typeof k.e!=='string'||k.d))throw Error('Invalid official public identity keys');
const content=Buffer.from(JSON.stringify({fetchedAt:new Date().toISOString(),keys:raw.keys})).toString('base64');
const result=await api(base,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Refresh official public identity verification keys',content,sha:file.sha,branch:config.snapshotBranch})});if(!result.ok)throw Error('Public identity key mirror update failed HTTP '+result.status);console.log('Official public identity keys refreshed.');
