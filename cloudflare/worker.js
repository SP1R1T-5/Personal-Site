/**
 * Canary Token Dashboard — Cloudflare Worker port of server.py.
 *
 * DO NOT EDIT worker.js DIRECTLY — it is generated. Edit ../index.html or
 * worker_template.js, then rebuild with:  python build_worker.py
 *
 * Required Cloudflare configuration (Worker → Settings):
 *   - KV namespace binding named  TOKENS   (stores the token registry)
 *   - Secret named  DASHBOARD_PASSWORD     (login password for the dashboard)
 */

const HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Canary Token Dashboard</title>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<style>\n  :root {\n    --bg: #12151a; --panel: #1a1f27; --border: #2a3140;\n    --text: #d7dde6; --muted: #8b94a3;\n    --green: #3fb96b; --red: #e5534b; --amber: #d9a13b; --accent: #5b9dd9;\n  }\n  * { box-sizing: border-box; }\n  body { margin: 0; background: var(--bg); color: var(--text);\n         font: 14px/1.5 \"Segoe UI\", system-ui, sans-serif; }\n  .wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }\n  h1 { font-size: 20px; margin: 0 0 4px; }\n  .sub { color: var(--muted); margin: 0 0 20px; font-size: 13px; }\n  .panel { background: var(--panel); border: 1px solid var(--border);\n           border-radius: 8px; padding: 16px; margin-bottom: 20px; }\n  .panel h2 { font-size: 14px; margin: 0 0 12px; color: var(--muted);\n              text-transform: uppercase; letter-spacing: .05em; }\n  form.add { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }\n  form.add .full { grid-column: 1 / -1; }\n  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 3px; }\n  input, select {\n    width: 100%; padding: 7px 9px; border-radius: 5px;\n    border: 1px solid var(--border); background: var(--bg); color: var(--text);\n  }\n  input:focus, select:focus { outline: 1px solid var(--accent); }\n  button {\n    padding: 7px 14px; border-radius: 5px; border: 1px solid var(--border);\n    background: #232b38; color: var(--text); cursor: pointer;\n  }\n  button:hover { background: #2c3646; }\n  button.primary { background: var(--accent); border-color: var(--accent); color: #0d1117; font-weight: 600; }\n  button.danger:hover { background: var(--red); color: #fff; }\n  .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }\n  .toolbar .spacer { flex: 1; }\n  #last-refresh { color: var(--muted); font-size: 12px; }\n  table { width: 100%; border-collapse: collapse; }\n  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }\n  th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }\n  tr.hits-row td { background: #161a21; padding: 12px 16px; }\n  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px;\n           font-size: 12px; font-weight: 600; }\n  .badge.quiet { background: rgba(63,185,107,.15); color: var(--green); }\n  .badge.fired { background: rgba(229,83,75,.18); color: var(--red); }\n  .badge.err   { background: rgba(217,161,59,.15); color: var(--amber); }\n  .badge.wait  { background: rgba(139,148,163,.15); color: var(--muted); }\n  .muted { color: var(--muted); }\n  .mono { font-family: Consolas, monospace; font-size: 12px; }\n  a { color: var(--accent); }\n  .hit { border-left: 3px solid var(--red); padding: 4px 10px; margin: 6px 0; }\n  .hit .when { font-weight: 600; }\n  details.raw summary { cursor: pointer; color: var(--muted); font-size: 12px; margin-top: 6px; }\n  pre { background: var(--bg); border: 1px solid var(--border); border-radius: 5px;\n        padding: 10px; overflow: auto; max-height: 300px; font-size: 12px; }\n  #form-msg { grid-column: 1 / -1; font-size: 13px; min-height: 18px; }\n  #form-msg.error { color: var(--red); }\n  #form-msg.ok { color: var(--green); }\n  .empty { color: var(--muted); text-align: center; padding: 24px; }\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <h1>\ud83d\udc24 Canary Token Dashboard</h1>\n  <p class=\"sub\">Local view of your registered canary tokens and their trigger history. Keep this machine-local &mdash; the registry contains auth keys.</p>\n\n  <div class=\"panel\">\n    <h2>Add a token</h2>\n    <form class=\"add\" id=\"add-form\">\n      <div class=\"full\">\n        <label for=\"f-token\">Token ID <span class=\"muted\">&mdash; or just paste the whole manage URL from the token email/page</span></label>\n        <input id=\"f-token\" required placeholder=\"e.g. sq0donpvain3q2kwrlgpaslo8  or  https://canarytokens.org/manage?token=...&auth=...\">\n      </div>\n      <div>\n        <label for=\"f-auth\">Auth key <span class=\"muted\">(auto-filled if you pasted a manage URL)</span></label>\n        <input id=\"f-auth\" placeholder=\"from the manage link\">\n      </div>\n      <div>\n        <label for=\"f-label\">Label</label>\n        <input id=\"f-label\" placeholder=\"e.g. Fake AWS creds on desktop\">\n      </div>\n      <div>\n        <label for=\"f-type\">Type</label>\n        <select id=\"f-type\">\n          <option value=\"\">(unspecified)</option>\n          <option>Web bug / URL</option><option>DNS</option><option>AWS keys</option>\n          <option>Word document</option><option>PDF</option><option>Excel document</option>\n          <option>QR code</option><option>Windows folder</option><option>Email</option>\n          <option>Other</option>\n        </select>\n      </div>\n      <div>\n        <label for=\"f-server\">Server</label>\n        <input id=\"f-server\" value=\"https://canarytokens.org\" placeholder=\"https://canarytokens.org\">\n      </div>\n      <div class=\"full\">\n        <label for=\"f-notes\">Notes <span class=\"muted\">(where is it planted?)</span></label>\n        <input id=\"f-notes\" placeholder=\"optional\">\n      </div>\n      <div class=\"full\">\n        <button class=\"primary\" type=\"submit\">Add token</button>\n        <span id=\"form-msg\"></span>\n      </div>\n    </form>\n  </div>\n\n  <div class=\"panel\">\n    <div class=\"toolbar\">\n      <h2 style=\"margin:0\">Tokens</h2>\n      <div class=\"spacer\"></div>\n      <span id=\"last-refresh\"></span>\n      <button id=\"refresh-btn\">\u21bb Refresh all</button>\n    </div>\n    <table>\n      <thead><tr>\n        <th>Label</th><th>Type</th><th>Server</th><th>Status</th>\n        <th>Hits</th><th>Last hit</th><th></th>\n      </tr></thead>\n      <tbody id=\"rows\"></tbody>\n    </table>\n    <div class=\"empty\" id=\"empty\" hidden>No tokens registered yet &mdash; add your first one above.</div>\n  </div>\n</div>\n\n<script>\n\"use strict\";\nconst $ = (s) => document.querySelector(s);\nlet tokens = [];\n\n// All API calls go through here. If the backend requires a password (the\n// Cloudflare Worker does; the local server doesn't), a 401 triggers a prompt\n// and the password is remembered in localStorage.\nasync function api(path, opts = {}) {\n  const pw = localStorage.getItem(\"dash_pw\");\n  opts.headers = Object.assign({}, opts.headers,\n    pw ? { \"Authorization\": \"Bearer \" + pw } : {});\n  const resp = await fetch(path, opts);\n  if (resp.status === 401) {\n    const entered = prompt(\"Dashboard password:\");\n    if (entered === null) throw new Error(\"unauthorized\");\n    localStorage.setItem(\"dash_pw\", entered);\n    return api(path, opts);\n  }\n  return resp;\n}\n\nfunction esc(s) {\n  return String(s ?? \"\").replace(/[&<>\"']/g,\n    (c) => ({\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",'\"':\"&quot;\",\"'\":\"&#39;\"}[c]));\n}\n\nfunction hitTime(hit) {\n  // time_of_hit is an epoch float in most canarytokens versions\n  const t = hit.time_of_hit ?? hit.timestamp ?? hit.time;\n  if (t == null) return null;\n  const n = Number(t);\n  if (!Number.isNaN(n) && n > 1e9) return new Date(n * (n < 1e12 ? 1000 : 1));\n  const d = new Date(t);\n  return Number.isNaN(d.getTime()) ? null : d;\n}\n\nfunction extractHits(data) {\n  if (Array.isArray(data)) return data;\n  if (Array.isArray(data?.hits)) return data.hits;\n  if (Array.isArray(data?.triggered_details?.hits)) return data.triggered_details.hits;\n  // new (2023+) canarytokens API nests everything under \"canarydrop\"\n  if (Array.isArray(data?.canarydrop?.triggered_details?.hits)) return data.canarydrop.triggered_details.hits;\n  return [];\n}\n\nfunction manageUrl(t) {\n  if (t.link_style === \"path\") {\n    // new-style links put the AUTH key first\n    return `${t.server}/nest/manage/${encodeURIComponent(t.auth)}/${encodeURIComponent(t.token)}`;\n  }\n  return `${t.server}/manage?token=${encodeURIComponent(t.token)}&auth=${encodeURIComponent(t.auth)}`;\n}\n\nfunction render() {\n  const tbody = $(\"#rows\");\n  tbody.innerHTML = \"\";\n  $(\"#empty\").hidden = tokens.length > 0;\n  for (const t of tokens) {\n    const tr = document.createElement(\"tr\");\n    tr.innerHTML = `\n      <td><strong>${esc(t.label)}</strong>\n          ${t.notes ? `<div class=\"muted\">${esc(t.notes)}</div>` : \"\"}\n          <div class=\"mono muted\">${esc(t.token)}</div></td>\n      <td>${esc(t.type) || \"<span class='muted'>\u2014</span>\"}</td>\n      <td class=\"mono\">${esc(new URL(t.server).host)}</td>\n      <td><span class=\"badge wait\" id=\"status-${esc(t.token)}\">\u2026</span></td>\n      <td id=\"count-${esc(t.token)}\" class=\"muted\">\u2013</td>\n      <td id=\"last-${esc(t.token)}\" class=\"muted\">\u2013</td>\n      <td>\n        <button data-act=\"details\" data-token=\"${esc(t.token)}\">Details</button>\n        <a href=\"${esc(manageUrl(t))}\" target=\"_blank\"><button type=\"button\">Manage</button></a>\n        <button class=\"danger\" data-act=\"delete\" data-token=\"${esc(t.token)}\">\u2715</button>\n      </td>`;\n    tbody.appendChild(tr);\n    const hitsRow = document.createElement(\"tr\");\n    hitsRow.className = \"hits-row\";\n    hitsRow.hidden = true;\n    hitsRow.innerHTML = `<td colspan=\"7\" id=\"hits-${esc(t.token)}\"><span class=\"muted\">Not loaded yet.</span></td>`;\n    tbody.appendChild(hitsRow);\n  }\n}\n\nasync function refreshToken(t) {\n  const status = document.getElementById(`status-${t.token}`);\n  status.className = \"badge wait\"; status.textContent = \"checking\u2026\";\n  let res;\n  try {\n    res = await (await api(`/api/incidents?token=${encodeURIComponent(t.token)}`)).json();\n  } catch (e) {\n    res = { ok: false, error: String(e) };\n  }\n  const count = document.getElementById(`count-${t.token}`);\n  const last = document.getElementById(`last-${t.token}`);\n  const hitsCell = document.getElementById(`hits-${t.token}`);\n  if (!res.ok) {\n    status.className = \"badge err\"; status.textContent = \"error\";\n    hitsCell.innerHTML = `<span class=\"muted\">Could not fetch incidents: ${esc(res.error)}</span>`;\n    return;\n  }\n  const hits = extractHits(res.data);\n  count.textContent = hits.length;\n  if (hits.length === 0) {\n    status.className = \"badge quiet\"; status.textContent = \"quiet\";\n    last.textContent = \"never\";\n    hitsCell.innerHTML = `<span class=\"muted\">No incidents recorded. \ud83c\udf89</span>`;\n    return;\n  }\n  status.className = \"badge fired\"; status.textContent = \"TRIGGERED\";\n  const dates = hits.map(hitTime).filter(Boolean).sort((a, b) => b - a);\n  last.textContent = dates[0] ? dates[0].toLocaleString() : \"unknown\";\n  hitsCell.innerHTML = hits.slice().reverse().map((h) => {\n    const d = hitTime(h);\n    const geo = h.geo_info || h.geo || {};\n    return `<div class=\"hit\">\n      <span class=\"when\">${d ? esc(d.toLocaleString()) : \"unknown time\"}</span>\n      &nbsp;\u00b7&nbsp; ${esc(h.input_channel || h.channel || \"?\")}\n      &nbsp;\u00b7&nbsp; <span class=\"mono\">${esc(h.src_ip || geo.ip || \"?\")}</span>\n      ${geo.city || geo.country ? ` &nbsp;\u00b7&nbsp; ${esc([geo.city, geo.country].filter(Boolean).join(\", \"))}` : \"\"}\n      ${h.useragent ? `<div class=\"muted mono\">${esc(h.useragent)}</div>` : \"\"}\n    </div>`;\n  }).join(\"\") +\n  `<details class=\"raw\"><summary>raw incident JSON</summary><pre>${esc(JSON.stringify(res.data, null, 2))}</pre></details>`;\n}\n\nasync function refreshAll() {\n  await Promise.allSettled(tokens.map(refreshToken));\n  $(\"#last-refresh\").textContent = \"last refresh: \" + new Date().toLocaleTimeString();\n}\n\nasync function loadTokens() {\n  tokens = await (await api(\"/api/tokens\")).json();\n  render();\n  await refreshAll();\n}\n\n$(\"#rows\").addEventListener(\"click\", async (e) => {\n  const btn = e.target.closest(\"button[data-act]\");\n  if (!btn) return;\n  const id = btn.dataset.token;\n  if (btn.dataset.act === \"details\") {\n    document.getElementById(`hits-${id}`).closest(\"tr\").hidden ^= true;\n  } else if (btn.dataset.act === \"delete\") {\n    const t = tokens.find((x) => x.token === id);\n    if (!confirm(`Remove \"${t.label}\" from the dashboard?\\n(The token itself keeps working \u2014 this only removes it from this list.)`)) return;\n    await api(`/api/tokens?token=${encodeURIComponent(id)}`, { method: \"DELETE\" });\n    await loadTokens();\n  }\n});\n\n// Auto-extract token + auth when a manage URL is pasted. Handles both the\n// legacy ?token=..&auth=.. links and the new /nest/manage/<auth>/<token> ones.\nlet linkStyle = \"\";\n$(\"#f-token\").addEventListener(\"input\", () => {\n  const v = $(\"#f-token\").value.trim();\n  if (!v.includes(\"://\")) return;\n  try {\n    const u = new URL(v);\n    let tok = u.searchParams.get(\"token\"), auth = u.searchParams.get(\"auth\");\n    linkStyle = tok ? \"query\" : \"\";\n    if (!tok) {\n      const m = u.pathname.match(/\\/(?:nest\\/)?(?:manage|history)\\/([A-Za-z0-9]+)\\/([A-Za-z0-9._-]+)\\/?$/);\n      if (m) { auth = m[1]; tok = m[2]; linkStyle = \"path\"; }\n    }\n    if (!tok) return;\n    $(\"#f-token\").value = tok;\n    if (auth) $(\"#f-auth\").value = auth;\n    if (u.origin !== \"null\") $(\"#f-server\").value = u.origin;\n  } catch { /* not a full URL \u2014 leave as-is, server parses too */ }\n});\n\n$(\"#add-form\").addEventListener(\"submit\", async (e) => {\n  e.preventDefault();\n  const msg = $(\"#form-msg\");\n  msg.className = \"\"; msg.textContent = \"adding\u2026\";\n  const body = {\n    token: $(\"#f-token\").value, auth: $(\"#f-auth\").value,\n    label: $(\"#f-label\").value, type: $(\"#f-type\").value,\n    server: $(\"#f-server\").value, notes: $(\"#f-notes\").value,\n    link_style: linkStyle,\n  };\n  const resp = await api(\"/api/tokens\", {\n    method: \"POST\", headers: { \"Content-Type\": \"application/json\" },\n    body: JSON.stringify(body),\n  });\n  const data = await resp.json();\n  if (!resp.ok) {\n    msg.className = \"error\"; msg.textContent = data.error || \"failed\";\n    return;\n  }\n  msg.className = \"ok\"; msg.textContent = \"added \u2713\";\n  e.target.reset(); linkStyle = \"\"; $(\"#f-server\").value = \"https://canarytokens.org\";\n  await loadTokens();\n});\n\n$(\"#refresh-btn\").addEventListener(\"click\", refreshAll);\nloadTokens();\n</script>\n</body>\n</html>\n";

const DEFAULT_SERVER = "https://canarytokens.org";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function loadTokens(env) {
  return JSON.parse((await env.TOKENS.get("registry")) || "[]");
}

async function saveTokens(env, tokens) {
  await env.TOKENS.put("registry", JSON.stringify(tokens));
}

// New-style manage/history links (canarytokens.org since the ~2023 redesign)
// put the AUTH key first:  https://canarytokens.org/nest/manage/<auth>/<token>
const PATH_LINK_RE = /\/(?:nest\/)?(?:manage|history)\/([A-Za-z0-9]+)\/([A-Za-z0-9._-]+)\/?$/;

// Hardcoded API prefix of the redesigned canarytokens server (same constant in
// the official SPA bundle, also for self-hosted instances of the new version).
const NEW_API_PREFIX = "/d3aece8093b71007b5ccfedad91ebb11";

function parseManageUrl(text) {
  text = text.trim();
  let u;
  try {
    u = new URL(text);
  } catch {
    return null; // not a full URL (e.g. a bare token id)
  }
  const token = u.searchParams.get("token") || "";
  const auth = u.searchParams.get("auth") || "";
  if (token) return { server: u.origin, token, auth, linkStyle: "query" };
  const m = u.pathname.match(PATH_LINK_RE);
  if (m) return { server: u.origin, token: m[2], auth: m[1], linkStyle: "path" };
  return null;
}

async function fetchIncidents(server, token, auth) {
  const base = server.replace(/\/+$/, "");
  const q = `token=${encodeURIComponent(token)}&auth=${encodeURIComponent(auth)}`;
  const urls = [
    `${base}${NEW_API_PREFIX}/history?${q}`, // new server (canarytokens.org)
    `${base}/download?fmt=incidentlist_json&${q}`, // legacy / older self-hosted
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { "user-agent": "canary-dashboard/1.0" },
      });
      if (!resp.ok) continue; // new API 404s outright for unknown tokens
      // legacy canarytokens answers HTTP 200 with an HTML 404 page when the
      // token/auth is wrong — the JSON parse throws and we try the next URL
      return JSON.parse(await resp.text());
    } catch {
      continue;
    }
  }
  throw new Error(
    "server did not return incident JSON — check the token id and auth key"
  );
}

