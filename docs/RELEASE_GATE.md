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
- Remove inherited public articles/claims/legal/contact details. LMC operator details remain `[FILL]` until supplied. Static packaging must exclude server/function sources.
- Production Compose profile, real Resend in/out, Google OAuth and LLM environment template, DNS/key checklist, and an executed backup/restore rehearsal against an isolated disposable Compose project.
- Hosted CI must run units and real PostgreSQL pilot integrations with no skipped integration, Gitleaks, strict Semgrep and production audit. Local evidence is not a hosted run. No deployment has occurred; inherited production migration remains explicit LMC opt-in.

## Existing-tenant configuration verification — 2026-10-22

The trusted `pnpm lmc:tenant` command configures canonical services, area, hours, FAQ model context, escalation, booking rules and calendar selection, using separate verified App/Auth roles. It preserves verified-operator, administrator and ownership checks; no database grant/migration or voice-controller changes were introduced. A strict template and private-output instructions are in TENANT_CONFIGURATION.md. Initial tenant creation and OAuth initiation remain pending.

Real PostgreSQL email/configuration regression passed **95 tests in 15 files with zero skips**. The five configuration cases passed again after adding the production event/idempotency assertion. Workspace/script typechecks and full build passed, including 16 public prerender checks. Contracts passed six tests and agent-core passed 106; the separate domain unit profile passed 428 with 69 existing environment-dependent integration skips, explicitly not hosted integration evidence.

The unchanged exhaustive API gate passed again in **26.12 seconds**, with the same 88-table/238-method inventory, exact equality, safe roles, empty skips/failures and original 120-second timeout. Strict Semgrep passed **101 rules on 1,767 targets, zero findings/errors**; the CLI, configuration domain service and seed contract are confirmed in its scanned paths. Existing default ignores/large-file scope limits remain. Staged Gitleaks passed. The production lockfile is unchanged. This is a local checkpoint, not a hosted run or deployment.

## Initial setup CLI — verified locally

`pnpm lmc:tenant-setup` now supports bootstrap, calendar-authorize and inspect operations. Bootstrap reuses canonical business creation with owner membership, default staff/profile and initial snapshot job. It requires a verified operator and preserves repeated matching setup without duplicates. Inspection requires administrator membership and returns only owned setup metadata, never provider credentials. OAuth issuance uses the existing signed, session-bound, ten-minute one-use callback contract; only its lookup digest is stored. HTTPS/callback-path/origin checks and strong signing configuration are enforced. Private outputs are mode 0600 and refuse overwrite before mutation. TENANT_CONFIGURATION.md contains the end-to-end operator sequence and strict `[FILL]` templates.

The five setup cases and five existing configuration cases passed together with no skips. They exercise actual CLI bootstrap, inspection, OAuth generation, failure cleanup, redirects/signing checks, canonical state, role/ownership denial, booking and private output. The exhaustive real HTTP/PostgreSQL gate also passed in **24.98s**, with the original 120s timeout, unchanged equality/no-skips/no-failures assertions and the same 88 tables / 238 method pairs. Tenant A's callback state now comes from the CLI's production issuer; all original HEAD, session, foreign-state, single-use and replay checks remain. Tenant B preserves the original state fixture. No routes were opened.

Workspace/script and dedicated new-test typechecks and full build passed, including 16 public prerender checks. Strict Semgrep passed 101 rules on 1773 targets with zero findings/errors and confirmed the setup CLI, OAuth issuer and domain provisioner in scanned paths. Default ignore/large-file scope limits remain unchanged. The staged secret scan passed. No migration, grant, voice-controller or lockfile changes were made. Real Google consent, hosted CI, production staging/restore rehearsal and allowed-page verification are not claimed by this local checkpoint.
