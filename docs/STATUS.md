# Pilot release gate

**Active — local validation only.** No hosted CI run or deployment is claimed. New features remain frozen; voice controllers, applied migrations and database grants remain unchanged.

## Done locally

- Production-default deny-by-default admin/worker routing; permitted email/CRM/auth/session/capture/unsubscribe/webhook/health/calendar callback only. Marketing is a separate static artifact.
- Strict isolation: 88-table equality and all 238 API-method combinations, with actual PostgreSQL roles, no skipped/failed probes and the original exhaustive timeout. Protected dashboard pages have 88 additional HTTP controls plus a direct PostgreSQL access-guard case; verified identity, canonical business membership and valid tenant configuration are mandatory.
- Public authentication/static production-default audit: 21 display paths and 149 static paths, all seven methods, 1,218 probes; exact-byte positives and closed-asset controls. Original tests remain unchanged. See PILOT_PUBLIC_ASSETS.md and PILOT_ADMIN_PAGES.md.
- Production dependency audit: zero high/critical advisories at the unchanged lockfile checkpoint. Dev-only triage is in DEV_ADVISORIES.md; unused standalone Zapier is excluded from the pilot build.
- Verified-operator CLI bootstrap, tenant configuration, calendar authorization and inspection; strict private outputs, App/Auth role separation, ownership checks and real PostgreSQL tests. See TENANT_CONFIGURATION.md.
- Public artifact: six static pages / eighteen files; inherited claims/articles/legal/contact content excluded, required notices preserved and LMC details marked [FILL]. Artifact/tamper/HTTP checks and public desktop/mobile QA passed. See STATIC_PUBLIC_SITE.md.
- Workspace/script types, full build, sixteen public prerender checks, targeted lint and original proxy tests passed. Strict Semgrep and secret scans remain release gates. The wider admin unit checkpoint passed 925 with 27 existing environment integration exclusions; this is not no-skip hosted integration evidence. Authenticated visual browser QA is not claimed because the browser URL policy denied access.

- Dedicated production Compose profile, real-provider private template/preflight and DNS/key/consent checklist completed. Three production images built; isolated PostgreSQL/local-storage recovery passed with exact 88-table name equality, preserved migration journal, three RLS checks, private 0600 storage, tampered-backup rejection and confirmed cleanup. Twelve configuration tests and strict Semgrep (101 rules / 1,802 targets, zero findings/errors) passed. See PILOT_STAGING.md. No real provider call or HTTPS deployment is claimed.

## Still required

- Prepare and execute hosted units plus real PostgreSQL pilot integration with zero skipped integration, Gitleaks, strict Semgrep and production audit. Local checks do not establish hosted success.

## Your manual steps

- Supply approved entity, contact, physical address and legal details for [FILL] before release; public pages remain noindex.
- Configure domain DNS, Resend sending/receiving/webhook signing, Google OAuth consent and LLM keys through PILOT_STAGING.md; complete actual calendar consent.
- Supply an authorized repository/hosting destination and credentials when the local release gate is ready.
