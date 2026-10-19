# Decisions

- 2026-10-19: Use the temporary GitLab upstream mirror linked by the official LobbyStack website because the original GitHub endpoint is unavailable. Preserve all existing copyright notices.
- 2026-10-19: Keep business_id unchanged during reconnaissance; decide the requested tenant_id migration only after catalog and policy inspection.
- 2026-10-19: Treat the latest request to execute everything as authorization for the complete scope, subject to the explicit license, baseline and credential gates. No real provider credentials are needed or requested during reconnaissance.
