import { describe, expect, it } from "vitest";
import { runTenantIsolationAudit } from "./support/isolation-audit";

describe("LMC exhaustive tenant-isolation acceptance", () => {
  it("m: probes every application table and every allowlisted pilot API method against tenant A and tenant B", async () => {
    // Inventory comes independently from pg_catalog and filesystem route discovery.
    // A skipped probe, an unclassified route or an unseeded table is a failure.
    const report = await runTenantIsolationAudit();
    expect(report.auditScope).toBe("pilot");
    expect(report.tableInventory.length).toBeGreaterThanOrEqual(88);
    expect(report.routeInventory.length).toBeGreaterThanOrEqual(238);
    expect([...report.probedTables].sort()).toEqual([...report.tableInventory].sort());
    expect([...report.probedRoutes].sort()).toEqual([...report.routeInventory].sort());
    expect(report.skipped).toEqual([]);
    expect(report.failures).toEqual([]);
    expect(report.runtimeRoles.every((role) => !role.superuser && !role.bypassRls)).toBe(true);
  }, 120_000);
});
