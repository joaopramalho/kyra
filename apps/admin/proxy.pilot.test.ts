import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("LMC_PILOT_MODE", undefined);
});
afterEach(() => vi.unstubAllEnvs());
const request = (path: string, method = "GET", headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3210${path}`, { method, headers: { origin: "http://localhost:3210", ...headers } });

it("denies inherited routes for every method before CSRF, locale redirects or maintenance", () => {
  vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");
  for (const path of ["/api/voice/test", "/api/mcp", "/api/auth/oauth2/register", "/api/billing", "/api/widget/lead", "/api/realtime", "/agent", "/en/demo", "/embed.js", "/api/leads/one/unknown", "/api/leads/one/reply/extra", "/api/lmc/capture/opaque/extra", "/locales/en/auth.json/extra", "/brand/future-handler"]) {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = proxy(request(path, method, { origin: "https://foreign.invalid" }));
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  }
});

it("allows concrete pilot actions while refusing other methods on allowed routes", () => {
  for (const [path, method] of [["/api/auth/sign-in/email", "POST"], ["/api/auth/get-session", "GET"], ["/api/businesses", "GET"], ["/api/leads", "GET"], ["/api/leads/lead/reply", "POST"], ["/api/leads/lead/automation", "PATCH"], ["/api/lmc/settings", "PUT"], ["/api/lmc/capture/opaque", "POST"], ["/api/lmc/capture/opaque", "OPTIONS"], ["/api/lmc/unsubscribe/opaque", "POST"], ["/api/webhooks/lmc-email", "POST"], ["/api/calendar/google/callback", "GET"], ["/healthz", "HEAD"], ["/leads", "GET"], ["/settings/email", "GET"]] as const) {
    expect(proxy(request(path, method)).status, `${method} ${path}`).toBe(200);
  }
  for (const [path, method] of [["/api/businesses", "POST"], ["/leads", "POST"], ["/api/leads", "DELETE"], ["/api/auth/get-session", "POST"], ["/healthz", "DELETE"]] as const) {
    const response = proxy(request(path, method));
    expect(response.status, `${method} ${path}`).toBe(405);
    expect(response.headers.get("allow")).toBeTruthy();
  }
  expect(proxy(request("/api/leads/lead/reply", "POST", { origin: "https://foreign.invalid" })).status).toBe(403);
});

it("blocks Server Actions and malformed dynamic segments even through allowed paths", () => {
  expect(proxy(request("/leads", "POST", { "next-action": "inherited-action" })).status).toBe(404);
  expect(proxy(request("/api/lmc/settings", "PUT", { "next-action": "inherited-action" })).status).toBe(404);
  for (const path of ["/api/leads/one%2ftwo", "/api/leads/one%5ctwo", "/api/lmc/capture/token%00", "/api/leads//", "/api/lmc/capture/.", "/api/lmc/capture/.."])
    expect(proxy(request(path)).status, path).toBe(404);
});

it("covers assets with the proxy and permits only required static reads", () => {
  for (const path of ["/brand/lmc-logo.svg", "/locales/en/auth.json", "/_next/static/chunks/abc.js", "/favicon.ico"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }), path).toBe(true);
    expect(proxy(request(path)).status, path).toBe(200);
    expect(proxy(request(path, "POST")).status, path).toBe(405);
  }
  expect(proxy(request("/_next/image")).status).toBe(404);
});

it("redirects the post-login root to CRM and enables the gate explicitly outside production", () => {
  expect(proxy(request("/")).headers.get("location")).toBe("http://localhost:3210/leads");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LMC_PILOT_MODE", "true");
  expect(proxy(request("/api/billing")).status).toBe(404);
});
