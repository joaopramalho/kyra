import { openLmcTestDatabase } from "./database";
import {
  checkCatalogProtection,
  discoverApiRoutes,
  readIsolationCatalog,
} from "./isolation-inventory";
import { seedIsolationFixtures } from "./isolation-fixtures";
import { probeStoredTables } from "./isolation-tables";
import { probeTableInserts } from "./isolation-inserts";
import { probeEmailReadRoutes } from "./isolation-http";

/** An uncovered discovered route remains a failure. No allowlist or successful structural check substitutes for a probe. */
export async function runTenantIsolationAudit() {
  const db = openLmcTestDatabase();
  let fixtures: Awaited<ReturnType<typeof seedIsolationFixtures>> | undefined;
  try {
    const catalog = await readIsolationCatalog(db),
      routes = discoverApiRoutes();
    const failures = checkCatalogProtection(catalog);
    // Detect grant masking before interpreting a 42501 from CRUD probes as evidence.
    const columns = await db.admin.pool.query<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity='' group by c.oid,c.relname having has_any_column_privilege('lobbystack_app',c.oid,'INSERT') and not bool_and(has_column_privilege('lobbystack_app',c.oid,a.attnum,'INSERT'))`,
    );
    failures.push(
      ...columns.rows.map((row) => `INSERT_COLUMN_GRANT_MASK:${row.name}`),
    );
    const primaryKeys = await db.admin.pool.query<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_constraint k on k.conrelid=c.oid and k.contype='p' join pg_attribute a on a.attrelid=c.oid and a.attnum=any(k.conkey) where n.nspname='public' group by c.oid,c.relname having (has_any_column_privilege('lobbystack_app',c.oid,'UPDATE') or has_table_privilege('lobbystack_app',c.oid,'DELETE')) and not bool_and(has_column_privilege('lobbystack_app',c.oid,a.attnum,'SELECT'))`,
    );
    failures.push(
      ...primaryKeys.rows.map((row) => `MUTATION_KEY_GRANT_MASK:${row.name}`),
    );
    fixtures = await seedIsolationFixtures(db, catalog.tables);
    failures.push(...fixtures.failures);
    const stored = await probeStoredTables(
      db,
      catalog.tables,
      fixtures.a,
      fixtures.b,
    );
    const inserts = await probeTableInserts(db, catalog.tables);
    failures.push(...stored.failures, ...inserts.failures);
    const http = await probeEmailReadRoutes(
      process.env.LMC_TEST_HTTP_BASE_URL ?? "http://localhost:3000",
    );
    failures.push(...http.failures);
    const tableInventory = catalog.tables.map((table) => table.name);
    const routeInventory = routes.flatMap((route) =>
      route.methods.map((method) => `${method} ${route.path}`),
    );
    const probedTables = stored.probed.filter((table) =>
      inserts.probed.includes(table),
    );
    const probedRoutes = [...new Set(http.probed)];
    const skipped = [
      ...tableInventory
        .filter((table) => !probedTables.includes(table))
        .map((table) => `UNPROBED_TABLE:${table}`),
      ...routeInventory
        .filter((route) => !probedRoutes.includes(route))
        .map((route) => `UNPROBED_ROUTE:${route}`),
    ];
    for (const route of probedRoutes)
      if (!routeInventory.includes(route))
        failures.push(`UNDISCOVERED_ROUTE_PROBE:${route}`);
    return {
      tableInventory,
      routeInventory,
      probedTables,
      probedRoutes,
      skipped,
      failures,
      runtimeRoles: catalog.logins,
    };
  } finally {
    try {
      await fixtures?.cleanup();
    } finally {
      await db.close();
    }
  }
}
