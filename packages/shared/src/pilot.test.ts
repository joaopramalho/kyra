import { describe, expect, it } from "vitest";

import { pilotAdminRoute } from "./pilot";

describe("pilot affiliate and commercial route policy", () => {
  it("keeps affiliate and commercial routes closed unless the feature is enabled", () => {
    expect(pilotAdminRoute("/affiliate-portal")).toBeUndefined();
    expect(pilotAdminRoute("/locales/en/affiliate.json")).toBeUndefined();
    expect(pilotAdminRoute("/api/affiliate")).toBeUndefined();
    expect(pilotAdminRoute("/settings/plan")).toBeUndefined();
    expect(pilotAdminRoute("/api/billing")).toBeUndefined();
    expect(pilotAdminRoute("/api/webhooks/stripe", { affiliateProgramEnabled: true })).toBeDefined();
    expect(pilotAdminRoute("/api/internal/superadmin/commercial/offers", { affiliateProgramEnabled: true })?.methods).toContain("POST");
    expect(pilotAdminRoute("/internal/commercial", { affiliateProgramEnabled: true })).toBeDefined();
    expect(pilotAdminRoute("/locales/en/affiliate.json", { affiliateProgramEnabled: true })).toBeDefined();
    expect(pilotAdminRoute("/api/billing", { affiliateProgramEnabled: true })?.methods).toEqual(["GET", "HEAD", "OPTIONS"]);
    expect(pilotAdminRoute("/api/billing", { affiliateProgramEnabled: true })?.methods).not.toContain("POST");
  });

  it("keeps tenant and unknown routes outside the feature-specific allowlist", () => {
    expect(pilotAdminRoute("/api/businesses", { affiliateProgramEnabled: true })?.methods).toEqual(["GET", "HEAD", "OPTIONS", "PATCH"]);
    expect(pilotAdminRoute("/api/internal/superadmin/unknown", { affiliateProgramEnabled: true })).toBeUndefined();
    expect(pilotAdminRoute("/api/affiliate/%2fother", { affiliateProgramEnabled: true })).toBeUndefined();
  });
});

describe("pilot route allowlist for service intake", () => {
  it("allows the reviewed calendar integration settings only", () => {
    expect(pilotAdminRoute("/integrations")?.methods).toEqual(["GET", "HEAD"]);
    expect(pilotAdminRoute("/api/integrations")?.methods).toContain("GET");
    expect(pilotAdminRoute("/api/integrations")?.methods).toContain("PATCH");
    expect(pilotAdminRoute("/api/integrations")?.methods).toContain("POST");
    expect(pilotAdminRoute("/api/integrations")?.methods).toContain("DELETE");
    expect(pilotAdminRoute("/integrations/webhooks")).toBeUndefined();
  });

  it("allows only catalog policy updates and tenant-scoped appointment location corrections", () => {
    expect(pilotAdminRoute("/api/catalog")?.methods).toContain("PATCH");
    expect(pilotAdminRoute("/api/appointments")?.methods).toContain("GET");
    const appointmentRoute = pilotAdminRoute("/api/appointments/00000000-0000-4000-8000-000000000001");
    expect(appointmentRoute?.methods).toContain("PATCH");
    expect(appointmentRoute?.methods).not.toContain("DELETE");
    expect(pilotAdminRoute("/api/appointments/not-a-uuid")).toBeUndefined();
  });
});
