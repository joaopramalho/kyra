# Codex implementation brief — LMC Super Admin

**Repository:** joaopramalho/kyra
**Base:** lmc/v1 at 013a8d0d366ecc8aad0bc7770ed794d065dc4df2 (refresh/rebase if newer)
**Working branch:** codex/lmc-superadmin-spec (create feature branches as needed)
**Mission:** IMPLEMENT code + tests + incremental reviewable PRs, not just a design. The founder personally creates/configures the first US home-service/HVAC clients (concierge onboarding), then hands over a ready-to-use CRM at /leads. No self-service business creation in this release.

## Architecture and constraints

Existing stack: Next.js App Router admin app, Better Auth, PostgreSQL/pgvector with FORCE RLS and separate Auth/App/System/Worker/Dispatcher roles, Redis, worker, Resend, Google Calendar. Keep current working /leads, /settings/email, account verification, capture, booking and follow-ups intact. Pilot mode defaults closed in production: packages/shared/src/pilot.ts enumerates exact allowed methods and paths. DO NOT disable the flag or open inherited voice/SMS/billing APIs to simplify implementation. New internal paths/methods require exact allowlisting and method/Server Action tests. Avoid production migrations, deployment, tokens, secrets, live provider traffic and direct pushes to lmc/v1. Submit PR(s) for review.

Read docs/RELEASE_GATE.md, docs/PILOT_ADMIN_PAGES.md, docs/TENANT_CONFIGURATION.md, docs/EMAIL_CAPTURE.md, docs/EMAIL_RUNTIME.md, docs/knowledge/architecture.md before implementing. Reuse packages/domain/src/server/lmc/provision-tenant.ts, configure-tenant.ts; packages/contracts/src/lmc-tenant-config.ts; packages/domain/src/server/tenancy.ts, packages/domain/src/authz/index.ts (requirePlatformAdmin), packages/db/src/schema/index.ts (users.platformRole). Existing cli and tests are authoritative for current business/calendar setup and tenant isolation.

## UX deliverables

Build an operator-only /internal shell:
- Overview: aggregate clients by lifecycle (draft, needs_connection, ready_for_test, active, paused, error), readiness/failures, recently edited clients. Data must come from scoped server APIs; never guess dashboard stats.
- /internal/clients: searchable paginated tenant list and create-client wizard.
- /internal/clients/[tenantId]: tabs Overview, Business, Services & Hours, Knowledge, AI & Automation, Integrations, Leads, Operations, Commercial.
- Business: name, timezone, category, owner/contact and address, service ZIPs/cities.
- Services/policies: catalog, aliases, duration, hours, FAQ, price rules, emergency/escalation rules, booking.
- Knowledge: PDF/DOCX/TXT/Markdown uploads (currently max 10 MB), text notes, website import, indexing progress, preview, retry, enable/disable, delete; tenant isolated. Test Knowledge UI shows ranked snippets/source/evidence, proposed grounded response and fallback, no real message.
- AI: tone, confidence/handoff settings, follow-up schedule, no-cost fake-provider test and safe approvals.
- Integrations: Resend HTTPS sender/inbound, webhook/config verification, capture form install snippet, Google Calendar OAuth status/sync freshness and selected calendar, no secret exposure.
- Leads: scoped CRM/status/conversations and manual takeover.
- Operations: sanitized tenant-specific job failures, delivery/calendar sync states, safe retry after authorization and deduplication.
- Commercial: founder-only manual setup fee/monthly subscription amount, currency, notes, payments status; no inherited Polar checkout in pilot.
- Client-facing app remains /leads and /settings/email; customer cannot use /internal. Invite and verification/acceptance must work in pilot mode.

## Critical domain refactor

Current bootstrapLmcTenant() links a new business as a user's owned business. Distinguish platform admin actor from the actual customer's business_owner membership; do NOT create every client as the founder's personal active workspace, and do NOT flip platform admin activeBusinessId to impersonate customers. Use additive audited service layer, reviewed scoped DB authorization, least-privilege RLS. Ensure verified customer ownership, valid invitation, and no unsafe account activation. Draft tenants must be configurable without Google OAuth yet: configureLmcTenant currently requires connected calendar; do not bypass this in final activation. Build separate validated draft editing/persistence and an explicit finalize/activation gate. Allow only the authenticated consenting Google account to complete bound OAuth, with existing one-use/replay/session protections. Keep setup-required page understandable.

## Knowledge/RAG wiring

