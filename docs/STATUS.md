# LMC pilot status — 2026-10-22

## Done

- Production admin/worker deny-by-default boundary and allowlist; inherited voice controllers unchanged outside pilot mode.
- Real HTTP/PostgreSQL isolation: 88/88 tables and 238/238 method/path pairs, no skips/failures. Signup, verification, recovery, session revocation, signed webhook and cross-tenant controls covered.
- Production dependencies: high/critical zero on the unchanged lockfile; dev advisory triage and standalone Zapier exclusion documented.
- Trusted tenant CLI: initial business/staff creation, services/area/hours/FAQ context/escalation/booking settings, private Google OAuth issuance and calendar selection. Ten setup/configuration integration cases passed without skips; real Google consent remains manual.
- Public site: six static pages / 18 files, no JS/server/DB/trackers, LMC `[FILL]` details and required attribution. Existing 81 tests, 11 artifact regressions, two unchanged inventory tests, 56 HTTP controls, build, types, lint and desktop/mobile QA passed. Static archive was extracted and revalidated. Strict SAST passed 101 rules / 1,794 targets with zero findings/errors; staged secret scan passed. See STATIC_PUBLIC_SITE.md.

## Still required before release

- Allowed admin page/static-asset checks and authenticated pilot-page behavior.
- Production Compose profile, real-provider environment/checklist and an executed isolated backup/restore rehearsal.
- Hosted CI with real PostgreSQL integrations and no skipped integration, strict security/dependency gates. Workflow changes are local; no hosted run or deployment has occurred.

## Your manual steps

- Supply approved LMC entity/contact/address/legal details for `[FILL]` before public release; the site remains noindex.
- Configure DNS, Resend in/out/webhook signing, Google OAuth/consent and LLM keys through the staging template/checklist when ready.
- Supply an authorized repository/hosting destination and credentials when the local release gate is ready.
