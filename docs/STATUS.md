# LMC pilot status — 2026-10-22

## Done

- Feature scope frozen to the email pilot; criteria in [RELEASE_GATE.md](RELEASE_GATE.md).
- Admin/worker production routing defaults to the pilot boundary. Unknown legacy routes return 404; allowed paths restrict methods. Worker controllers and voice behavior remain unchanged outside pilot mode.
- SMTP upgraded to 10.0.9 with a failing-before/passing-after TLS identity regression. Six dependency regressions pass; production audit has zero high/critical (one moderate, one low tracked).
- Proxy tests: 13 passed. Worker: 101 passed. Providers: 81 passed. Full workspace/scripts typecheck passed. Admin production and static landing builds passed. Admin unit run: 913 passed, 27 integration tests skipped without DB; not hosted integration evidence.
- Strict Semgrep: 101 rules, 1,757 targets, zero findings/errors; the new loopback runner also passes its targeted scan. CI configuration tests: nine passed.
- Static landing compiler dependencies classified; standalone Zapier excluded from this CI. Development advisories documented. Inherited deployment requires explicit user-owned LMC configuration.

## Still required before release

- Authenticated HTTP allowlist audit across all methods and all 88 DB table probes. Production denied-route proof already passes: 164 independently discovered routes × seven methods = 1,148 HTTP probes plus nine controls. Earlier broad acceptance: 121 passed, one route-coverage failure; not a release pass.
- Tenant configuration CLI, public-site content cleanup, production Compose profile and isolated backup/restore rehearsal.
- Hosted CI with real PostgreSQL integrations and no skipped integration, plus final security scans/builds. CI configuration changes have not yet run on a hosted runner.

## Your manual steps

- Supply LMC contact/legal/physical-address information (until then `[FILL]`).
- Configure sending/receiving DNS, Resend credentials/webhook signing secret, Google Calendar OAuth and LLM credentials using the documented environment template; legal review before public release.
- Provide an authorized hosting/repository destination and production credentials when staging/hosted CI are ready. No deployment has been performed.
