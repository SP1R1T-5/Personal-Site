# Handoff — Canary Token Dashboard

_Last updated: 2026-07-06_

## What this is

A dashboard for tracking canary tokens (canarytokens.org honeypot tokens) and
whether they've been triggered. Two deployment targets sharing one frontend:

1. **Local** — `server.py`, Python stdlib only, binds `127.0.0.1:8377`.
   Run: `python server.py` → http://127.0.0.1:8377
2. **Cloudflare Worker** — `cloudflare/worker.js`, deployed by the user at
   https://canarydash.jedwardscybsec.workers.dev/

## File map

| File | Role |
|---|---|
| `index.html` | Frontend (shared by both targets). Vanilla JS, dark theme. |
| `server.py` | Local backend. Registry in `tokens.json` next to it. |
| `tokens.json` | Local token registry. **Contains auth keys — never publish.** |
| `cloudflare/worker_template.js` | Worker source with `__HTML__` placeholder. |
| `cloudflare/build_worker.py` | Embeds `index.html` into the template (JSON-encoded) → writes `worker.js`. |
| `cloudflare/worker.js` | **GENERATED — do not edit.** Paste into the Cloudflare dashboard. |
| `D:\Misc\.claude\launch.json` | Preview launch config (`canary-dashboard`, port 8377). |

After editing `index.html` or `worker_template.js`, rebuild:
`python cloudflare/build_worker.py`

## Architecture notes

- The backend proxies incident history from the canarytokens server:
  `GET {server}/download?fmt=incidentlist_json&token=<id>&auth=<key>`.
  Proxying avoids CORS in the browser.
- Each registry entry stores its own `server` URL (default
  `https://canarytokens.org`) so the user can migrate to a **self-hosted
  Canarytokens instance later** — same endpoints, just a different host. This
  was an explicit design requirement.
- API routes (identical on both backends): `GET/POST/DELETE /api/tokens`,
  `GET /api/incidents?token=<id>`.
- Auth: the Worker requires `Authorization: Bearer <DASHBOARD_PASSWORD>` on
  all `/api/*` calls; 401 makes the frontend prompt for the password
  (remembered in localStorage under `dash_pw`). The local server has no auth
  and ignores the header.
- Worker storage: Workers KV, single key `registry` holding the JSON array.

## Gotchas learned the hard way

- canarytokens.org answers **HTTP 200 with an HTML 404 page** when
  token/auth is wrong — both backends detect non-JSON and return a clear
  error instead of a JSON parse error.
- Users tend to paste the token's **trigger URL** (`.../tags/.../contact.php`)
  instead of the **manage link** (`.../manage?token=...&auth=...`). The
  trigger URL is the tripwire itself — fetching it fires the canary, and it
  has no auth key. Both backends reject it with a message pointing at the
  manage link. Never fetch a trigger URL while testing.
- The manage link is auto-parsed: pasting it into the Token ID field fills
  token/auth/server (frontend does it live; backends parse it again).

## Current state / what's NOT done yet

- Local version: fully working and tested (add/delete/refresh, error paths).
- `worker.js`: built and verified by importing it as an ES module in the
  browser against a mocked KV store (all routes, auth, validation).
- **PENDING (user's side):** the Cloudflare deployment still runs an old
  static-HTML-only upload — `/api/*` 404s there. The user must:
  1. Replace the worker code with the contents of `cloudflare/worker.js`.
  2. Add a KV namespace binding, variable name exactly `TOKENS`.
  3. Add a secret named `DASHBOARD_PASSWORD`.
  Then re-add tokens (KV registry starts empty; local `tokens.json` stays local).
- No import/export between local registry and the Worker KV registry (an
  obvious next feature if asked).
- Worker password check is a plain string compare (not constant-time) and
  there's no rate limiting — fine for this threat model, could be hardened.

## How to test the Worker without deploying

No Node on this machine (Python 3.14 only). The trick used: serve
`cloudflare/worker.js` over HTTP with a CORS header (throwaway stdlib server),
then in the preview browser `import()` it from a Blob URL and call
`mod.default.fetch(new Request(...), env)` with a mocked
`env.TOKENS = { get, put }` and `env.DASHBOARD_PASSWORD`.
