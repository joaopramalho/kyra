# LMC status

## Current checkpoint — 2026-10-21

Earlier dated sections below are historical checkpoints and are superseded by this section.

Implemented and verified: durable lead capture, authenticated inbound replies, qualification, real-calendar-backed offers, verified email booking/reschedule/cancel, owner summaries and same-thread human replies, bounded consented follow-ups, suppression, signed inbound Resend adaptation and network-free provider doubles. Email changes reuse canonical availability/staff locks and calendar outbox behavior; no synthetic phone or SMS work is created. Calendar event IDs let a reschedule ignore only its own mirrored event; other conflicts remain blocked. Uncertain sends stop before Resend's idempotency window expires and alert the owner for reconciliation.

The full LMC command currently reports 79 passing tests across 12 suites, including all 19 email a–l scenarios through HTTP, the real application worker and PostgreSQL. It still exits nonzero because the exhaustive table/API isolation audit helper for scenario m has not been implemented. No complete tenant-isolation acceptance or phase-completion claim is made. The focused seven-table storage probe is not a substitute for scenario m.

Added a tenant-scoped CRM/configuration service with read roles, scheduler-only conversation actions, administrator-only configuration and capture-token rotation, service ownership checks, a fixed platform sending identity and cursor-based history. Conversation/action capabilities are removed from model history and CRM read responses. Four real-PostgreSQL workspace tests pass.

Next API integration now includes lead list/history, human reply, pause/resume, email settings, capture-token rotation, public capture, unsubscribe and the email webhook. Fifteen focused route/environment/CSRF tests pass. Operator operations retain origin-based CSRF protection; only capability-protected public intake and unsubscribe receive narrow exceptions. Local live HTTP checks verify unauthenticated CRM 401, invalid capture token 404 and cross-origin capture preflight 204. Next Devtools compiled lead/capture routes without issues; browser error inspection had no connected browser session.

The operator UI now has `/leads` and `/settings/email`, with navigation and EN/FR resources. Leads show current-status counts, search/paging, structured qualification, consent and paginated conversation history, including separately labeled owner notifications. Scheduler actions queue same-thread human replies or pause/resume AI; ambiguous reply retries retain their request ID. Workspace changes clear selected conversations and drafts. Email settings expose canonical services/aliases, area, fixed sender identity, footer address, emergency response, prices, tone, tool permissions and bounded follow-up controls. Capture-token replacement requires acknowledging that existing forms stop working. Viewer controls are read-only. Lead and settings data use the existing analytics capture exclusion marker.

Both new surfaces were exercised red before implementation. Seven component tests now cover safe text rendering, idempotent human retry, viewer permissions, workspace changes, pause scoping, editable settings and token replacement acknowledgment. Translation and existing navigation assertions retain the old routes and add the new ones. Both pages compile through Next Devtools without issues. The complete admin suite passes 902 tests (27 gated integration tests not executed in that unit run; form integration is run separately); admin typecheck, targeted ESLint checks and the admin production build pass. No authenticated browser visual check has been performed at this checkpoint.

Website capture now includes a dependency-free `lmc-form.js`, a generated install snippet in email settings, explicit unchecked follow-up consent, plain DOM rendering and stable UUID retries. Unit tests exercise the actual loader and reject unsafe snippet input. A real-HTTP/PostgreSQL test simulates a lost acknowledgment after acceptance and requires one persisted lead and one reply from the real worker through fake external providers. A browser preview verified the cross-origin local request and safe invalid-token result. Installation/CSP/test instructions are in EMAIL_CAPTURE.md. No real provider sends were made.

The existing worker now starts the dedicated email consumer when enabled, with shared admin/worker configuration, local fake email/model defaults, explicit production opt-in, serial polling, readiness reporting and graceful shutdown before database pools close. Only the current task is leased; waiting tasks do not expire behind model calls. The real email model adapter reuses the existing model factory, supplies structured JSON Schema without tools or tenant metadata and validates the returned wire/canonical decisions. Six focused model tests, four consumer unit tests and two PostgreSQL runtime tests pass. The worker suite passes 97 tests, the provider suite passes 81 tests, API/environment/CSRF checks pass 15 tests and the packaged worker build passes. Existing voice/core tests passed in the agent-core suite. Live API smoke checks still return CRM 401, invalid capture 404 and capture preflight 204. No live provider requests or full hosted deployment were performed. See EMAIL_RUNTIME.md for the production flag and remaining legacy fake-binding audit.

Remaining required work: complete business-hours/FAQ/escalation/booking settings UX; consistent fake defaults across legacy runtime entry points; initial-email/forwarded-notification ingestion; exhaustive existing-table/API tenant probes and tenant_id requirements; dependency/security remediation, CI, startup/health gates, architecture/runbook documents and the one-command full demo. Remaining Phase 1 legal/marketing/voice-demo review also remains open. No real provider email or production deployment has been made.


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


