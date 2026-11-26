/**
 * StaTome — Cloudflare Worker Unified Entrypoint (Static Assets + /api)
 * Works out-of-the-box with `npx wrangler deploy` on Cloudflare Workers & Pages.
 */
import apiModule from "./api/index.js";
import { BUILD_DATABASE_URL, BUILD_GOOGLE_BOOKS_API_KEY } from "./build-env.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-auth-token, x-database-url"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 0. Safe Cover Image Proxy for CORS-free Story Canvas Exports
    if (url.pathname === "/api/cover-proxy") {
      const target = url.searchParams.get("url") || "";
      try {
        const parsed = new URL(target);
        const host = parsed.hostname.toLowerCase();
        const allowedSuffixes = [
          "bnf.fr", "media-amazon.com", "ssl-images-amazon.com", "gr-assets.com",
          "googleapis.com", "googleusercontent.com", "google.com", "mzstatic.com",
          "openlibrary.org", "fnac-static.com", "di-static.com"
        ];
        const isAllowed = parsed.protocol === "https:" && allowedSuffixes.some((s) => host === s || host.endsWith("." + s));
        if (!isAllowed) {
          return new Response("Forbidden host", { status: 403 });
        }
        const imgResp = await fetch(target, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; StaTome/1.0)" }
        });
        if (!imgResp.ok) {
          return new Response("Upstream error", { status: imgResp.status });
        }
        const contentType = imgResp.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          return new Response("Not an image", { status: 400 });
        }
        return new Response(imgResp.body, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400"
          }
        });
      } catch {
        return new Response("Invalid URL", { status: 400 });
      }
    }

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

      const mergedEnv = {
        ...(env || {}),
        DATABASE_URL: (env && env.DATABASE_URL) || BUILD_DATABASE_URL || "",
        GOOGLE_BOOKS_API_KEY: (env && env.GOOGLE_BOOKS_API_KEY) || BUILD_GOOGLE_BOOKS_API_KEY || ""
      };

      const handler = apiModule.handleApiRequest || apiModule;
      const result = await handler({ query, headers, body, env: mergedEnv });

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
