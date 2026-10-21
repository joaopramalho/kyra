# Decisions

- 2026-10-19: Use the temporary GitLab upstream mirror linked by the official LobbyStack website because the original GitHub endpoint is unavailable. Preserve all existing copyright notices.
- 2026-10-19: Keep business_id unchanged during reconnaissance; decide the requested tenant_id migration only after catalog and policy inspection.
- 2026-10-19: Treat the latest request to execute everything as authorization for the complete scope, subject to the explicit license, baseline and credential gates. No real provider credentials are needed or requested during reconnaissance.
- 2026-10-19: User explicitly requested completing the full scope without stopping over licensing. Upstream MIT evidence was already obtained. Keep the existing notices in place and continue technical work.
- 2026-10-19: On Windows, execute the existing Unix-style build environment assignment with pnpm shell-emulator enabled. Record this invocation as environment setup; do not change production voice behavior for local tooling compatibility.

- 2026-10-20: Centralize public brand identity in @lobbystack/shared/brand. Keep package names, database roles and protocol identifiers stable to avoid voice/runtime migrations. Use a provisional neutral slate/white theme and local SVG logo; final brand approval remains a TODO.

- 2026-10-20: Preserve historical upstream blog comparisons and their original tests as attributed historical material. Do not rename upstream offers, customer claims or legal entity names into purported LMC facts. Remove the inherited legalName from LMC organization metadata; production legal documents require owner review.

- 2026-10-20: Add email persistence with tenant_id referencing businesses.id; preserve the existing voice schema and business context names. Use a separate durable email queue so the voice dispatcher and latency path remain unchanged. An unscoped dispatcher may discover queue tenant IDs/status/timing, with no payload privilege; workers read payloads only inside a tenant transaction.
- 2026-10-20: Run the new end-to-end acceptance gate explicitly with pnpm test:lmc against an isolated local database. Its incomplete workflow/audit harnesses must fail, and will not be skipped or treated as passing until implemented.

- 2026-10-20: Separate platform instructions from untrusted model input. Model output supplies bounded intent/qualification facts only; prices, availability, booking permissions and sender verification must be checked by application code before side effects.
- 2026-10-20: Conversation reply tokens contain a tenant UUID routing prefix and 128 random secret bits, fitting an email local-part. Store and compare a SHA-256 token hash inside the resolved tenant. Routing alone grants no access. Action links use HMAC-SHA256, explicit purpose and mandatory expiry for appointment changes; unsubscribe links may remain valid for the life of the lead.