## Durable capture and email workflow (2026-10-20)

Implemented a bounded framework-independent public capture handler with tenant capture capabilities, strict input, atomic sender/tenant rate windows and suppression checks. Lead/contact, inbound message, event and processing job commit together. Raw conversation reply tokens are never returned by the public form. Five real-PostgreSQL capture tests pass, including concurrent duplicate requests, token forgery, body limits and abuse caps.

The durable queue passes five tests for competing claims, expired leases, stale-worker completion, bounded/sanitized retries and tenant boundaries. The first application worker now qualifies captured leads, declines unsupported ZIPs/services, limits pricing text to configured information, handles emergencies without an LLM, logs injection and sends owner history. Its transactional email outbox passes nine focused tests, including provider acceptance followed by connection failure and disabling email before queued delivery. Scheduling requests currently fall back to human review; automatic booking is not implemented yet.

Authenticated replies require a valid conversation token, matching sender and a sent message reference. Duplicate deliveries queue one response. STOP and signed unsubscribe suppress every conversation for the address in that tenant; queued sends recheck consent/generation before delivery. Eleven reception tests pass. The inbound unit suite now passes 24 tests, including preservation of case-sensitive reply tokens.

Added an explicit real Resend adapter with raw-body Svix signature verification, fixed-origin API retrieval, bounded response reads, trusted receiving-server authentication verdicts, outbound idempotency and tenant tags for bounce routing. Seven adapter tests and the original webhook signature test pass with network stubs; no real email has been sent. Complete providers tests: 78 passed, typecheck passed. Agent-core tests: 85 reported passed (includes baseline compiled/source duplicates), with live voice sources unchanged. Domain typecheck passed after reception changes.

Still pending: follow-up execution, verified calendar booking/reschedule/cancel, owner reply UI/API, runtime bootstrap and Next route wiring, embed/forwarded lead ingestion, exhaustive existing-table/API isolation audit, vulnerability remediation, CI and final demo. The original full a–m acceptance gate remains incomplete; focused suites do not replace it. No phase completion or production readiness is claimed.


## Database isolation correction (2026-10-21)

The independent audit discovers 88 application tables, 127 API paths and 469
method/path pairs. Real app-role SELECT/UPDATE/DELETE probes initially found 214
failures from impersonating the internal system actor. Migration 0072 separates
that authority into an authenticated, unprivileged system login; app credentials
cannot SET ROLE into it. Trusted internal operations use separate credentials,
verify the actual identity, and reject a different database target. Compose,
bootstrap, startup assertions and generated example credentials support the role.
The environment generator also handles Windows CRLF templates.

All 88 tables now pass the focused app-role read/update/delete and valid INSERT
probes, including foreign-company selection, service-actor spoofing and missing
users. Positive controls prove stored rows and constraint-valid insertion payloads;
the suite detects a deliberately permissive FORCE-RLS policy. This is database
evidence, not a claim of HTTP/API completeness. Required roles and app membership
are independently checked. The inventory artifact is generated outside source
control. See docs/TENANT_ISOLATION_AUDIT.md for exact scope and commands.

Validation: migration applied and rerun idempotently; db:check and behavioral
db:verify-rls passed. DB client tests: 16 passed; full domain suite: 497 passed,
including original voice/calendar/integration coverage. Admin/worker typechecks
passed. Startup-role tests: 8 passed; environment generator tests: 5 passed.
Actual system-authenticated business creation and global auth outbox
deduplication/rollback pass. Production rollout and full tenant_id migration are
not complete. The original exhaustive table/API acceptance gate remains red until
its complete behavioral helper exists; no gate was removed or relaxed.

Final checkpoint validation for this change: admin production build passed. The
full LMC run reports 88 passing tests across 18 suites and one existing failing
suite, solely the missing exhaustive table/API helper. The focused audit source
and CLI also passed a strict TypeScript check. This remaining acceptance failure
is retained and prevents declaring the project complete.


The first live Next HTTP isolation suite also passes for GET/HEAD/OPTIONS on
lead list/detail (6 of 469 method/path pairs), using real sign-in cookies and
persisted A/B controls. It rejects anonymous access, foreign IDs, company override
and forged actor/user headers. Other APIs and mutations remain unprobed by this
new suite; the exhaustive acceptance gate remains incomplete.

The combined isolation helper now executes the actual database and first live
HTTP probes. The unchanged exhaustive acceptance test reaches its assertions and
fails on six probed methods versus 469 discovered methods, rather than on a missing
module. Its report retains every uncovered method; no allowlist or discovered
route is substituted for tested behavior. The remaining 463 pairs are work still
required, alongside tenant-column ownership migration and the other original
security/product requirements.


## Live HTTP mutation audit (2026-10-21)

