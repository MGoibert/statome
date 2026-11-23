/**
 * Cloudflare Pages Function — /api endpoint
 * Routes all GET / POST / OPTIONS requests to the unified handleApiRequest engine in api/index.js
 */
import apiModule from "../api/index.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-auth-token, x-database-url"
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
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
