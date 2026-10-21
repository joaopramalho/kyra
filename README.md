# Lead My Company

Lead My Company helps service businesses capture, engage, and convert more leads into booked jobs — automatically, 24/7.

LMC is being built for US home-service contractors, starting with roofing businesses in Florida. The target workflow is email lead capture, qualification, calendar-backed estimate booking, owner summaries and human handoff. See [STATUS](docs/STATUS.md) for what is implemented; the complete email workflow and default fake-provider demo are not yet available.

## Local development

Use Linux or WSL2, Node 22.12 or newer and pnpm 10.30.3. The security tests intentionally depend on POSIX permissions and symbolic links.

```sh
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
pnpm -r --filter './packages/**' build
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

The default test command uses fake collaborators in unit tests and skips explicitly opted-in database tests. It does not send live email or make live voice calls. Do not enter production provider credentials for local tests. The production adapters are inherited and the dev runtime is not yet fully switched to fake providers; that is required before the email demo is considered complete.

For integration tests, use an isolated local PostgreSQL database with pgvector and Redis. Never point these tests at production. The repository includes Docker Compose infrastructure:

```sh
docker compose up -d postgres redis
pnpm db:migrate
pnpm --filter @lobbystack/db exec tsx src/cli.ts bootstrap
pnpm db:check
VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls
pnpm test:reliability
```

Configure local connection URLs using `.env.example` and the database-role documentation. `LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL` must point to a dedicated local database whose name contains `test`. Auth and Redis integration tests have separate explicit opt-ins. Keep secret values in ignored local environment files, never in source control.

Run `pnpm dev` for the dashboard, worker and marketing site, or `pnpm dev:admin` for the dashboard. The dashboard defaults to port 3000. Real domain DNS, provider credentials and production operations are a separate deployment step, not needed for the unit suite.

## Architecture

- `apps/admin`: Next.js dashboard, authentication, APIs and embedded channels.
- `apps/worker`: asynchronous jobs, transactional outbox and the existing live voice controller.
- `apps/landing`: Astro public site.
- `packages/domain`: business workflows and booking logic.
- `packages/db`: PostgreSQL schema, migrations, role-specific clients and RLS.
- `packages/agent-core`: agent tools and voice runtime.
- `packages/providers`: provider adapters.
- `packages/shared/src/brand.ts`: shared LMC name, tagline, URL, colors and provisional logo path.

The existing voice runtime remains intact. Email must be added behind a channel interface without changing voice latency or audio behavior. Internal workspace names and database role names retain `lobbystack` to avoid unnecessary runtime migrations.

## Project status and verification

The Linux baseline passes tests, lint, typecheck and build. The recorded baseline dependency audit has unresolved vulnerabilities. Rebranding is in progress; email acceptance scenarios, full tenant isolation probes and security remediation remain required. No production-readiness claim is made.

- [Reconnaissance and baseline](docs/RECON.md)
- [Implementation status](docs/STATUS.md)
- [Website lead capture](docs/EMAIL_CAPTURE.md)
- [Decisions](docs/DECISIONS.md)
- [Historical upstream README](docs/UPSTREAM-README.md)

## Attribution

LMC derives from [Kyra by Aaron White / Key 20 Consultations](https://github.com/aaron27white-source/kyra), itself based on LobbyStack. Preserve [LICENSE](LICENSE), [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Existing authorship and upstream history are retained.
