# Tenant configuration CLI

Run from the repository root in Linux/WSL with Node 22 and pnpm. This trusted operator command configures an **existing** business; it does not expose another public endpoint. Initial business/staff provisioning and Google OAuth authorization remain prerequisites. The pilot release gate is not complete until that initial operator flow and the authenticated pilot pages are verified.

Copy `docs/examples/tenant.example.json` to a private working directory and replace every `[FILL]` value. The template intentionally fails validation until real identities and approved business details are supplied. Do not commit a populated file. Use a verified business administrator's user UUID and an active staff member and Google calendar connection owned by that same business. Provider access/refresh tokens are never accepted in this JSON.

Validate without connecting to a database:

```sh
pnpm --silent lmc:tenant --config /private/tenant.json --check
```

The execution environment must supply the dedicated App and Auth database credentials used by the application, and the approved sender/base URL/receiving domain. `.env` and `.env.local` are loaded without replacing inherited values; set `LOBBYSTACK_SKIP_ENV_FILES=true` to use only the supplied environment. Both actual database logins are checked even in development. Do not use a migrator/superuser connection as a runtime fallback. Production must use real provider configuration; development/test default to fake providers.

Apply using a new absolute output filename in an operator-controlled private directory:

```sh
pnpm --silent lmc:tenant --config /private/tenant.json --capabilities-file /private/new-tenant-capabilities.json
```

The output file is exclusively created with mode `0600` before any database mutation. An existing file is refused; neither the file nor tenant configuration is overwritten in that case. Standard output contains only status, tenant UUID, service count and synchronization flags. Initial capture credentials are written only to the private file. Keep this file private and back it up securely. The database stores only the capture token hash. Repeated configuration preserves the existing token and cannot recover its plaintext; a new output file then contains a preservation note. A post-commit file-write failure returns `TENANT_CONFIGURED_OUTPUT_FAILED`; inspect the tenant state and use the existing operator token-rotation flow before retrying capture setup.

The operation validates the complete JSON, verified operator, administrator membership, sender identity, owned calendar connection and active staff before writing. Services are upserted by business and slug, retaining stable IDs. Unrelated catalog entries are preserved. Configured services are assigned to the selected staff member. Hours replace the business schedule: day `0` is Sunday, minutes are local wall-clock minutes, omitted weekdays are closed, and overnight intervals are rejected. Repeated identical configuration makes no changes.

Service area, FAQs, escalation, follow-ups and email rules are stored in native email settings. FAQs enter the trusted model classification context; this does not add a free-form FAQ answer engine. Configured escalation keywords pause AI and use the approved handoff reply and existing owner alert. Emergency and injection handling retain precedence. Follow-ups are disabled in the template until explicitly approved.

Booking notice is in minutes and the horizon is one to seven local calendar days, including the current local day. Rules apply both to offered slots and final email booking/rescheduling checks. Requester verification cannot be disabled. Selecting a different calendar or staff member invalidates old busy blocks and sync freshness and queues reconciliation. The CLI never manufactures a successful calendar sync; the worker must complete synchronization before booking becomes available. It does not change voice scheduling.

Integration coverage in `tests/lmc/tenant-config.acceptance.ts` uses real PostgreSQL roles and exercises canonical state, idempotency, foreign-tenant and viewer denial, unverified-operator denial, calendar invalidation, trusted FAQ context, escalation, final booking rules, CLI execution, private file permissions and refusal to overwrite. Provider credentials are not required by these tests.
