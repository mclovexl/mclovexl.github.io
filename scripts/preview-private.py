from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root / 'dist'), **kwargs)
    def do_GET(self):
        if self.path == '/setup-private':
            invitation = json.loads((root / '.private/enrollment.json').read_text(encoding='utf-8'))
            self.send_response(302)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Location', '/#invite=' + invitation['token'])
            self.end_headers()
            return
        super().do_GET()

print('Local preview: http://127.0.0.1:4176/', flush=True)
ThreadingHTTPServer(('127.0.0.1', 4176), Handler).serve_forever()