Existing apps/admin/src/components/live-knowledge-surface.tsx; upload-knowledge-document-sheet.tsx; apps/worker/src/documentExtraction.ts; packages/domain/src/server/knowledge.ts support extraction/chunks/embedding/pgvector keyword+semantic search, but their legacy knowledge/upload API routes are blocked by pilot allowlist. Open ONLY narrowly scoped operator endpoints, reusing tenant-safe domain services; never wholesale-enable legacy routes. Current LMC email path packages/agent-core/src/emailModel.ts + packages/domain/src/server/lmc/worker.ts only uses structured FAQs and classification. Wire tenant-filtered retrieval to a separate informational response-generation path, with strict source grounding. Structured canonical prices/hours/booking/eligibility outrank document prose; docs cannot trigger actions/discounts or instruct the model to ignore policies. Unknown evidence => clarification or human handoff. Retain deterministic qualification, booking, consent, suppression/STOP and injection handling. Remove the current hardcoded roof repair/replacement wording from LMC worker; use configured HVAC services and neutral service-specific questions. Protect document import against SSRF, metadata/secret leakage and mixed-tenant results.

## Security requirements

- requirePlatformAdmin on SERVER for every internal page/API, using canonical Auth session and verified identity; install/implement MFA or admin step-up rather than assuming existing OTP == MFA.
- No public admin signup or role self-escalation. No email-string allowlist as sole auth. Secure one-time privileged bootstrap procedure with explicit operator action and audit.
- Authorization per object, separate platform-admin API boundary from withLmcApi and normal tenant APIs. Customer sessions must get 403/404 on all internal routes/methods/Server Actions.
- Keep FORCE RLS and all auth/app/system/worker DB role boundaries. No general superuser runtime query path, no trusting arbitrary tenantId from URL. Explicit narrowly scoped cross-tenant admin read/operations, with acceptance test proving A/B isolation.
- Audit create/configure/activate/pause/invite/knowledge change/retry with actor, target, timestamp and sanitized changes. Idempotency, optimistic concurrency for destructive state changes, CSRF protection, rate limits, bounded input and secret-safe logs.
- Google OAuth stays session-bound one-time; do not expose access/refresh tokens. Resend on Railway Hobby uses HTTPS API, not SMTP. Do not emit live mail or mutations in automated tests.

## Deliver in reviewable phases

### PR1: security + read-only foundation
/internal authenticated shell, admin MFA, platformRole guard, exact pilot allowlist, read-only paginated clients/overview, audit primitives and tests. Ordinary/unverified users denied, admin permitted, CSRF/method/Server Action controls, no unscoped tenant data.

### PR2: managed client creation + drafts + invite
Correct customer ownership separated from founder/admin, idempotent tenant bootstrap, draft fields/settings/services/hours/FAQ editor, team invitations and working acceptance, validated customer access after activation, A/B tenant isolation tests. Correct existing /setup-required flow.

### PR3: integrations + activation
Real Google OAuth flow for correct consenting user, calendar selection/freshness checks; Resend sender, inbound webhook, capture token/form, tests (fake in CI, controlled real staging manually), activation checklist: lead capture -> model qualification -> reply -> verified booking -> owner summary -> consented followup -> STOP; ability to safely pause. No premature 'active' status.

### PR4: Knowledge + RAG
Secure uploader/source import with tenant-specific storage, indexing/embeddings and verified status, retrieval into informational LMC emails, knowledge test simulator, sources and unanswerable fallback, tenant leakage/injection tests, remove roof-specific fixed answers for HVAC.

### PR5: operations + commercial + QA
Tenant-scoped job failures/retries, sanitized provider health, manual business fee/revenue tracking and reporting, accessibility/responsive states, actionable setup errors. Build, typecheck, lint, strict Semgrep, Gitleaks, audit, RLS and method inventory exact check; update audit fixtures for intentional routes/migrations rather than weakening invariants.

## Definition of done

An authenticated founder with MFA can create TWO separate HVAC tenants, configure drafts before calendar consent, add KB documents, perform source-grounded test answers, connect real Google/Resend under authorized provider flow, run acceptance/smoke tests, activate, invite verified owners and deliver /leads without CLI, JSON hand-edits or direct SQL. Neither owner can see the other's data or /internal. Repeat creating same tenant does not duplicate state. Failed provider prerequisite prevents activation; pausing preserves history. Existing CRM and booking flows still pass CI. Production stays unchanged until manual review.

**Start by implementing PR1 fully with actual source changes and tests, not by writing another plan.** After first PR, proceed sequentially in reviewable slices when feasible; report completed files, CI status, migrations, exact remaining work and review links. Never claim production connectivity without actual evidence.
