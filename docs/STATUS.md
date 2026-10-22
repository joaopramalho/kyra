# LMC pilot status — 2026-10-22

## Done

- Authenticated API gate passed: **88/88 tables and 238/238 method/path pairs**, no skips/failures. Original exhaustive timeout and strict assertions retained; test passed in 42.24s.
- Signup, verification, both password-recovery flows, logout and signed webhook proved over real HTTP/PostgreSQL. Cross-tenant state, signature, replay and session-revocation controls passed. Test fixtures stay private; no external email is sent.
- Production denial proof: 164 inherited routes × seven methods, 1,148 requests plus nine controls passed. Voice controllers remain unchanged outside pilot mode.
- Providers: 82 tests passed; fixture compatibility: three passed; audit/provider typechecks and full build passed. Strict SAST: 101 rules, 1,761 targets, zero findings/errors in documented scope. Staged secret scan passed.
- Production dependency gate remains high/critical zero on the unchanged lockfile. Static landing mode and Zapier exclusion are configured; advisory triage is documented.

## Still required before release

- Allowed page/static-asset checks and authenticated pilot-page behavior.
- Tenant configuration CLI, public-site content cleanup, production Compose profile and an executed isolated backup/restore rehearsal.
- Hosted CI with real PostgreSQL integrations and no skipped integration. No hosted run or deployment has occurred.

## Your manual steps

- Supply LMC contact/legal/physical-address data (`[FILL]` until supplied) and legal review before public release.
- Configure DNS, Resend in/out/webhook signing, Google Calendar OAuth and LLM keys through the staging template/checklist when ready.
- Supply an authorized hosting/repository destination and real deployment credentials when the local release gate is ready.
