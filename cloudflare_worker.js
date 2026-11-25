/**
 * Deep Computers & Telecom — High-Performance Cloudflare Worker Edge Gateway
 * 
 * Features:
 * - Edge Caching for Static Assets & HTML (zero burden on local PC upload bandwidth)
 * - In-Memory KV Target Cache (0ms KV lookup instead of thousands of KV calls)
 * - Eliminates 504 Gateway Timeouts under heavy concurrent user load
 * - 100% Free, Unlimited Bandwidth
 */

let cachedTarget = null;
let targetCachedAt = 0;

async function getActiveTarget(env) {
  const now = Date.now();
  // Keep target in memory for 30 seconds before re-checking KV
  if (cachedTarget && (now - targetCachedAt < 30000)) {
    return cachedTarget;
  }
  if (env.TUNNEL_KV) {
    try {
      const val = await env.TUNNEL_KV.get("TARGET_URL");
      if (val) {
        cachedTarget = val.trim().replace(/\/+$/, "");
        targetCachedAt = now;
        return cachedTarget;
      }
    } catch (_) {}
  }
  return cachedTarget;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Sync Endpoint (called automatically by run.py on startup)
    if (url.pathname === "/__sync_tunnel" && request.method === "POST") {
      const syncKey = request.headers.get("X-Sync-Key") || "";
      const expectedKey = env.SYNC_KEY;

      if (!expectedKey || syncKey !== expectedKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const body = await request.json();
        const tunnelUrl = (body.url || "").trim().replace(/\/+$/, "");

        if (!tunnelUrl || !tunnelUrl.startsWith("http")) {
          return new Response(JSON.stringify({ error: "Invalid tunnel URL" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (env.TUNNEL_KV) {
          await env.TUNNEL_KV.put("TARGET_URL", tunnelUrl);
        }
        cachedTarget = tunnelUrl;
        targetCachedAt = Date.now();

        return new Response(
          JSON.stringify({ status: "ok", message: "Tunnel URL updated successfully", target: tunnelUrl }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 2. Health check endpoint for the worker itself
    if (url.pathname === "/__worker_health") {
      const active = await getActiveTarget(env);
      return new Response(
        JSON.stringify({
          worker: "online",
          kv_bound: Boolean(env.TUNNEL_KV),
          active_target: active || "not_set",
          timestamp: Date.now(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Resolve active tunnel target from in-memory cache / KV
    const target = await getActiveTarget(env);

    if (!target) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#fff;">
          <h2>Store Server Starting...</h2><p>Please refresh in a few moments.</p>
        </body></html>`,
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // 4. Edge Cache for Static Assets and Pages (GET/HEAD only)
    const isMethodCacheable = request.method === "GET" || request.method === "HEAD";
    const pathname = url.pathname.toLowerCase();
    const isStaticAsset =
      pathname.startsWith("/assets/") ||
      /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2|json)$/.test(pathname);
    const isHtmlPage =
      pathname === "/" ||
      pathname === "/catalog" ||
      pathname === "/catalog.html" ||
      pathname === "/onorder" ||
      pathname === "/onorder.html" ||
      pathname === "/services" ||
      pathname === "/services.html";

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);

    if (isMethodCacheable && (isStaticAsset || isHtmlPage)) {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const responseWithHeader = new Response(cachedResponse.body, cachedResponse);
        responseWithHeader.headers.set("X-Cache", "HIT-Edge");
        return responseWithHeader;
      }
    }

    // 5. Proxy request transparently to local server through active Cloudflare tunnel
    const targetUrl = new URL(url.pathname + url.search, target);

    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set("X-Forwarded-Host", url.host);
    forwardHeaders.set("X-Forwarded-Proto", "https");
    forwardHeaders.set("Host", targetUrl.host);
    forwardHeaders.set("ngrok-skip-browser-warning", "true");

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(proxyRequest);

      // Handle origin drop / Cloudflare 520, 530, 502, 504 gracefully with auto-reconnecting screen
      if (response.status === 520 || response.status === 530 || response.status === 502 || response.status === 504) {
        // If static asset or page was previously cached at edge, return it
        if (isMethodCacheable && (isStaticAsset || isHtmlPage)) {
          const fallbackCached = await cache.match(cacheKey);
          if (fallbackCached) {
            const fallbackResponse = new Response(fallbackCached.body, fallbackCached);
            fallbackResponse.headers.set("X-Cache", "HIT-Edge-Fallback");
            return fallbackResponse;
          }
        }

        // Return a sleek auto-reconnecting screen instead of raw Error 1016
        if (isHtmlPage || (!isStaticAsset && !url.pathname.startsWith("/api/"))) {
          return new Response(
            `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="3">
  <title>Deep Computers & Telecom | Connecting...</title>
  <style>
    body { margin: 0; padding: 0; background: #090e17; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 40px 32px; max-width: 440px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .spinner { width: 44px; height: 44px; border: 4px solid #1e293b; border-top: 4px solid #00f0ff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 24px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { font-size: 20px; font-weight: 700; color: #00f0ff; margin: 0 0 10px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 16px; }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(0,240,255,0.08); border: 1px solid rgba(0,240,255,0.2); padding: 6px 14px; border-radius: 9999px; font-size: 12px; color: #00f0ff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Connecting to Store Server</h2>
    <p>Re-establishing secure Cloudflare edge connection to the local Deep Computers inventory lab.</p>
    <div class="status-badge">
      <span>⚡ Auto-refreshing in 3 seconds...</span>
    </div>
  </div>
</body>
</html>`,
            {
              status: 200,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store, no-cache, must-revalidate",
              },
            }
          );
        }
      }

      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("X-Gateway", "Cloudflare-Worker-Edge");

      // Optimize Cache-Control for Cloudflare Edge CDN
      if (isMethodCacheable && response.status === 200) {
        if (isStaticAsset) {
          responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400"); // 24 hours at edge
        } else if (isHtmlPage) {
          responseHeaders.set("Cache-Control", "public, max-age=60, s-maxage=60"); // 1 min at edge
        }
      }

      const finalResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });

      // Save to Cloudflare Edge Cache in background
      if (isMethodCacheable && response.status === 200 && (isStaticAsset || isHtmlPage)) {
        ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      }

      return finalResponse;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Store connection timeout", details: err.message }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
