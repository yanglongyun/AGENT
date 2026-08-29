# 契约的 python 实现:监听 PORT,应答 /health 和页面。零依赖。
import json, os, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

PAGE = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>时钟</title><style>body{display:grid;place-items:center;height:100vh;margin:0;
font:600 42px/1 -apple-system,system-ui}</style></head>
<body><div id="t"></div><script>
const t=document.getElementById('t');
const tick=async()=>{const d=await (await fetch('/api/now')).json();t.textContent=d.now;};
tick();setInterval(tick,1000);
</script></body></html>"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.path == '/health':
            body, ctype = b'{"ok":true}', 'application/json'
        elif self.path == '/api/now':
            body = json.dumps({"now": datetime.datetime.now().strftime('%H:%M:%S')}).encode()
            ctype = 'application/json'
        else:
            body, ctype = PAGE.encode(), 'text/html; charset=utf-8'
        self.send_response(200)
        self.send_header('content-type', ctype)
        self.end_headers()
        self.wfile.write(body)

HTTPServer(('127.0.0.1', int(os.environ['PORT'])), Handler).serve_forever()
