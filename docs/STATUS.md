# LMC status

## Current checkpoint — 2026-10-21

Earlier dated sections below are historical checkpoints and are superseded by this section.

Implemented and verified: durable lead capture, authenticated inbound replies, qualification, real-calendar-backed offers, verified email booking/reschedule/cancel, owner summaries and same-thread human replies, bounded consented follow-ups, suppression, signed inbound Resend adaptation and network-free provider doubles. Email changes reuse canonical availability/staff locks and calendar outbox behavior; no synthetic phone or SMS work is created. Calendar event IDs let a reschedule ignore only its own mirrored event; other conflicts remain blocked. Uncertain sends stop before Resend's idempotency window expires and alert the owner for reconciliation.

The full LMC command currently reports 77 passing tests across 11 suites, including all 19 email a–l scenarios through HTTP, the real application worker and PostgreSQL. It still exits nonzero because the exhaustive table/API isolation audit helper for scenario m has not been implemented. No complete tenant-isolation acceptance or phase-completion claim is made. The focused seven-table storage probe is not a substitute for scenario m.

Added a tenant-scoped CRM/configuration service with read roles, scheduler-only conversation actions, administrator-only configuration and capture-token rotation, service ownership checks, a fixed platform sending identity and cursor-based history. Conversation/action capabilities are removed from model history and CRM read responses. Four real-PostgreSQL workspace tests pass.

Next API integration now includes lead list/history, human reply, pause/resume, email settings, capture-token rotation, public capture, unsubscribe and the email webhook. Fifteen focused route/environment/CSRF tests pass. Operator operations retain origin-based CSRF protection; only capability-protected public intake and unsubscribe receive narrow exceptions. Local live HTTP checks verify unauthenticated CRM 401, invalid capture token 404 and cross-origin capture preflight 204. Next Devtools compiled lead/capture routes without issues; browser error inspection had no connected browser session.

The operator UI now has `/leads` and `/settings/email`, with navigation and EN/FR resources. Leads show current-status counts, search/paging, structured qualification, consent and paginated conversation history, including separately labeled owner notifications. Scheduler actions queue same-thread human replies or pause/resume AI; ambiguous reply retries retain their request ID. Workspace changes clear selected conversations and drafts. Email settings expose canonical services/aliases, area, fixed sender identity, footer address, emergency response, prices, tone, tool permissions and bounded follow-up controls. Capture-token replacement requires acknowledging that existing forms stop working. Viewer controls are read-only. Lead and settings data use the existing analytics capture exclusion marker.

Both new surfaces were exercised red before implementation. Seven component tests now cover safe text rendering, idempotent human retry, viewer permissions, workspace changes, pause scoping, editable settings and token replacement acknowledgment. Translation and existing navigation assertions retain the old routes and add the new ones. Both pages compile through Next Devtools without issues. The complete admin suite passes 902 tests (27 gated integration tests not executed in that unit run; form integration is run separately); admin typecheck, targeted ESLint checks and the admin production build pass. No authenticated browser visual check has been performed at this checkpoint.

Website capture now includes a dependency-free `lmc-form.js`, a generated install snippet in email settings, explicit unchecked follow-up consent, plain DOM rendering and stable UUID retries. Unit tests exercise the actual loader and reject unsafe snippet input. A real-HTTP/PostgreSQL test simulates a lost acknowledgment after acceptance and requires one persisted lead and one reply from the real worker through fake external providers. A browser preview verified the cross-origin local request and safe invalid-token result. Installation/CSP/test instructions are in EMAIL_CAPTURE.md. No real provider sends were made.

Remaining required work: complete business-hours/FAQ/escalation/booking settings UX; production email-worker bootstrap and real-model wiring; consistent fake defaults across legacy runtime entry points; initial-email/forwarded-notification ingestion; exhaustive existing-table/API tenant probes and tenant_id requirements; dependency/security remediation, CI, startup/health gates, architecture/runbook documents and the one-command full demo. Remaining Phase 1 legal/marketing/voice-demo review also remains open. No real provider email or production deployment has been made.


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
