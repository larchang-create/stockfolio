import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,access} from 'node:fs/promises';
import {deploy,verifySite} from '../scripts/deploy.mjs';
const password='fixture-only-Aa9-long-password';
test('build secret is passed as a protected secrets file, removed afterward, and verified',async()=>{
 let file,verified=false,called=false,logs=[];
 await deploy({env:{SITE_PASSWORD:password},log:x=>logs.push(x),run:async(args)=>{called=true;assert.equal(args[0],'deploy');assert.equal(args[1],'--secrets-file');file=args[2];assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{SITE_PASSWORD:password});assert.equal((await stat(file)).mode&0o777,0o600)},verify:async args=>{assert.equal(args.password,password);await assert.rejects(access(file));verified=true}});
 assert.ok(called&&verified);assert.ok(!logs.join('\n').includes(password));await assert.rejects(access(file));
});
test('missing or invalid build passwords stop before any deployment',async()=>{for(const value of [undefined,'short'])await assert.rejects(deploy({env:{SITE_PASSWORD:value},run:()=>assert.fail('must not deploy')}))});
test('failed deployments remove temporary credentials and never claim verification succeeded',async()=>{
 let file,verified=false;
 await assert.rejects(deploy({env:{SITE_PASSWORD:password},log:()=>{},run:async args=>{file=args[2];throw Error('fixture deploy error')},verify:()=>verified=true}));await assert.rejects(access(file));assert.equal(verified,false);
});
test('formal verification authenticates, reads state without changing stocks, and revokes test session',async()=>{
 const calls=[];
 await verifySite({password,sleep:async()=>{},fetcher:async(url,options)=>{const path=new URL(url).pathname;calls.push([path,options.method||'GET']);if(path==='/api/setup')return Response.json({passwordReady:true,databaseReady:true});if(path==='/api/login'){assert.equal(JSON.parse(options.body).password,password);return Response.json({ok:true},{headers:{'Set-Cookie':'__Host-stockfolio_session=fixture; Secure; HttpOnly'}})}if(path==='/api/state'){assert.equal(options.headers.Cookie,'__Host-stockfolio_session=fixture');return Response.json({revision:0,stocks:[]})}if(path==='/api/logout')return Response.json({ok:true});assert.fail('unexpected call')}});
 assert.deepEqual(calls,[['/api/setup','GET'],['/api/login','POST'],['/api/state','GET'],['/api/logout','POST']]);
});
test('configuration and authentication failures cannot pass the deployment check',async()=>{
 await assert.rejects(verifySite({password,attempts:2,sleep:async()=>{},fetcher:async()=>Response.json({passwordReady:false,databaseReady:true})}));
 await assert.rejects(verifySite({password,fetcher:async(url)=>new URL(url).pathname==='/api/setup'?Response.json({passwordReady:true,databaseReady:true}):Response.json({error:'fixture wrong password'},{status:401})}));
});
test('database verification failures still revoke the test session',async()=>{
 let loggedOut=false;
 await assert.rejects(verifySite({password,fetcher:async url=>{switch(new URL(url).pathname){case '/api/setup':return Response.json({passwordReady:true,databaseReady:true});case '/api/login':return Response.json({ok:true},{headers:{'Set-Cookie':'__Host-stockfolio_session=fixture; Secure'}});case '/api/state':return Response.json({error:'fixture db error'},{status:503});case '/api/logout':loggedOut=true;return Response.json({ok:true})}}}));assert.equal(loggedOut,true);
});
test('optional AI key uses the same protected deployment path and triggers connection verification',async()=>{
 const key='fixture-openai-key';let verified=false,logs=[];
 await deploy({env:{SITE_PASSWORD:password,OPENAI_API_KEY:key},log:x=>logs.push(x),run:async args=>{assert.deepEqual(JSON.parse(await readFile(args[2],'utf8')),{SITE_PASSWORD:password,OPENAI_API_KEY:key})},verify:async args=>{assert.equal(args.verifyResearch,true);verified=true}});assert.equal(verified,true);assert.ok(!logs.join('\n').includes(key));
});
test('AI-enabled deployment checks the provider connection without invoking research',async()=>{
 const calls=[];await verifySite({password,verifyResearch:true,fetcher:async url=>{const path=new URL(url).pathname;calls.push(path);if(path==='/api/setup')return Response.json({passwordReady:true,databaseReady:true});if(path==='/api/login')return Response.json({ok:true},{headers:{'Set-Cookie':'__Host-stockfolio_session=fixture; Secure'}});if(path==='/api/state')return Response.json({revision:0,stocks:[]});if(path==='/api/research/check')return Response.json({configured:true,connected:true});if(path==='/api/logout')return Response.json({ok:true});assert.fail('unexpected request')}});assert.ok(calls.includes('/api/research/check'));assert.ok(!calls.includes('/api/research'));
});
