/** Production defaults closed; legacy operation requires an explicit opt-out. */
export function isPilotMode(env: { NODE_ENV?: string; LMC_PILOT_MODE?: string }): boolean {
  return env.LMC_PILOT_MODE === "true" || (env.NODE_ENV === "production" && env.LMC_PILOT_MODE !== "false");
}

export const PILOT_WORKER_HEALTH_PATHS: ReadonlySet<string> = new Set([
  "/healthz", "/readyz", "/health/live", "/health/ready",
]);

export type PilotAdminRoute = { pattern: string; match: RegExp; methods: readonly string[] };
const read = ["GET", "HEAD"];
const apiRead = [...read, "OPTIONS"];
const post = ["POST", "OPTIONS"];

// Deliberately enumerate auth endpoints: the inherited catch-all also hosts OAuth/MCP.
const authPostPaths = [
  "sign-in/email", "sign-up/email", "sign-out",
  "email-otp/send-verification-otp", "email-otp/verify-email",
  "email-otp/request-password-reset", "email-otp/reset-password",
  "request-password-reset", "reset-password", "send-verification-email",
];

export const PILOT_ADMIN_ROUTES: readonly PilotAdminRoute[] = [
  ...authPostPaths.map(path => ({ pattern: `/api/auth/${path}`, match: new RegExp(`^/api/auth/${path}$`), methods: ["POST"] })),
  ...["get-session", "verify-email"].map(path => ({ pattern: `/api/auth/${path}`, match: new RegExp(`^/api/auth/${path}$`), methods: ["GET"] })),
  { pattern: "/api/account", match: /^\/api\/account$/, methods: apiRead },
  { pattern: "/api/businesses", match: /^\/api\/businesses$/, methods: apiRead },
  { pattern: "/api/businesses/switch", match: /^\/api\/businesses\/switch$/, methods: post },
  { pattern: "/api/leads", match: /^\/api\/leads$/, methods: apiRead },
  { pattern: "/api/leads/[leadId]", match: /^\/api\/leads\/[A-Za-z0-9_-]+$/, methods: apiRead },
  { pattern: "/api/leads/[leadId]/automation", match: /^\/api\/leads\/[A-Za-z0-9_-]+\/automation$/, methods: ["PATCH", "OPTIONS"] },
  { pattern: "/api/leads/[leadId]/reply", match: /^\/api\/leads\/[A-Za-z0-9_-]+\/reply$/, methods: post },
  { pattern: "/api/lmc/settings", match: /^\/api\/lmc\/settings$/, methods: [...apiRead, "PUT"] },
  { pattern: "/api/lmc/settings/capture-token", match: /^\/api\/lmc\/settings\/capture-token$/, methods: post },
  { pattern: "/api/lmc/capture/[token]", match: /^\/api\/lmc\/capture\/[A-Za-z0-9_-]+$/, methods: post },
  { pattern: "/api/lmc/unsubscribe/[token]", match: /^\/api\/lmc\/unsubscribe\/[A-Za-z0-9_.-]+$/, methods: ["GET", "POST", "OPTIONS"] },
  { pattern: "/api/webhooks/lmc-email", match: /^\/api\/webhooks\/lmc-email$/, methods: post },
  { pattern: "/api/calendar/google/callback", match: /^\/api\/calendar\/google\/callback$/, methods: ["GET", "OPTIONS"] },
  ...["/healthz", "/readyz", "/api/health/live", "/api/health/ready"].map(path => ({ pattern: path, match: new RegExp(`^${path}$`), methods: apiRead })),
  { pattern: "/", match: /^\/$/, methods: read },
  { pattern: "/leads", match: /^\/leads$/, methods: read },
  { pattern: "/settings/email", match: /^\/settings\/email$/, methods: read },
  { pattern: "/[locale]/auth-pages", match: /^\/(?:(?:en|fr)\/)?(?:login|signup|forgot-password|reset-password|verify-email|confirm-email-change)$/, methods: read },
  { pattern: "/[locale]/reset-password/[token]", match: /^\/(?:(?:en|fr)\/)?reset-password\/[A-Za-z0-9_.~-]+$/, methods: read },
  { pattern: "/favicon.ico", match: /^\/favicon\.ico$/, methods: read },
  { pattern: "/brand/[asset]", match: /^\/brand\/(?:lmc-logo|logo-icon|logo-wordmark)\.svg$/, methods: read },
  { pattern: "/locales/[locale]/[namespace].json", match: /^\/locales\/(?:en|fr)\/(?:common|auth|onboarding|lmc|nav|settings|agent|widget)\.json$/, methods: read },
  { pattern: "/_next/static/[asset]", match: /^\/_next\/static\/[A-Za-z0-9_./~-]+$/, methods: read },
];

export function pilotAdminRoute(pathname: string): PilotAdminRoute | undefined {
  // Do not decode ambiguous separators or control characters into allowed segments.
  if (pathname.includes("%") || pathname.includes("\\") || pathname.split("/").some(part => part === "." || part === "..")) return undefined;
  return PILOT_ADMIN_ROUTES.find(route => route.match.test(pathname));
}
