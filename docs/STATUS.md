# Pilot release gate

**Active; not released.** Feature freeze remains. No hosted CI, deployment, real provider connectivity or authenticated browser QA is claimed.

## Done locally

- Production-default deny-by-default admin/worker routing, separate static public artifact, strict 88-table/238-method isolation, canonical configured-tenant dashboard guards and operator tenant/calendar CLI. Voice controllers, applied migrations and database grants remain unchanged.
- Next 16.4.1 / DOMPurify 3.4.17 security refresh: frozen install, full build, workspace/script types, targeted lint and production audit high 0 / critical 0. Remaining lower-severity/development advisories are documented in DEV_ADVISORIES.md.
- Patched production HTTP build: 2,417 probes, including 21 auth display paths, 148 static assets, 172 inherited routes under seven methods and two Server Action controls; zero failures. See PILOT_PUBLIC_ASSETS.md.
- Separate public site has six static pages / eighteen files, preserved notices and [FILL] legal/contact details. Dedicated production Compose, real-provider template/preflight, DNS/consent checklist and isolated recovery mechanism are implemented. All three patched production images built; fresh recovery passed all 88 tables, private storage, migration journal, three RLS checks, tampered-backup rejection and owned-resource cleanup.
- Strict Semgrep: 101 rules / 1,807 targets, zero findings/errors; staged and full-history secret scans passed with unchanged policies. Build-configuration tests passed.
- Draft dedicated hosted workflow and strict report verifier prepared. Local disposable PostgreSQL/Redis run passed 1,965 workspace and 166 script tests with zero skips. Acceptance attempt: 137 passed / 6 failed / 0 skipped; cleanup passed. This is a failed gate, not no-skip success. Failures include legacy/pilot context mismatch, shared OTP quota and tenant inspection timeout. No test assertion or deadline was relaxed.

## Still required

- Resolve all six acceptance failures and validate the complete workflow. A limited CI fixture-context proposal awaits approval after automatic review rejected a broader runner change; the runner has not been changed by that proposal.
- Execute and inspect actual hosted unit/PostgreSQL, Gitleaks, strict Semgrep and production audit jobs. Local runs do not certify hosted success.

## Your manual steps

- Connect GitHub and identify the authorized fork account/repository so hosted CI can run.
- Supply approved entity, contact, physical address and legal details for [FILL]; public pages remain noindex.
- Configure domain/DNS, Resend sending/receiving/webhook signing, Google OAuth consent and LLM keys using PILOT_STAGING.md; approve the hosting destination and complete actual calendar consent before release.

Subsequent tenant diagnosis: the five original setup cases passed unchanged with zero skips on the original dedicated PostgreSQL 18 instance; inspection completed in 986 ms. This does not certify the disposable PostgreSQL 16 context or erase the six failures in the combined gate.
