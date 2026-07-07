# Changelog

## 2026-07-06

### Initial build (local dashboard)
- `server.py`: zero-dependency Python backend on `127.0.0.1:8377` — token
  registry in `tokens.json`, proxy to the canarytokens server's
  `download?fmt=incidentlist_json` endpoint, routes
  `GET/POST/DELETE /api/tokens` and `GET /api/incidents`.
- `index.html`: dashboard UI — add-token form with manage-URL auto-extraction,
  token table with quiet/TRIGGERED/error status badges, hit counts, last-hit
  time, expandable per-hit details (time, channel, source IP, geo, user
  agent) and raw incident JSON.
- Per-token `server` field (default `https://canarytokens.org`) to keep the
  door open for a self-hosted Canarytokens instance later.

### Error-handling fix
- canarytokens.org returns HTTP 200 with an HTML 404 page for a bad token id
  or auth key; the proxy now reports "check the token id and auth key"
  instead of a JSON parse error.

### Cloudflare Worker port
- Root cause of "Add does nothing" on the user's Cloudflare deployment:
  only the static `index.html` was deployed — the Python backend can't run
  on Workers, so all `/api/*` calls 404'd.
- Added `cloudflare/worker_template.js` + `build_worker.py` →  generated
  `cloudflare/worker.js`: full backend port, registry in Workers KV
  (binding `TOKENS`), mandatory password via `DASHBOARD_PASSWORD` secret.
- `index.html`: all API calls now go through an `api()` wrapper that sends
  `Authorization: Bearer <password>` and prompts on 401 (local server is
  unaffected — it never returns 401).
- Verified by importing `worker.js` as an ES module in the browser with a
  mocked KV store: page serving, 401 without password, add via manage URL,
  duplicate (409), malformed id (400), unknown token (404), delete,
  missing-config errors.

### Trigger-URL guard
- User pasted a token's trigger URL (`.../tags/.../contact.php`) instead of
  the manage link; both backends now reject URLs without `token=`/`auth=`
  params with a message explaining to paste the manage link.
- Rebuilt `worker.js`; re-verified trigger URL → 400 with the friendly
  message, manage link → 201.

### Still pending (user action)
- Deploy `cloudflare/worker.js` to the `canarydash` worker, bind KV as
  `TOKENS`, set the `DASHBOARD_PASSWORD` secret, re-add tokens using their
  manage links.
