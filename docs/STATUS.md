# LMC pilot status — 2026-10-22

## Done

- Production routing defaults to the pilot boundary; unknown inherited routes return 404. Production denial proof: 164 routes × seven methods, 1,148 probes plus nine controls passed at the previous checkpoint.
- Current authenticated API audit: **88/88 tables**, **220/231 method/path pairs**, zero observed failures. Exact equality/no-skips/no-failures assertions remain; the gate still fails on 11 uncovered pairs.
- Real A/B method, session, workspace, capture, opt-out and calendar-capability probes pass. Dotted unsubscribe tokens now work; opt-out cancels queued lead-facing work while preserving owner alerts and other contacts. Calendar returns to reachable pilot settings and rejects HEAD before state consumption.
- Production dependency gate: zero high/critical; one moderate and one low tracked in DEV_ADVISORIES.md. Static landing compiler dependencies classified; unused standalone Zapier excluded from this CI.
- Current targeted proxy/calendar tests: 25 passed. Pilot inventory/mutation tests: six passed. Worker API audit, method guards, session/workspace, public capabilities and opt-out queue tests passed. Audit/domain/admin typechecks passed. Email/booking/follow-up regression run: 68 passed without skips. Full build passed, including 16 prerender checks and unchanged embed output. Strict SAST passed in its existing scope (101 rules, 1,758 targets, zero findings/errors).

## Still required before release

- Complete ten authentication controls and a valid signed webhook HTTP positive control; verify all allowed pages/assets and rerun final release/security checks.
- Tenant configuration CLI; remove inherited public articles/claims/legal/contact details; production Compose profile and an executed isolated backup/restore rehearsal.
- Hosted CI with real PostgreSQL integrations and no skipped pilot integration. No hosted run or deployment has been performed.

## Your manual steps

- Supply LMC contact/legal/physical-address details (`[FILL]` until supplied) and obtain legal review before public release.
- Configure DNS, Resend in/out and webhook signing, Google Calendar OAuth and LLM credentials through the environment template/checklist when staging is ready.
- Provide an authorized hosting/repository destination and real deployment credentials when the local release gate is ready.
