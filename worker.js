/**
 * StaTome — Cloudflare Worker Unified Entrypoint (Static Assets + /api)
 * Works out-of-the-box with `npx wrangler deploy` on Cloudflare Workers & Pages.
 */
import apiModule from "./api/index.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-auth-token, x-database-url"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Route API requests (/api or /api/*)
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const query = Object.fromEntries(url.searchParams.entries());
      const headers = {};
      request.headers.forEach((val, key) => {
        headers[key.toLowerCase()] = val;
      });

      let body = {};
      if (request.method !== "GET" && request.method !== "HEAD") {
        try {
          const text = await request.text();
          if (text) body = JSON.parse(text);
        } catch {}
      }

      const handler = apiModule.handleApiRequest || apiModule;
      const result = await handler({ query, headers, body, env: env || {} });

      return new Response(JSON.stringify(result.data), {
        status: result.status || 200,
        headers: CORS_HEADERS
      });
    }

    // 2. Serve static PWA assets from ./public via Cloudflare ASSETS binding
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("StaTome Worker Active", { status: 200 });
  }
};
