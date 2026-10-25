import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(fileURLToPath(new URL("../../migrations/0074_superadmin_foundation.sql", import.meta.url)), "utf8");

describe("Super Admin foundation migration", () => {
  it("keeps MFA secrets auth-only and audit events system-only", () => {
    expect(migration).toContain("FOR ALL TO lobbystack_auth");
    expect(migration).toContain("ALTER TABLE public.two_factors FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("FOR ALL TO lobbystack_system");
    expect(migration).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_factors TO lobbystack_app");
  });

  it("revokes public execution for every privileged function", () => {
    for (const signature of [
      "app.is_verified_platform_admin(uuid)",
      "app.superadmin_clients(text, integer, integer)",
      "app.superadmin_overview()",
      "app.bootstrap_platform_admin(text, uuid)",
    ]) expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
  });

  it("requires verified identity, MFA, and the dedicated system login for bootstrap", () => {
    expect(migration).toContain("platform_role = 'platform_admin'");
    expect(migration).toContain("AND email_verified");
    expect(migration).toContain("AND two_factor_enabled");
    expect(migration).toContain("session_user <> 'lobbystack_system'");
    expect(migration).toContain("A platform administrator already exists.");
    expect(migration).toContain("'platform_admin.bootstrap'");
  });
});
