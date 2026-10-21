# Tenant isolation audit

The database audit discovers its inventory from `pg_catalog`, not ORM table lists.
API inventory is independently discovered from exported route methods using the
TypeScript AST, including implicit HEAD and OPTIONS. At this checkpoint there are
88 application tables, 127 API paths, and 469 method/path pairs.

## Database checks implemented

- Every application table must enable and force RLS and have policies.
- All seven runtime roles must exist without superuser or BYPASSRLS flags.
- App, system, worker, and dispatcher are checked through actual authenticated
  connections. The app role must not inherit any other database role.
- Distinct synthetic A/B rows are committed on every table with constraints and
  RLS enabled. Administrative positive controls prove the target rows exist.
- The actual app connection reads its own allowed rows, then attempts foreign
  reads, updates, and deletes with selected-company tampering, service-actor
  spoofing, and absent-user contexts. Mutations roll back.
- INSERT probes create fresh committed prerequisite rows without a target row.
  Each candidate is inserted and rolled back administratively, materialized, then
  inserted and rolled back again to prove the exact payload is valid. The app
  connection attempts that payload under six foreign contexts. Only PostgreSQL
  authorization denial counts as a denied insertion; FK, uniqueness, or schema
  errors fail the audit. Column-grant checks reject probes whose extra forbidden
  columns could mask an RLS defect.
- A temporary test-owned table with FORCE RLS and a deliberately permissive policy
  must be detected by all four operation probes. It and its rows are removed.
- Fixture cleanup uses only the synthetic rows' exact primary keys, in dependency
  order. Required dependencies that cannot be seeded are failures, never coverage.

These tests found that `lobbystack_app` could select the `system` actor and access
another business without membership. Migration 0072 restricts that actor to a
separate authenticated identity. See [internal identity setup](SYSTEM_DATABASE_IDENTITY.md).
Original business creation and affiliate integration tests, actual global auth
email enqueue/deduplication/rollback, and the full domain suite were checked after
the change. No HTTP exploit was established from the original SQL finding.

## Running locally

Use an isolated local test database and explicit role URLs; the helper rejects
production or a non-test database and disallows privileged role fallback. Keep
credentials in a private environment file outside the repository. Load it in the
shell before running:

```sh
pnpm exec vitest run --config tests/lmc/vitest.config.mts \
  tests/lmc/isolation-inventory.acceptance.ts \
  tests/lmc/isolation-fixtures.acceptance.ts \
  tests/lmc/isolation-grants.acceptance.ts \
  tests/lmc/isolation-system.acceptance.ts \
  tests/lmc/isolation-tables.acceptance.ts \
  tests/lmc/isolation-inserts.acceptance.ts

pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/lmc-isolation-inventory.ts /absolute/output/inventory.json
```

The inventory artifact contains schema metadata and role assertions, not tenant
rows or connection credentials. It is generated outside source control; generating
it does not prove behavioral coverage.

## Remaining acceptance work

The exhaustive `isolation.acceptance.ts` gate is still red because the combined
table/API audit helper has not been implemented. No API method is counted as
behaviorally probed solely because it was discovered. Authenticated tenant A/B
requests, foreign resource IDs, mutations, transport credentials, and provider
webhooks need route-specific controls and persisted side-effect assertions.

The app mutation probes also do not establish equivalent CRUD coverage for every
other service login. Database user context is supplied by trusted server code;
these checks do not prove that arbitrary HTTP inputs cannot select that context.
The legacy schema still needs the requested `tenant_id NOT NULL` review/migration
for tenant-owned tables. Global auth/platform relations require explicit ownership
classification. Neither this document nor the focused database suite declares
the complete isolation requirement achieved.