Added real owner A/B writes and persisted side-effect checks for human replies,
automation pause, email settings and capture-token replacement. The combined
report covers 16/469 method/path pairs; 453 remain unprobed. Every denied attempt
compares both tenants' email/CRM/queue state. Viewer, anonymous, CSRF, foreign
resource, header/query override, service-ID and sending-identity boundaries pass.
Human reply idempotency and capture-token hash replacement are verified directly.

A foreign lead ID on the reply API was rejected without writes but returned 500.
A typed domain not-found error now returns 404; the failing HTTP test is preserved
and green after the change. Login fixtures now honor bounded Retry-After instead
of failing spuriously on the real shared login quota. Production limits and the
email-response latency assertions are unchanged. The full exhaustive API gate is
still required to fail on the remaining coverage gap.

Validation for this checkpoint: full LMC suite reports 90 passed and one failed,
solely the unchanged exhaustive method-coverage assertion (16 versus 469). The
mutation suite successfully waited for the real login quota during that run.
The combined CLI report has zero observed probe failures and 453 uncovered pairs;
its exit code remains 1. Domain build/typecheck, admin typecheck and strict audit
source typecheck pass. Existing handoff/workspace regressions passed after the
typed 404 correction. No voice sources or production auth limits changed.


## Legacy tenant identity (2026-10-21)

Migration 0073 adds immutable, stored tenant_id UUID NOT NULL keys to 59 legacy
relations with direct non-null business ownership, including the business root.
Keys derive from the established business_id/id, preserving existing voice/ORM
payloads and ownership predicates. The seven native email tables already have
required tenant keys: 66 of 88 relations now have them. Five mixed-scope tables
still need an ownership/storage design, and 17 global/user/OAuth/affiliate
candidates require final classification. No fabricated tenant is assigned.

The new identity test ran red on all 59 targets first, then passed catalog,
actual A/B value and privileged-reassignment rejection checks. Migration applied
and reran idempotently; db:check and behavioral db:verify-rls passed. Real CRUD
probes on all 88 tables still pass. Full domain suite after migration: 497 passed;
agent-core reports 103 passed, including compiled/source duplicates and original
voice tests; DB suite: 25 passed. See docs/TENANT_IDENTITY.md for scope and rollout.
The full phase and overall goal remain incomplete.

Final migration checkpoint: the 28 focused email/booking/reschedule/cancel/worker
acceptance cases passed after the schema change. The combined audit still reports
88/88 table probes, 16/469 method/path probes, zero observed probe failures and
453 uncovered methods (exit 1). Strict audit typecheck and admin/DB builds passed.
The full goal remains active, including mixed ownership, API coverage, initial
email ingestion, configuration completion and the original security/CI/demo work.


## Audit fixture reliability (2026-10-21)

Extracted reusable HTTP probe callbacks so the combined audit can share real
authenticated A/B sessions. Existing standalone read/mutation cases remain intact.
A lock-controlled concurrency regression proved that the former sequential
outbox/parent teardown could leave a late committed fixture job orphaned. Atomic
parent locks, queue deletion and parent deletion fix that failure, and the same
regression passes. Strict audit typechecking passes. This changes test lifecycle
only; production auth quotas, voice code and acceptance assertions are unchanged.


## Public-key HTTP audit (2026-10-21)

Added 48 actual admin method/path probes for public contacts, services, staff,
integration identity, business configuration and dashboard key management. Keys
are created and revoked through authenticated HTTP, with stored hash/privacy,
scope, cookie-versus-bearer, foreign-context, strict-body and CSRF checks. Valid
writes and idempotency are verified in PostgreSQL. Negative and unsupported-method
attempts compare all 71 tenant/business-column relations, allowing only expected
presented-key usage metadata. The combined audit covers 64/469 admin pairs and
retains all 405 uncovered pairs as failures of the original exhaustive gate.

Validation: focused public/email HTTP suites passed; full LMC run before the new
cleanup regression reports 92 passed and one failed solely on 64 versus 469
method coverage. The late-writer cleanup regression separately ran red then
green after atomic cleanup. Strict audit TypeScript check passes. The combined
CLI after cleanup still reports 88 table probes, 64 admin method probes, zero
observed probe failures and 405 uncovered pairs (exit 1).

The independent API inventory currently enumerates the Next admin app. Worker
health and internal live-attach HTTP surfaces still require discovery/probes
before the all-API requirement is complete. Those three known worker paths are
explicit pending scope. Mixed storage, global/user ownership review, association
checks, initial/forwarded email, configuration completion, legacy provider fake
defaults, dependency remediation, CI, architecture/runbook and demo remain part
of the full active objective. No production runtime or voice source changed in
this checkpoint.

Worker discovery is also an explicit machine-readable scope gap in the combined
report, not just a documentation note. The report has 405 uncovered admin methods
plus one uninventoried worker-surface marker; admin-only coverage cannot make the
original all-API gate pass. The CLI prints these categories separately.
