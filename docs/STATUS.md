# LMC status

## Current checkpoint — 2026-10-21 (one-command offline demo)

`pnpm lmc:demo` now runs the full offline email workflow over temporary loopback
HTTP, production handlers/domain/worker and real PostgreSQL, with only external
providers and clock fake. It covers signed initial email, first reply, verified
qualification, canonical booking/calendar synchronization and owner summary. A
separate unanswered form lead explicitly consents to follow-up and then sends STOP.
Seven more simulated days produce no later sends; the booked lead gets no touches.
The runner checks actual role identities/flags, uses a demo session lock, refuses
existing due work and removes/checks its synthetic business, owner and outbox rows.
It shares the acceptance fixture rather than a second fake business implementation.

An actual CLI run with a private env file produced all eight stages, a first reply
in 188 ms, one booking and one consented follow-up, no future sends after STOP,
and confirmed cleanup. A redacted JSON transcript/report is available outside Git
in the task outputs. `--json`, explicit non-overwriting `--output` and `--help` are
implemented. No real credentials are needed for providers, and no database URLs,
reply/intake/unsubscribe capabilities or exception stacks are emitted.

Tests first failed on the missing runner/command. Six final demo/CLI acceptance
cases pass, including actual package command and report-file agreement, refusing
overwrite/production/real providers, rejecting the misleading database name `latest`
and connection-query destination overrides, plus real HTTP/PG workflow/cleanup.
Full serial LMC suite: **120 passed, one failed solely on unchanged exhaustive
HTTP isolation coverage (85 versus 735)**. Full script typecheck, dedicated demo
test-source typecheck and five environment-generation tests pass. Production
application/voice sources are unchanged in this checkpoint; prior admin/worker
build and domain/worker test evidence is retained rather than repeated without a
runtime code change. See OFFLINE_DEMO.md and the updated README for prerequisites.

ARCHITECTURE.md now documents the actual runtime/data/authority boundaries and
remaining ownership/provider limits. RUNBOOK.md describes source-derived deployment,
maintenance, Compose backup/restore and incident procedures, including destructive
target selection, backup confidentiality and reconciliation of external effects.
These documents are available; their presence is not a passed production deployment
or full restore rehearsal. The existing Compose drill still requires execution and
LMC-specific recovery validation before claiming operational readiness.

The demo requires an already migrated dedicated localhost database with a separate
`test` name token and separate runtime URLs, and rejects production/real-provider
mode. It does not provision infrastructure, start a persistent dashboard, prove
live provider delivery, or count as complete production Next/API isolation. Known
production inventory remains 735 pairs with 650 unprobed, and ownership review,
full configuration/inbox UX, remaining branding and legacy fake defaults, dependency/
security/CI/startup/header/health work and operational restore verification remain
required. The full goal stays active; this delivers the demo requirement, not
overall completion. Earlier sections are historical and superseded where needed.

## Earlier checkpoint — 2026-10-21 (initial email ingestion; historical)

Initial direct emails and owner-forwarded lead notifications now enter the same
signed provider boundary, tenant-scoped capture transaction and real email worker.
`lead+TOKEN` captures new senders; `forward+TOKEN` accepts explicit Email/Message
notification fields from the authenticated configured owner. Existing capture-token
rotation governs these addresses. All initial contacts remain unverified for booking
and default to no follow-up consent. Subsequent replies keep the established
sender/token/thread verification. See EMAIL_INGESTION.md for supported format,
setup, limits and manual DNS/provider work; an inbox-address setup panel is pending.

Both provider-event and RFC Message-ID claims are atomic and tenant scoped;
rekeyed duplicate deliveries cannot create another lead/reply, and changed IDs or
content cannot reuse a claimed event. The first direct reply keeps its actual
thread; forwarded notifications do not leak the owner's Message-ID into the lead's
reply. HTML notification blockquotes can be parsed without executing scripts or
reading attachments. Tokens are redacted from CRM/model context. Authenticated
direct STOP suppresses existing conversations before later queued/future sends.
The normal reply/loop/opt-out path and all voice sources remain unchanged.

Tests first observed absent intake, a changed-ID conflict/503, ignored direct STOP,
and a leaked intake capability in a CRM read. Those regressions now pass. Ten new
real HTTP/PG/worker acceptance cases cover direct email through booking/owner
summary, forwarding, idempotency, STOP, HTML/attachments, injection logging, redaction,
A/B controls and a real signed Resend adapter path with only its API transport fake.
The provider's computed authentication fields were checked against its official
receiving API documentation; message headers are not promoted to authentication.

Final serial LMC run: **114 passed, one failed solely on unchanged exhaustive
isolation coverage (85 versus 735)**. It includes all original 19 email scenarios,
the ten new intake cases and a fixture outbox-cleanup regression. An overlapping
earlier test run interfered through the real shared queue/fake transport ownership;
it was discarded as final evidence and the full suite rerun without overlap.
Domain 497 tests, worker 97 tests, admin/domain/worker typechecks, new test-source
typecheck and both production admin/worker builds pass. The generated admin chunks
contain the intake guard; the worker bundle contains the updated redaction/forward
thread handling. Post-build WSL HTTP smoke: login 200, anonymous leads 401.

Latest combined audit is still 88/88 catalog tables and 85/735 method/path pairs,
650 unprobed pairs, zero observed failures; exit 1. Initial webhook scenarios through
the production handler are not counted as complete Next route isolation coverage.
The full goal remains active: complete all discovered admin/landing route probes,
mixed/global table ownership and association/reassignment reviews, full business
hours/FAQ/escalation/booking settings, inbox-address UX, remaining branding and
legacy fake-provider defaults, dependency/security/CI gates, startup/headers/health,
architecture/runbook and the one-command offline demo. No phase/goal completion,
live provider send or deployment is claimed. Earlier sections are historical.