async function handleApi(request, env, url) {
  if (!env.DASHBOARD_PASSWORD) {
    return json(
      { error: "not configured: set the DASHBOARD_PASSWORD secret on this Worker" },
      500
    );
  }
  if (!env.TOKENS) {
    return json(
      { error: "not configured: bind a KV namespace named TOKENS to this Worker" },
      500
    );
  }
  const given = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (given !== env.DASHBOARD_PASSWORD) {
    return json({ error: "unauthorized" }, 401);
  }

  const method = request.method;

  if (url.pathname === "/api/tokens" && method === "GET") {
    return json(await loadTokens(env));
  }

  if (url.pathname === "/api/incidents" && method === "GET") {
    const tokenId = url.searchParams.get("token") || "";
    const tokens = await loadTokens(env);
    const entry = tokens.find((t) => t.token === tokenId);
    if (!entry) return json({ error: "unknown token" }, 404);
    try {
      const data = await fetchIncidents(
        entry.server || DEFAULT_SERVER,
        entry.token,
        entry.auth || ""
      );
      return json({ ok: true, data });
    } catch (e) {
      return json({ ok: false, error: e.message || String(e) });
    }
  }

  if (url.pathname === "/api/tokens" && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    let token = (body.token || "").trim();
    let auth = (body.auth || "").trim();
    let server = (body.server || DEFAULT_SERVER).trim().replace(/\/+$/, "");

    let linkStyle = (body.link_style || "").trim();
    const parsed = parseManageUrl(token);
    if (parsed) {
      server = parsed.server;
      token = parsed.token;
      auth = auth || parsed.auth;
      linkStyle = parsed.linkStyle;
    }

    if (token.includes("/")) {
      // A URL without token=/auth= params is almost certainly the token's
      // trigger URL, not the manage link.
      return json(
        {
          error:
            "that looks like the token's trigger URL (the tripwire itself) — " +
            "paste the manage link instead: .../manage?token=...&auth=...",
        },
        400
      );
    }
    if (!token || !/^[A-Za-z0-9_.-]+$/.test(token)) {
      return json({ error: "token id is missing or malformed" }, 400);
    }
    if (!auth) return json({ error: "auth key is required" }, 400);
    if (!/^https?:\/\//.test(server)) {
      return json({ error: "server must be an http(s) URL" }, 400);
    }

    const entry = {
      token,
      auth,
      server,
      label: (body.label || "").trim() || token,
      type: (body.type || "").trim(),
      notes: (body.notes || "").trim(),
      link_style: ["query", "path"].includes(linkStyle) ? linkStyle : "",
      created: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    const tokens = await loadTokens(env);
    if (tokens.some((t) => t.token === token)) {
      return json({ error: "token already registered" }, 409);
    }
    tokens.push(entry);
    await saveTokens(env, tokens);
    return json(entry, 201);
  }

  if (url.pathname === "/api/tokens" && method === "DELETE") {
    const tokenId = url.searchParams.get("token") || "";
    const tokens = await loadTokens(env);
    const remaining = tokens.filter((t) => t.token !== tokenId);
    if (remaining.length === tokens.length) {
      return json({ error: "unknown token" }, 404);
    }
    await saveTokens(env, remaining);
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      return new Response(HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return json({ error: "not found" }, 404);
  },
};
