# LMC status

## Phase 0

Completed on Linux/WSL2. Tests, lint, typecheck, build, build-config, PostgreSQL migrations, role bootstrap, RLS checks and opted-in integration tests passed. Lint retains 17 existing warnings. The baseline dependency audit reports 76 vulnerabilities (3 critical, 33 high, 30 moderate, 10 low); remediation remains required. See RECON.md and dependency-audit-baseline.json.

## Phase 1 — in progress

Implemented shared LMC identity, provisional neutral logo/colors, dashboard translations and public display strings, onboarding branding, auth subjects and SMTP templates, notification text, public domain defaults, SEO, discovery copy and the LMC README. The historical README and required attribution notices are preserved. Package names, database role names and protocol identifiers remain stable.

Verified after these changes: root tests, lint, typecheck and production build all passed. Additional domain verification after the last notification edits: 393 unit tests, 6 onboarding email integration tests and 22 calendar/public-API/webhook integration tests passed. The new brand-contract and surface checks failed before their changes, then passed. Production HTML verifies dashboard titles, landing logo and canonical URL with `node scripts/verify-brand-build.mjs` after `pnpm build`.

A local browser check showed the LMC login name/logo; Next Devtools then reported no config or session errors. The login pre-renders a session-loading shell, so its hydrated logo cannot be asserted from static login HTML. The previous preview server has since stopped.

Remaining branding review: inherited legal/contact references, legacy marketing screenshot/OG assets and voice-demo presentation. Historical upstream articles retain their source identity and claims; they must not be presented as verified LMC offers. This phase is not yet marked complete.

## Phases 2–6

Pending: email acceptance scenarios, channel interface and fake-provider defaults, inbound email hardening and threading, lead capture, qualification and booking, human handoff, follow-ups, exhaustive table/API tenant probes, security remediation, CI, deployment/runbook documents and one-command demo. Existing voice runtime and worker implementation remain unchanged. No hosted GitHub fork or production deployment has been created.
