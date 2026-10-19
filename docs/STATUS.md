# LMC status

Phase 0 baseline gate: not green on this Windows host.

Completed: clone, lmc/v1, upstream provenance, pinned pnpm installation, architecture/voice/environment reconnaissance, 81-table static RLS inventory, dependency audit, baseline command execution. Lint and typecheck passed. Widget, landing, packages, admin and worker builds passed individually after Windows compatibility handling; the prerender check verified 16 routes and embed copy passed. The original root build command failed on its Unix-style environment assignment; the successful admin invocation used pnpm shell-emulator.

Repairs: native file URL conversion for widget (failing regression test then passing test/build); normalized surface audit paths (same assertion); normalized the local generator file to LF (3 tests passed). Voice implementation is unchanged.

Blocking baseline: 14 script-test failures require POSIX 0600 permissions or symlink creation; Windows reports 0666 or EPERM. Security assertions remain unchanged. Database-dependent tests were skipped by the existing suite; real PostgreSQL/pgvector and Redis validation is pending. Audit reports 72 vulnerabilities.

Next required environment: Linux with Node >=22.12, pnpm 10.30.3, PostgreSQL/pgvector and Redis. Re-run baseline without removing or relaxing tests. The request explicitly requires stopping when the baseline cannot be made green. No Phase 1–6 implementation or hosted GitHub fork has been completed.
