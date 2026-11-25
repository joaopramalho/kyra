import { pilotAdminRoute } from "@lobbystack/shared";

const AUTH_PAGE = /^\/(?:en|fr)\/(?:login|signup|forgot-password|reset-password(?:\/[A-Za-z0-9_.~-]+)?|verify-email)$/;
const SAFE_STATIC_PATH = /^\/(?:brand\/(?:lmc-logo|logo-icon|logo-wordmark)\.svg|locales\/(?:en|fr)\/(?:common|auth|onboarding|affiliate|nav)\.json|_next\/static\/[A-Za-z0-9_./~-]+)$/;

/**
 * Returns null for other hosts, false for a blocked affiliate-host request,
 * and an internal path for the dedicated affiliate portal entry point.
 */
export function affiliatePortalHostPath(input: {
  hostname: string;
  pathname: string;
  enabled: boolean;
  configuredHost?: string;
}): string | null | false {
  if (!isAffiliatePortalHostname(input.hostname, input.configuredHost)) return null;
  if (!input.enabled) return false;
  if (input.pathname === "/") return "/affiliate-portal";
  if (input.pathname === "/login") return "/affiliate-portal/login";
  if (input.pathname === "/signup") return "/affiliate-portal/signup";
  if (input.pathname === "/forgot-password") return "/en/forgot-password";

  const path = input.pathname;
  const localizedAuthPage = path.match(/^\/(?:en|fr)\/(login|signup)$/);
  if (localizedAuthPage) return `/affiliate-portal/${localizedAuthPage[1]}`;
  if (
    path === "/affiliate-portal" ||
    path === "/affiliate-portal/login" ||
    path === "/affiliate-portal/signup" ||
    AUTH_PAGE.test(path) ||
    path === "/internal/mfa" ||
    path === "/favicon.ico" ||
    SAFE_STATIC_PATH.test(path) ||
    (path.startsWith("/api/auth/") && Boolean(pilotAdminRoute(path, { affiliateProgramEnabled: true }))) ||
    path === "/api/affiliate" ||
    path.startsWith("/_next/static/")
  ) return path;
  return false;
}
export function isAffiliatePortalHostname(hostname: string, configuredHost = "affiliates.leadmycompany.com"): boolean {
  const expected = configuredHost.toLowerCase().replace(/\.$/, "");
  return hostname.toLowerCase().replace(/\.$/, "") === expected;
}
