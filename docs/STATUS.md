# LMC status

## Phase 0

Completed on Linux/WSL2. Tests, lint, typecheck, build, build-config, PostgreSQL migrations, role bootstrap, RLS checks and opted-in integration tests passed. Lint retains 17 existing warnings. The baseline dependency audit reports 76 vulnerabilities (3 critical, 33 high, 30 moderate, 10 low); remediation remains required. See RECON.md and dependency-audit-baseline.json.

## Phase 1 — in progress

Implemented shared LMC identity, provisional neutral logo/colors, dashboard translations and public display strings, onboarding branding, auth subjects and SMTP templates, notification text, public domain defaults, SEO, discovery copy and the LMC README. The historical README and required attribution notices are preserved. Package names, database role names and protocol identifiers remain stable.

Verified after these changes: root tests, lint, typecheck and production build all passed. Additional domain verification after the last notification edits: 393 unit tests, 6 onboarding email integration tests and 22 calendar/public-API/webhook integration tests passed. The new brand-contract and surface checks failed before their changes, then passed. Production HTML verifies dashboard titles, landing logo and canonical URL with `node scripts/verify-brand-build.mjs` after `pnpm build`.

A local browser check showed the LMC login name/logo; Next Devtools then reported no config or session errors. The login pre-renders a session-loading shell, so its hydrated logo cannot be asserted from static login HTML. The previous preview server has since stopped.

Remaining branding review: inherited legal/contact references, legacy marketing screenshot/OG assets and voice-demo presentation. Historical upstream articles retain their source identity and claims; they must not be presented as verified LMC offers. This phase is not yet marked complete.

## Phases 2–6

Pending: email acceptance scenarios, channel interface and fake-provider defaults, inbound email hardening and threading, lead capture, qualification and booking, human handoff, follow-ups, exhaustive table/API tenant probes, security remediation, CI, deployment/runbook documents and one-command demo. Existing voice runtime and worker implementation remain unchanged. No hosted GitHub fork or production deployment has been created.

## Email implementation progress

Acceptance contracts for a–m have been added under tests/lmc and executed red before implementation. The full email workflow and exhaustive audit harnesses are still missing; `pnpm test:lmc` is intentionally not green yet. No acceptance completion is claimed.

Implemented inbound boundary: bounded UTF-8 input, trusted authentication verdict checks, loop prevention, HTML-to-text parsing without resource loading, ignored attachments, quoted-history/signature removal, opt-out and injection detection. All 23 focused tests pass; contracts/domain typechecks pass.

Added seven tenant_id NOT NULL tables for settings, leads, messages, events, suppression, rate windows and durable jobs. Migrations ran twice successfully, schema/RLS checks pass on 88 application tables, and 11 storage acceptance tests pass against real app/worker/dispatcher roles. They cover the seven new tables; they do not replace the full existing-table/API-route audit. Dispatcher access is restricted to queue metadata columns.

Channel boundary: 9 new tests pass, alongside the 76 original agent-core tests. Email decisions are schema validated, low confidence/provider failure falls back to human handling, and tenant tool permissions are checked independently of model output. VoiceChannel delegates the same request/result to the original runtime; existing live voice sources remain unchanged.

Capability security: 11 tests pass for conversation tokens and signed action links, including tenant-prefix tampering, purpose separation, expiry and key mismatch. The reply-token routing prefix is never authorization: the tenant-scoped stored token hash must match.

Fake transports/model: 5 new tests pass, and the complete providers suite passes 71 tests. Email idempotency is tenant scoped and rejects conflicting reuse; calendar writes use stable event IDs; all fake transports run without fetch. The mode selector defaults nonproduction to fake and rejects implicit/fake production configuration. Runtime bootstrap integration and real adapters are still pending; this does not yet switch every legacy runtime call site.
