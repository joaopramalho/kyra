# Pilot release gate

**Active — local gates passed; hosted CI not yet verified.** Features remain frozen. No deployment, real provider connectivity or authenticated browser QA is claimed.

## Done locally

- Production-default admin/worker allowlist; all other routes denied. Separate static public site: six pages / eighteen files, inherited claims excluded, required notices preserved, legal/contact details [FILL].
- Strict 88-table / 238-method isolation, configured-tenant dashboard guards and verified-operator tenant/calendar CLI. Voice controllers, applied migrations and database grants remain unchanged.
- Next 16.4.1 / DOMPurify 3.4.17; frozen install, full build, types/lint and production audit high 0 / critical 0. Lower-severity/development triage: DEV_ADVISORIES.md.
- Complete isolated runner: **2,274 passed, zero failures/skips**, including every original acceptance source; 24 configuration tests passed. Approved fixture contexts preserve all assertions, quotas and deadlines. Separate production test: 2,417 HTTP probes passed. See PILOT_CI.md and RELEASE_GATE.md.
- Production Compose, provider template/preflight and manual checklist; all three patched images built. Recovery passed exact 88-table equality, migration journal, three RLS checks, private storage, tampered-backup rejection and cleanup. See PILOT_STAGING.md.
- Final strict Semgrep: 101 rules / 1,808 targets, zero findings/errors; staged secret scan passed. Policies and existing default scan-scope limits remain unchanged.

## Still required

- Execute and inspect actual hosted unit/PostgreSQL, Gitleaks, strict Semgrep and production audit jobs. Local success does not certify hosted execution.

## Your manual steps

- Complete the prepared GitHub CLI browser login (or connect GitHub) and confirm the authorized fork account so hosted CI can run.
- Supply approved entity/contact/physical-address/legal [FILL] details; public pages remain noindex.
- Configure DNS, Resend sending/receiving/webhook signing, Google OAuth consent, LLM keys and hosting using PILOT_STAGING.md; complete actual calendar consent before release.
