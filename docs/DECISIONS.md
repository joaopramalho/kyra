# Decisions

- 2026-10-19: Use the temporary GitLab upstream mirror linked by the official LobbyStack website because the original GitHub endpoint is unavailable. Preserve all existing copyright notices.
- 2026-10-19: Keep business_id unchanged during reconnaissance; decide the requested tenant_id migration only after catalog and policy inspection.
- 2026-10-19: Treat the latest request to execute everything as authorization for the complete scope, subject to the explicit license, baseline and credential gates. No real provider credentials are needed or requested during reconnaissance.
- 2026-10-19: User explicitly requested completing the full scope without stopping over licensing. Upstream MIT evidence was already obtained. Keep the existing notices in place and continue technical work.
- 2026-10-19: On Windows, execute the existing Unix-style build environment assignment with pnpm shell-emulator enabled. Record this invocation as environment setup; do not change production voice behavior for local tooling compatibility.
