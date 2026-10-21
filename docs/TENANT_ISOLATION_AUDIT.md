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

The exhaustive `isolation.acceptance.ts` gate executes the combined table/API
helper and remains red because 453 discovered method/path pairs have no
behavioral probe yet. No API method is counted as
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


## First live HTTP probes

`isolation-http.acceptance.ts` currently probes only GET, HEAD and OPTIONS for
`/api/leads` and `/api/leads/[leadId]`: six method/path pairs out of the discovered
469. It uses the running Next server, real Better Auth password sign-in/cookies,
real role-specific PostgreSQL connections, and two synthetic businesses. Own A/B
responses are positive controls; anonymous requests, forged actor/user headers,
foreign business headers/query parameters and foreign resource IDs must fail
without exposing foreign IDs/content. Read responses must prevent shared caching.
OPTIONS is checked as metadata-only. Sessions are signed out and synthetic
identities/accounts/leads are removed afterward. No real provider is called.

Start the local admin against the same isolated test database with fake providers
before running this HTTP suite. `LMC_TEST_HTTP_BASE_URL` can select another explicit
HTTP loopback origin; the default is `http://localhost:3000`. Sign-in must return the
exact synthetic user seeded in the guarded test database, binding the test to that
server/database. This focused suite does not count the auth catch-all route as
fully audited and does not replace the remaining route-specific mutation probes.


The combined report can be generated with an explicit output path:

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/lmc-isolation-audit.ts /absolute/output/audit.json
```

This command exits unsuccessfully if any table/route is uncovered or any probe
fails. The current expected summary is 88/88 tables and 16/469 method/path pairs,
with 453 uncovered method/path pairs. The original acceptance assertions are
unchanged: this partial report cannot make the exhaustive gate green.


## Live mutation probes

`isolation-http-mutations.acceptance.ts` adds ten method/path pairs:
POST/OPTIONS human replies, PATCH/OPTIONS automation, GET/HEAD/PUT/OPTIONS email
settings, and POST/OPTIONS capture-token rotation. The combined audit now probes
16 of 469 pairs and reports every remaining 453 as uncovered.

Real owner writes must succeed and persist the exact intended action in both
businesses without changing the other business. Human replies must create one
queued human message and one send job, pause automation, and replay idempotently.
Pause state, settings tone, and a new token's stored hash are checked directly.
The old capture token must fail hash verification after rotation.

Each denied attempt compares complete before/after state for all seven email
tables plus contacts, appointments and tenant-scoped outbox rows in both
businesses. Cases cover anonymous access, a viewer, foreign business headers and
queries, forged user/actor headers, foreign lead IDs, and an invalid CSRF origin.
Settings also reject another business's service IDs and a sender outside the
platform sending identity. OPTIONS must return only method metadata. The server
must report fake providers before these action probes proceed.

The probes found that the foreign-lead reply path returned HTTP 500 despite
rejecting the write. A typed domain error now returns 404 after membership checks,
matching lead reads and automation. The red HTTP case was retained and passed
after the production change.

Login fixtures obey the unchanged five-per-minute production rule. Only a rejected
429 sign-in is retried, at most twice, after a validated Retry-After of 0–60 seconds.
Successful or uncertain writes are never replayed by this retry path. The read
HTTP fixture's overall time allowance includes that quota wait; its access,
content, cache, and status assertions are unchanged. The email-response latency
acceptance tests and the original exhaustive 120-second gate are unchanged.


Migration 0073 and `isolation-tenant-columns.acceptance.ts` additionally verify
stored, non-null tenant identities on all directly business-owned legacy
relations. See [tenant identity scope and remaining ownership work](TENANT_IDENTITY.md).
The general catalog checker rejects missing or divergent generated keys on this
class of table. Mixed and globally scoped relations remain in every behavioral
probe and in the outstanding ownership review.


## HTTP fixture lifecycle

Probe groups can share one real authenticated A/B context, preserving the original
assertions and login quota. Standalone focused suites still use the same setup.
Fixtures sign out before removing synthetic identities.

A deliberate failing-probe regression holds a real parent FK lock, waits until
cleanup is blocked, and then commits an outbox row. The former teardown left that
row orphaned through ON DELETE SET NULL. Cleanup now locks the synthetic business
parents and deletes their queue rows and parents in one transaction, before the
remaining fixture/user cleanup. The same red concurrency case passes afterward.
All cleanup remains scoped to the randomly generated fixture IDs in the guarded
local test database. No background worker or production protection is disabled.
