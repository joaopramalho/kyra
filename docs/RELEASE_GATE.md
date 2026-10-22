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

## Authenticated pilot API inventory — 2026-10-22

The source-derived inventory resolves 29 concrete admin API/health patterns and four worker health patterns. Auth catch-all entries are expanded to the exact permitted endpoints, rather than allowing the whole catch-all. All seven framework-supported methods are inventoried for every pattern: **231 pairs**. Handler disappearance, a policy entry without a discovered handler, duplicate routes or unresolved dynamic worker routing fail the inventory. The worker's literal path set is resolved through the shared package's source exports without executing its policy.

Current combined result: **88/88 catalog tables**, **220/231 API method/path pairs**, **zero observed behavioral failures**, **11 explicitly uncovered pairs**. This is still a failing release gate. The exhaustive acceptance retains exact table/probe and route/probe equality, empty skips/failures, safe-role assertions and its original 120-second budget. Its table floor is strengthened to 88. No database CRUD/insert probe is removed or narrowed by the HTTP scope change.

Implemented HTTP controls include real A/B sign-ins; account/session identity despite forged user/tenant headers; persisted workspace switches with cross-tenant, anonymous and CSRF denial; every unsupported method with four identity contexts and before/after scoped database snapshots; existing deep lead/settings read/write/viewer tests; real capability capture and opt-out for both tenants; stored one-use calendar states, cross-session rejection and replay prevention; and all worker methods under missing-dependency readiness states. Worker private controllers must never be invoked in pilot mode.

Public capture probes run before the existing token-rotation tests revoke the fixture capture capabilities. This ordering preserves both sets of assertions. OAuth callbacks intentionally return a fixed error redirect for a missing session; the probe verifies its exact reachable destination and proves both stored capabilities remain unconsumed. A different authenticated user receives 403. HEAD is now rejected before it can consume a calendar state. Calendar completion returns to `/settings/email` in the pilot, preserving `/integrations` outside pilot mode.

The probes exposed and corrected a pilot regex that rejected real dotted unsubscribe capabilities. GET still only renders confirmation; POST with a real signed capability must durably stop the intended lead, reject altered tenant claims and leave the other tenant unchanged. Suppression now atomically cancels pending lead-facing process/follow-up/send jobs, while retaining owner alerts and jobs for other contacts. Existing send-time suppression checks remain in place for running work.

Still uncovered: POST to auth email-OTP request/reset/send/verify, password-reset request/reset, send-verification-email, sign-out and sign-up; GET auth verify-email; and POST email webhook. An unsigned webhook is already required to return 401 without persistence, but it is deliberately **not counted** as complete POST coverage without a valid signed HTTP positive control. The separate-process fake provider keeps its event registry and signing key private; do not add a public fixture-registration endpoint to make that test pass.

Allowed page/static-asset checks and the production denial proof supplement this API audit; final release evidence must cover the complete configured HTTP surface. The static landing deploy must not acquire runtime database access.

Validation of this checkpoint: 68 existing email/booking/follow-up and opt-out queue acceptance tests passed without skips; audit/domain/admin typechecks and the full build passed. The rebuilt production server again passed 1,148 denied-method requests and nine controls. Strict Semgrep passed with 101 rules and 1,758 targets under its existing default ignores (including top-level test directories and the documented large-file limit). New audit probes are verified by actual HTTP/PostgreSQL tests and TypeScript, rather than being claimed as included in that scanner scope. A first scan overlapped the build and timed out on one rule in the unchanged database schema; the idle retry passed at the same 30-second rule timeout, with no rule/parser changes.
