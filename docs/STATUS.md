# LMC pilot status — 2026-10-22

## Done

- Authenticated API gate passed: **88/88 tables and 238/238 method/path pairs**, no skips/failures. Original exhaustive timeout and strict assertions retained; test passed in 42.24s.
- Signup, verification, both password-recovery flows, logout and signed webhook proved over real HTTP/PostgreSQL. Cross-tenant state, signature, replay and session-revocation controls passed. Test fixtures stay private; no external email is sent.
- Production denial proof: 164 inherited routes × seven methods, 1,148 requests plus nine controls passed. Voice controllers remain unchanged outside pilot mode.
- Providers: 82 tests passed; fixture compatibility: three passed; audit/provider typechecks and full build passed. Strict SAST: 101 rules, 1,761 targets, zero findings/errors in documented scope. Staged secret scan passed.
- Production dependency gate remains high/critical zero on the unchanged lockfile. Static landing mode and Zapier exclusion are configured; advisory triage is documented.

- Existing-tenant configuration CLI implemented: services, service area, canonical hours, FAQ context, escalation, booking rules and calendar selection. `docs/TENANT_CONFIGURATION.md` documents private output and prerequisites. Real PostgreSQL regression: **95 tests / 15 files passed, no skips**. Workspace/script typechecks and full build passed (16 prerender checks). API isolation revalidation passed in 26.12s; strict SAST passed 101 rules / 1,767 targets with zero findings/errors. Contracts: 6 tests; agent-core: 106; domain unit profile: 428 passed with the existing 69 environment-dependent integrations excluded (not counted as integration proof).

## Still required before release

- Allowed page/static-asset checks and authenticated pilot-page behavior.
- Complete initial business/staff provisioning and Google OAuth initiation through the operator CLI; the existing-tenant configuration command currently requires those records.
- Public-site content cleanup, production Compose profile and an executed isolated backup/restore rehearsal.
- Hosted CI with real PostgreSQL integrations and no skipped integration. No hosted run or deployment has occurred.

## Your manual steps

- Supply LMC contact/legal/physical-address data (`[FILL]` until supplied) and legal review before public release.
- Configure DNS, Resend in/out/webhook signing, Google Calendar OAuth and LLM keys through the staging template/checklist when ready.
- Supply an authorized hosting/repository destination and real deployment credentials when the local release gate is ready.
