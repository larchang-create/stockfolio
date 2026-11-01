"""Run the actual local Cloudflare runtime with an isolated, disposable D1 database."""
import json, os, signal, subprocess, tempfile, time, urllib.error, urllib.request
from pathlib import Path
project=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='stockfolio-smoke-') as tmp:
 with open(tmp+'/worker.log','w+') as log:
  env=dict(os.environ);env['WRANGLER_SEND_METRICS']='false'
  proc=subprocess.Popen(['npx','--yes','wrangler@4','dev','--local','--ip','127.0.0.1','--port','8791','--persist-to',tmp+'/state','--var','SITE_PASSWORD:fixture-only-password-long-enough'],cwd=project,stdout=log,stderr=subprocess.STDOUT,env=env,start_new_session=True)
  client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
  def call(path,method='GET',body=None,cookie=None):
   headers={'Origin':'http://127.0.0.1:8791','Content-Type':'application/json'}
   if cookie:headers['Cookie']=cookie
   req=urllib.request.Request('http://127.0.0.1:8791'+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers=headers)
   try:r=client.open(req,timeout=4)
   except urllib.error.HTTPError as e:r=e
   return r.status,r.headers,r.read().decode()
  try:
   for _ in range(60):
    try:
     status,headers,text=call('/api/setup')
     if status==200:break
    except Exception:pass
    if proc.poll() is not None:raise RuntimeError('Worker stopped')
    time.sleep(.4)
   else:raise RuntimeError('Worker startup timed out')
   assert json.loads(text)=={'passwordReady':True,'databaseReady':True},text
   status,h,text=call('/api/login','POST',{'password':'fixture-only-password-long-enough'});assert status==200,text;cookie=h['Set-Cookie'].split(';')[0]
   assert call('/api/state')[0]==401
   status,h,text=call('/api/state',cookie=cookie);assert status==200,text;assert json.loads(text)['stocks']==[]
   stock={'id':'00000000-0000-4000-8000-000000000001','market':'美股','symbol':'MSFT','name':'MSFT','notes':'workerd fixture'}
   status,h,text=call('/api/state','PUT',{'revision':0,'stocks':[stock]},cookie);assert status==200,text
   _,h,text=call('/api/login','POST',{'password':'fixture-only-password-long-enough'});other=h['Set-Cookie'].split(';')[0]
   assert json.loads(call('/api/state',cookie=other)[2])['stocks']==[stock]
   assert call('/api/state','PUT',{'revision':0,'stocks':[]},other)[0]==409
   assert '台股觀察名單' in call('/',cookie=other)[2]
   assert call('/api/logout','POST',cookie=cookie)[0]==200
   assert call('/api/state',cookie=cookie)[0]==401
   assert call('/api/state',cookie=other)[0]==200
   print('PASS actual Cloudflare runtime: automatic schema, password login, two sessions, shared state, stale write rejection and logout revocation')
  except Exception:
   log.flush();log.seek(0);print(log.read()[-5000:]);raise
  finally:
   if proc.poll() is None:
    try:os.killpg(proc.pid,signal.SIGTERM)
    except ProcessLookupError:pass
    try:proc.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL)
