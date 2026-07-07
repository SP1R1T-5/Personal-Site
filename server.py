"""Local dashboard for canary tokens.

Zero-dependency (Python stdlib only). Serves the dashboard UI and proxies
incident-history requests to the canarytokens server so the browser never
hits a CORS wall.

Each registered token stores its own `server` URL, so tokens from the free
canarytokens.org service and a future self-hosted instance can live side by
side in the same registry.

Run:  python server.py   then open http://127.0.0.1:8377
"""

import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKENS_FILE = os.path.join(BASE_DIR, "tokens.json")
INDEX_FILE = os.path.join(BASE_DIR, "index.html")
DEFAULT_SERVER = "https://canarytokens.org"
BIND_HOST = "127.0.0.1"  # local only on purpose: the registry holds auth keys
PORT = 8377
FETCH_TIMEOUT = 15

_registry_lock = threading.Lock()


def load_tokens():
    if not os.path.exists(TOKENS_FILE):
        return []
    with open(TOKENS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_tokens(tokens):
    tmp = TOKENS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(tokens, f, indent=2)
    os.replace(tmp, TOKENS_FILE)


def parse_manage_url(text):
    """Extract (server, token, auth) from a pasted manage/history URL,
    or return None if the text doesn't look like one."""
    text = text.strip()
    if "token=" not in text:
        return None
    parsed = urllib.parse.urlparse(text)
    qs = urllib.parse.parse_qs(parsed.query)
    token = qs.get("token", [""])[0]
    auth = qs.get("auth", [""])[0]
    server = f"{parsed.scheme}://{parsed.netloc}" if parsed.netloc else DEFAULT_SERVER
    if token:
        return server, token, auth
    return None


def fetch_incidents(server, token, auth):
    """Pull the incident list JSON from the canarytokens server."""
    url = (
        f"{server.rstrip('/')}/download?fmt=incidentlist_json"
        f"&token={urllib.parse.quote(token)}&auth={urllib.parse.quote(auth)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "canary-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        body = resp.read().decode("utf-8", "replace")
    try:
        return json.loads(body)
    except ValueError:
        # canarytokens.org answers HTTP 200 with an HTML 404 page when the
        # token id or auth key is wrong — surface that instead of a JSON error
        raise ValueError(
            "server did not return incident JSON — check the token id and auth key"
        ) from None


class Handler(BaseHTTPRequestHandler):
    server_version = "CanaryDashboard/1.0"

    def log_message(self, fmt, *args):
        pass  # keep the console quiet

    # -- helpers ----------------------------------------------------------

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def query(self):
        return urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

    # -- routes -----------------------------------------------------------

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html"):
            try:
                with open(INDEX_FILE, "rb") as f:
                    body = f.read()
            except OSError:
                self.send_json({"error": "index.html missing"}, 500)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == "/api/tokens":
            with _registry_lock:
                self.send_json(load_tokens())
        elif path == "/api/incidents":
            self.handle_incidents()
        else:
            self.send_json({"error": "not found"}, 404)

    def handle_incidents(self):
        token_id = self.query().get("token", [""])[0]
        with _registry_lock:
            entry = next((t for t in load_tokens() if t["token"] == token_id), None)
        if not entry:
            self.send_json({"error": "unknown token"}, 404)
            return
        try:
            data = fetch_incidents(
                entry.get("server", DEFAULT_SERVER), entry["token"], entry.get("auth", "")
            )
            self.send_json({"ok": True, "data": data})
        except urllib.error.HTTPError as e:
            self.send_json(
                {"ok": False, "error": f"server returned HTTP {e.code}"}, 200
            )
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            self.send_json({"ok": False, "error": str(e)}, 200)

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/tokens":
            self.send_json({"error": "not found"}, 404)
            return
        body = self.read_body_json()
        if not body:
            self.send_json({"error": "invalid JSON body"}, 400)
            return

        token = (body.get("token") or "").strip()
        auth = (body.get("auth") or "").strip()
        server = (body.get("server") or DEFAULT_SERVER).strip().rstrip("/")

        # Convenience: accept a pasted manage URL in the token field.
        parsed = parse_manage_url(token)
        if parsed:
            server, token, parsed_auth = parsed
            auth = auth or parsed_auth

        if "/" in token or "://" in token:
            # A URL without token=/auth= params is almost certainly the
            # token's trigger URL, not the manage link.
            self.send_json(
                {
                    "error": "that looks like the token's trigger URL (the tripwire "
                    "itself) — paste the manage link instead: .../manage?token=...&auth=..."
                },
                400,
            )
            return
        if not token or not re.fullmatch(r"[A-Za-z0-9_.-]+", token):
            self.send_json({"error": "token id is missing or malformed"}, 400)
            return
        if not auth:
            self.send_json({"error": "auth key is required"}, 400)
            return
        if not server.startswith(("http://", "https://")):
            self.send_json({"error": "server must be an http(s) URL"}, 400)
            return

        entry = {
            "token": token,
            "auth": auth,
            "server": server,
            "label": (body.get("label") or "").strip() or token,
            "type": (body.get("type") or "").strip(),
            "notes": (body.get("notes") or "").strip(),
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        with _registry_lock:
            tokens = load_tokens()
            if any(t["token"] == token for t in tokens):
                self.send_json({"error": "token already registered"}, 409)
                return
            tokens.append(entry)
            save_tokens(tokens)
        self.send_json(entry, 201)

    def do_DELETE(self):
        if urllib.parse.urlparse(self.path).path != "/api/tokens":
            self.send_json({"error": "not found"}, 404)
            return
        token_id = self.query().get("token", [""])[0]
        with _registry_lock:
            tokens = load_tokens()
            remaining = [t for t in tokens if t["token"] != token_id]
            if len(remaining) == len(tokens):
                self.send_json({"error": "unknown token"}, 404)
                return
            save_tokens(remaining)
        self.send_json({"ok": True})


def main():
    httpd = ThreadingHTTPServer((BIND_HOST, PORT), Handler)
    print(f"Canary dashboard running at http://{BIND_HOST}:{PORT}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
