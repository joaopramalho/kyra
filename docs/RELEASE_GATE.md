# LMC pilot release gate

The pilot replaces the inherited-app completeness target. Freeze new features; no cosmetic scanner/parser work. This document records release criteria, not a release approval.

## Production surface

`LMC_PILOT_MODE=true` enables the boundary in development/test. Production defaults to enabled, including an invalid flag value; only the literal `false` opts out for a separate legacy deployment. Pilot staging/production must explicitly set `true`. A disabled boundary is not a pilot release.

Admin must expose only concrete auth/session endpoints, leads/CRM, email settings, public capture, unsubscribe, the email webhook, health and the Google Calendar OAuth callback where needed. Supporting static assets must be enumerated. Unknown routes and inherited voice, billing, MCP, Zapier and widget APIs return 404 before handlers run. Server Actions must not provide a bypass through an allowed page. The proxy boundary and its regression tests are implemented; real HTTP coverage remains pending.

Worker exposes only GET/HEAD `/healthz`, `/readyz`, `/health/live`, `/health/ready`; other methods on these paths return 405 with Allow. Every other path returns 404 before the extra-route controller is invoked. Existing voice controllers remain unchanged and can be exercised with pilot mode disabled outside the pilot deployment.

Landing is explicitly a static Astro build, deployed separately from admin/worker. Deploy only `apps/landing/dist`, without Node, database credentials or a server adapter. Astro and its build integrations are development dependencies; browser dependencies remain classified separately. Remove inherited articles, claims and legal/contact details; LMC details use `[FILL]` until supplied. Content cleanup and deployment packaging remain pending.

## Required evidence before release

- Probe all seven HTTP methods on every independently inventoried allowlisted route, with unauthenticated and cross-tenant controls as applicable. Prove excluded legacy routes return 404. Preserve exact inventory/probed equality, no skips, no failures and safe-role assertions.
- Retain catalog-driven probes for all 88 database tables; do not narrow database coverage with the HTTP surface.
- `pnpm audit --prod --audit-level high`: zero high/critical. Record development advisories in `docs/DEV_ADVISORIES.md`. No blanket runtime vulnerability waiver.
- Exclude unused standalone Zapier from pilot artifacts and CI, with explicit justification; do not imply its dependency tree was repaired.
- Tenant CLI/seed covers services, area, hours, FAQs, escalation, booking rules and calendar, with schema validation and no secret output.
- Production Compose profile, real-provider environment template and DNS/key checklist. Run backup/restore rehearsal against an isolated disposable Compose project and retain verification evidence.
- Hosted CI runs unit tests, real PostgreSQL integration tests with no skipped integration, Gitleaks, Semgrep and the production dependency gate. Local runs do not count as hosted evidence.

## Current evidence

SMTP TLS identity regression failed on Nodemailer 9.1.1 and passed on 10.0.9 without network or delivery. Six dependency regression tests passed after the update. Worker boundary tests were added before implementation and demonstrated the original private-controller exposure. The original broad LMC acceptance run passed 121 tests and failed the exhaustive route-coverage equality; it is not a clean release result. Production dependency audit now exits 0 with high/critical zero. Proxy (13), worker (101) and provider (81) tests pass. The allowlist audit, staging restore rehearsal and hosted CI are still pending.

## Reproducing the production denied-route proof

Build shared and admin (`pnpm --filter @lobbystack/shared build`, then `pnpm --filter @lobbystack/admin build`). Export the isolated local test environment used by the LMC integrations without logging credentials, then run `node scripts/security/check-pilot-http-boundary.mjs`. The runner requires local, matching test/acceptance database URLs, generates ephemeral startup secrets, binds its own server to loopback port 3100 and verifies a unique health version before probing. It leaves pilot mode unset to prove the production default. It shuts down only its own child process.

Latest run: 164 independently discovered inherited page/API routes, all seven methods each (1,148 requests), all 404; seven positive/method controls and two Server Action controls also passed. The redacted summary is `.tmp/security/pilot-production-http-smoke.json`. This denial proof does not substitute for authenticated allowlist isolation or the 88-table database probes.
