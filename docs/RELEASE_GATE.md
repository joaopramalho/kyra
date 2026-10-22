# LMC pilot release gate

This gate replaces inherited-app completeness. Freeze new features and cosmetic scanner/parser work. Passing the API audit alone is not release approval.

## Production boundary

`LMC_PILOT_MODE=true` enables the boundary in development/test. Production defaults closed, including invalid flag values; only literal `false` opts out for a separate legacy deployment. Pilot staging/production explicitly sets `true`. A disabled boundary is not a pilot release.

Admin allows concrete auth/session endpoints, leads/CRM, email settings, public capture, unsubscribe, email webhook, health and required calendar/password-recovery callbacks. Unknown inherited APIs/pages return 404 before handlers. Server Actions cannot bypass the boundary through an allowed page. Methods are restricted; auth callbacks use GET only. The reset-link callback is necessary because the actual recovery email points to `/api/auth/reset-password/[token]`. Specific auth handlers take precedence over the SDK catch-all in discovery.

Worker exposes only GET/HEAD `/healthz`, `/readyz`, `/health/live`, `/health/ready`. Other methods return 405; other paths return 404 before private controllers, even with service credentials. Existing voice controllers remain unchanged outside pilot mode. Landing is explicitly static, deployed separately as generated `apps/landing/dist` files without Node, a server adapter or database credentials.

## API and database gate — passed locally

The independently resolved inventory has **30 admin API/health patterns and four worker patterns**, with all seven framework-supported methods: **238 pairs**. Missing handlers, duplicate routes and unresolved dynamic routing fail discovery. Worker literal path sets are resolved through source exports without executing policy code. The custom OTP sender is correctly mapped to its own route rather than the auth catch-all.

Current combined report: **88/88 catalog tables**, **238/238 method/path pairs**, **zero skips and zero failures**. The exhaustive acceptance passed in **42.24 seconds**, retaining its original 120-second budget. Exact table/probe and route/probe equality, empty skips/failures and safe runtime-role assertions remain intact; table and route floors are strengthened to 88 and 238. Every table retains persisted cross-tenant CRUD and insert probes plus positive controls.

HTTP controls use actual A/B sessions and PostgreSQL: unsupported methods with four identity contexts and database snapshots; canonical account/session identity; authorized workspace writes and foreign/anonymous/CSRF rejection; existing deep lead/settings/viewer tests; capture and unsubscribe capabilities; stored one-use calendar states, replay prevention and rejected HEAD consumption; all worker methods under missing-dependency readiness; signup, OTP/email verification, both password-recovery flows, session revocation and logout. Recovery/verification tokens remain in memory and the isolated queue; no external email is sent. Signed verification JWTs use the installed SDK factory with the private test key.

The SDK `/send-verification-email` path is intentionally disabled by the existing application hook. Its required denial control sends a valid recipient and requires 404 with no queued email; the supported custom OTP sender is separately proven to issue and verify a real code. This is an intentional disabled-method control, not a malformed-request substitute for a positive test.

Valid webhook controls traverse the real Next route, verify signatures, load server-registered events, persist exactly one lead/message/process job, resist forged tenant/session/body claims and remain idempotent. Bad signatures persist nothing. A private cross-process registry is available **only in test mode**, never through HTTP. The loader rejects non-test/production use, non-private/non-owned/oversized files, invalid entries and key rotation. It preserves the fake adapter's existing in-memory `prepare` behavior.

Public capability controls run before token rotation revokes fixture URLs. Password resets run last because they revoke fixture sessions. Missing-session calendar callbacks retain the safe existing fixed error redirect and consume neither state; another authenticated user receives 403. Pilot callbacks return to `/settings/email`. Opt-out cancels pending lead-facing work in the suppression transaction, preserving owner alerts/unrelated contacts and the existing send-time check for running work.

## Reproduction and other local evidence

Export a dedicated local test environment with matching DB-role URLs, Redis, strong ephemeral auth/LMC signing secrets, loopback APP_BASE_URL and fake providers. Create a new private registry with `node scripts/security/prepare-pilot-inbound-fixture.mjs /absolute/private/fixture.json`; it uses mode 0600, refuses overwrite and prints no key. Set `LMC_FAKE_INBOUND_FIXTURE_FILE` to it in both test client and owned Next dev server, with `NODE_ENV=test`, `LMC_PROVIDER_MODE=fake` and `LMC_PILOT_MODE=true`. The registry is not a production configuration.

Run `pnpm exec vitest run --config tests/lmc/vitest.config.mts tests/lmc/isolation.acceptance.ts` against that owned server. The inventory/report CLIs are `scripts/lmc-isolation-inventory.ts` and `scripts/lmc-isolation-audit.ts`; both require explicit output filenames and the private test environment. Never print/copy/commit that environment, registry or delivery capabilities.

After building shared/admin, `node scripts/security/check-pilot-http-boundary.mjs` starts its own production server on loopback 3100, verifies a unique health version and stops only its child. Latest result: **164 inherited routes × seven methods = 1,148 denied requests**, plus nine positive/method/Server Action controls, all passed. This denial proof supplements the authenticated API audit.

Provider tests: 82 passed; fixture compatibility subset: three passed; audit/provider typechecks and full build passed, including 16 prerender checks and unchanged embed output. Strict Semgrep: 101 rules, 1,761 targets, zero findings/errors, including the fixture loader/initializer. Existing default ignores/large-file limit remain documented; top-level audit probes are independently verified by HTTP/PostgreSQL and TypeScript. No parser/rule changes were made. Staged Gitleaks passed; full-history confirmation is recorded with the checkpoint.

## Remaining release requirements

- Verify every allowed admin page/static asset method and authenticated page behavior; API coverage does not claim this separately pending surface.
- Keep `pnpm audit --prod --audit-level high` at high/critical zero. Current unchanged lockfile satisfies that gate; residual moderate/low and dev-only findings are in DEV_ADVISORIES.md. Standalone Zapier is excluded and is not declared remediated.
- Implement a validated tenant CLI/seed for services, area, hours, FAQs, escalation, booking rules and calendar, using canonical data; no new UI.
- Remove inherited public articles/claims/legal/contact details. LMC operator details remain `[FILL]` until supplied. Static packaging must exclude server/function sources.
- Production Compose profile, real Resend in/out, Google OAuth and LLM environment template, DNS/key checklist, and an executed backup/restore rehearsal against an isolated disposable Compose project.
- Hosted CI must run units and real PostgreSQL pilot integrations with no skipped integration, Gitleaks, strict Semgrep and production audit. Local evidence is not a hosted run. No deployment has occurred; inherited production migration remains explicit LMC opt-in.
