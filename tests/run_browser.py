import http.server, threading, subprocess, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(root),**kw)
    def log_message(self,*a): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    run=subprocess.run(['node',str(root/'tests/browser_runner.mjs'),f'http://127.0.0.1:{server.server_port}/tests/browser.html'],text=True,timeout=40)
    if run.returncode: raise SystemExit(run.returncode)
finally:
    server.shutdown()
