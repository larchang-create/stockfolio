import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {RemoteRunner,config} from './engine.mjs';
const options=config(),runner=new RemoteRunner(options,{reporter:line=>{console.log(line);writeFile(join(options.dataDir,'status.json'),JSON.stringify({pid:process.pid,...runner.state}),{mode:0o600}).catch(()=>{})}});let stopping=false,timer;
async function tick(){if(!stopping)await runner.tick()}
const server=createServer((request,response)=>{
 if(request.method!=='GET'||!['/health','/status'].includes(request.url)){response.writeHead(404).end();return}
 const status={healthy:true,modelConfigured:runner.state.modelConfigured,phase:runner.state.phase,lastAttempt:runner.state.lastAttempt,lastSuccess:runner.state.lastSuccess,error:runner.state.error,...(request.url==='/status'?{websiteApprovalUrl:runner.state.approvalUrl}:{})};
 response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(status));
});
server.listen(Number(process.env.PORT||8788),process.env.BIND_ADDRESS||'127.0.0.1',()=>{timer=setInterval(tick,options.pollMs);timer.unref();runner.start().catch(()=>{runner.state.phase='storage_error';runner.state.error='遠端永久儲存未就緒'})});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stopping=true;clearInterval(timer);server.close(()=>process.exit(0))});
