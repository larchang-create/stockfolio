import http.server, threading, subprocess, tempfile, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(root),**kw)
    def log_message(self,*a): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as profile:
    run=subprocess.run(['google-chrome','--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server','--user-data-dir='+profile,'--virtual-time-budget=5000','--dump-dom',f'http://127.0.0.1:{server.server_port}/tests/browser.html'],capture_output=True,text=True,timeout=30)
    import re,html
    match=re.search(r'<pre id="results">(.*?)</pre>',run.stdout,re.S)
    report=html.unescape(match.group(1)) if match else run.stderr[-2000:]
    print(report)
    server.shutdown()
    if 'ALL PASSED' not in report: raise SystemExit(1)