## Earlier checkpoint — 2026-10-21 (Astro HTTP inventory; historical)

The complete LMC goal remains active. The latest independently discovered scope is
169 source route patterns / 735 method-path pairs: 134 admin patterns / 490 pairs,
three worker patterns / 21 pairs, and 31 Astro endpoints plus one Cloudflare Pages
wildcard middleware / 224 pairs. Behavioral coverage is 64 admin plus all 21 worker
pairs, totaling **85/735**. All 88 catalog tables have constrained A/B CRUD probes.
The combined CLI reports 650 unprobed pairs (426 admin, 224 landing), zero observed
probe failures, and exit 1. Original exhaustive assertions and bound are unchanged.

The public deployment middleware now derives its canonical/www/preview alias
from the shared brand module, and `/api/status` names Lead My Company. Three new
branding regressions were red before the fix and pass now. All eight existing
middleware cases retain their assertions/branches with LMC fixture URLs/text.
Landing 81 tests, lint, Astro check (222 files, zero diagnostics), and the static
build pass. An independent browser-target ESM bundle of the middleware succeeds;
its canonical redirect was executed from that bundle. Real Astro preview HTTP
returns the generated LMC status body, GET/HEAD 200 and OPTIONS 204; its static
server serves that same readonly body for POST/PUT/PATCH/DELETE. These smoke checks
do not count as complete landing A/B isolation coverage. No visible layout changed
and no Cloudflare deployment or live indexing submission was performed; IndexNow
key was absent during build. One existing 68-character SEO title still warns
against the 65-character recommendation. The derived preview hostname remains a
provisional default to verify against the actual Pages project before deployment.

Source discovery is not a static/public exemption or a behavioral proof. New Astro
endpoints/functions are detected; unknown exports and duplicate paths fail closed.
Two new inventory tests plus the four worker inventory cases and strict audit
typecheck pass. Landing HTTP probes, conditional-route controls and deployment
middleware verification remain required. See TENANT_ISOLATION_AUDIT.md.

The worker admission fix and its real HTTP/controller/agent/PG controls remain
implemented. Previous email/voice validation and all remaining original product,
tenant ownership, security, CI and offline-demo requirements are recorded below;
they are not made complete by this inventory addition. Earlier sections are
historical and their counts/scope gaps are superseded by this checkpoint.

## Earlier checkpoint — 2026-10-21 (worker HTTP admission and audit; historical)

The full LMC goal remains active. Email capture/replies/qualification/booking,
handoff, suppression, bounded follow-ups and operator CRM/settings are implemented;
the remaining original product/security/demo requirements below are not complete.

Current combined isolation report: **88/88 tables; 85/511 method/path pairs;
426 unprobed pairs; one explicit pending landing HTTP surface; zero observed probe
failures**. The command exits 1 on the 427 skipped entries. Admin discovery now
includes all Next route handlers, including seven OAuth/discovery/embed handlers
outside `/api` (490 pairs); the worker's independent source graph adds 21 pairs.
All 21 worker pairs and 64 admin pairs have behavioral proofs. The original
exhaustive acceptance assertions and 120-second bound remain unchanged and red.
Astro endpoint/deployment-middleware discovery/classification remains explicit
pending work, rather than an inferred exemption for the marketing application.

An authenticated mixed-business/session/call attach first returned 202 and now
returns 404 before deduplication. New domain admission checks bind canonical
business/call/provider/session/channel/conversation and unfinished/unblocked state.
The production worker wraps the unchanged voice handler/controller. Real HTTP,
agent, snapshots, worker-role PG and durable completion are exercised with only
external OpenAI/Redis transports fake. See VOICE_ADMISSION.md.

Validation this checkpoint: worker 97 tests, domain 497 tests, agent-core 103
reported tests (includes compiled/source duplicates), worker/domain/audit strict
typechecks and packaged worker build pass. The full LMC run before the isolated
attach-proof bridge reported 99 passed and one failed solely on 78 versus 511
coverage. The new bridge's success/fail-closed tests both pass; inventory mutation
tests pass, including unknown listeners, unresolved routes/imports and local
require traversal. The final combined CLI executes that bridge and records all
21 worker pairs only after a fresh successful real-HTTP/PG acceptance process.
Health probes exercise all seven methods, anonymous/forged business contexts and
each unavailable dependency; these endpoints expose global operational metadata.

Tenant identity is still 66/88 non-null tenant keys (59 generated legacy keys,
seven native email tables). Five mixed-scope tables and 17 global/user/OAuth/
affiliate candidates still require ownership review; all-table CRUD probes do
not settle this design or every association/reassignment requirement.

Remaining: all 426 unprobed discovered admin pairs and landing HTTP scope;
mixed/global ownership and association/reassignment audits; initial/forwarded
email ingestion; full business-hours/FAQ/escalation/booking settings; remaining
branding and legacy fake-provider defaults; dependency/security remediation,
complete CI gates, production startup/headers/health requirements, architecture/
runbook and one-command offline demo. No complete phase/goal claim, hosted fork
or production deployment is made. Real domain/provider setup remains manual.

## Earlier checkpoint — 2026-10-21 (historical)

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


Worker admission checkpoint (2026-10-21): an authenticated mixed-identity attach
regression was reproduced as 202 and fixed to 404 before session deduplication.
The real HTTP/PG/controller acceptance passes with valid A/B phone/browser controls
and durable completion. Existing worker 97, domain 497 and agent-core 103 reported
tests pass; worker/domain typechecks and worker packaged build pass. Voice handler
and controller sources are unchanged. See VOICE_ADMISSION.md. This is not a phase
completion claim; exhaustive HTTP coverage and the remaining original requirements
are still required.
