// Run interactively in the owner's Omni terminal. Never paste a token in chat.
import readline from 'node:readline/promises';import {spawnSync} from 'node:child_process';import config from '../exchange/config.json' with {type:'json'};
if(!process.stdin.isTTY)throw Error('請在 Omni 的終端機執行。');
console.log('請在 GitHub 建立僅限 '+config.repository+' 的 fine-grained token，Contents 與 Actions 都選 Read and write。');
console.log('https://github.com/settings/personal-access-tokens/new');
const rl=readline.createInterface({input:process.stdin,output:process.stdout});const username=(await rl.question('GitHub 使用者名稱：')).trim();rl.close();if(!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username))throw Error('使用者名稱格式不正確');
process.stdout.write('貼上 token（輸入不會顯示）：');process.stdin.setRawMode(true);process.stdin.resume();let token='';
await new Promise((ok,no)=>process.stdin.on('data',chunk=>{for(const c of chunk.toString()){if(c==='\u0003'){no(Error('已取消'));return}if(c==='\r'||c==='\n'){ok();return}if(c==='\u007f'){token=token.slice(0,-1);continue}token+=c}})).finally(()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n')});
if(!/^[A-Za-z0-9_]+$/.test(token)||token.length<20)throw Error('Token 格式不正確');
const r=await fetch('https://api.github.com/repos/'+config.repository,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('無法存取指定倉庫：HTTP '+r.status);
const result=spawnSync('git',['credential','approve'],{input:'protocol=https\nhost=github.com\nusername='+username+'\npassword='+token+'\n\n',stdio:['pipe','ignore','ignore'],timeout:20000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});token='';if(result.status!==0)throw Error('無法存入既有的系統憑證保管，未啟用自動回寫。');console.log('已交由既有 Git Credential Manager 保管。請回到對話告訴我完成，我會驗證自動回寫。');
