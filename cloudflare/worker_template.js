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

const HTML = __HTML__;

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

function parseManageUrl(text) {
  text = text.trim();
  if (!text.includes("token=")) return null;
  try {
    const u = new URL(text);
    const token = u.searchParams.get("token") || "";
    const auth = u.searchParams.get("auth") || "";
    if (token) return { server: u.origin, token, auth };
  } catch {
    // not a full URL; fall through
  }
  return null;
}

async function fetchIncidents(server, token, auth) {
  const url =
    `${server.replace(/\/+$/, "")}/download?fmt=incidentlist_json` +
    `&token=${encodeURIComponent(token)}&auth=${encodeURIComponent(auth)}`;
  const resp = await fetch(url, {
    headers: { "user-agent": "canary-dashboard/1.0" },
  });
  const body = await resp.text();
  try {
    return JSON.parse(body);
  } catch {
    // canarytokens.org answers HTTP 200 with an HTML 404 page when the
    // token id or auth key is wrong
    throw new Error(
      "server did not return incident JSON — check the token id and auth key"
    );
  }
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

    const parsed = parseManageUrl(token);
    if (parsed) {
      server = parsed.server;
      token = parsed.token;
      auth = auth || parsed.auth;
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
