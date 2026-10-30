import { describe, expect, it } from "vitest";
import { pilotAdminRoute } from "./pilot";

describe("pilot route allowlist for service intake", () => {
  it("allows only catalog policy updates and tenant-scoped appointment location corrections", () => {
    expect(pilotAdminRoute("/api/catalog")?.methods).toContain("PATCH");
    expect(pilotAdminRoute("/api/appointments")?.methods).toContain("GET");
    const appointmentRoute = pilotAdminRoute("/api/appointments/00000000-0000-4000-8000-000000000001");
    expect(appointmentRoute?.methods).toContain("PATCH");
    expect(appointmentRoute?.methods).not.toContain("DELETE");
    expect(pilotAdminRoute("/api/appointments/not-a-uuid")).toBeUndefined();
  });
});
