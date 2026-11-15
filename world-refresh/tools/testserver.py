"""Local test server for a copy of the Breneland client.
Serves files from ROOT; GET /api/* is fetched read-only from the live site so the game boots with real config;
every other method (POST etc.) gets a harmless {"ok":true} and NEVER reaches the live server.
Usage: python3 testserver.py ROOT PORT"""
import sys, os, json, urllib.request, http.server, socketserver
ROOT, PORT = sys.argv[1], int(sys.argv[2]); LIVE = 'https://breneland.fly.dev'
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.html': 'text/html', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json'}
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(s, *a): pass
    def _json(s, obj, code=200):
        b = json.dumps(obj).encode(); s.send_response(code); s.send_header('content-type', 'application/json'); s.send_header('content-length', str(len(b))); s.end_headers(); s.wfile.write(b)
    def do_GET(s):
        if s.path.startswith('/api/'):
            try:
                r = urllib.request.urlopen(urllib.request.Request(LIVE + s.path, headers={'user-agent': 'breneland-local-test'}), timeout=20); b = r.read()
                s.send_response(r.status); s.send_header('content-type', r.headers.get('content-type', 'application/json')); s.send_header('content-length', str(len(b))); s.end_headers(); s.wfile.write(b)
            except Exception: s._json({'ok': False}, 200)
            return
        if s.path.startswith('/ws') : return s._json({'ok': False}, 404)
        return super().do_GET()
    def do_POST(s):
        n = int(s.headers.get('content-length') or 0); s.rfile.read(n); s._json({'ok': True})
    do_PUT = do_DELETE = do_PATCH = do_POST
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer(('0.0.0.0', PORT), H).serve_forever()
