# Canary Token Dashboard

A local, zero-dependency (Python stdlib only) dashboard for tracking your
canary tokens and whether they've been triggered.

## Run

```
python server.py
```

Then open http://127.0.0.1:8377

## Adding a token

When you create a token on https://canarytokens.org you get a **manage link**
(in the confirmation email / page) that looks like:

```
https://canarytokens.org/manage?token=<token-id>&auth=<auth-key>
```

Paste that whole URL into the *Token ID* field — the token, auth key, and
server are extracted automatically. Add a label and a note about where you
planted it, and it shows up in the table. The dashboard pulls each token's
incident history via the server's `download?fmt=incidentlist_json` endpoint.

## Registry

Tokens are stored in `tokens.json` next to the server. **This file contains
auth keys** (anyone with a token's auth key can view or delete that token),
which is why the server binds to 127.0.0.1 only. Don't expose this app or the
registry publicly, and back up `tokens.json` somewhere private.

## Hosting on Cloudflare Workers

The Python server can't run on Cloudflare — use the Worker port in
`cloudflare/worker.js` instead (same API, registry in Workers KV, and it
**requires a password** since the URL is public):

1. Cloudflare dashboard → Workers & Pages → your worker → edit code →
   replace everything with the contents of `cloudflare/worker.js` → Deploy.
2. Storage & Databases → KV → create a namespace (any name), then on the
   worker: Settings → Bindings → Add → KV namespace, **variable name
   `TOKENS`**, select the namespace.
3. Worker → Settings → Variables & Secrets → Add → type **Secret**, name
   **`DASHBOARD_PASSWORD`**, set your password.

Open the site: the first API call prompts for the password (remembered in
the browser's localStorage). If you edit `index.html` or
`cloudflare/worker_template.js`, rebuild with `python cloudflare/build_worker.py`.

## Moving to a self-hosted Canarytokens server later

The open-source Canarytokens server (https://github.com/thinkst/canarytokens)
exposes the same endpoints as canarytokens.org, so no code changes are needed:

- Each token stores its own `server` URL. When you stand up your own instance,
  put its URL (e.g. `https://canary.example.com`) in the *Server* field when
  registering new tokens.
- Old canarytokens.org tokens keep working side by side in the same list.
- To change the default that pre-fills the form, edit `DEFAULT_SERVER` in
  `server.py`.
