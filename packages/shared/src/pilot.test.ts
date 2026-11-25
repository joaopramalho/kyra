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
    expect(pilotAdminRoute("/api/businesses", { affiliateProgramEnabled: true })?.methods).toEqual(["GET", "HEAD", "OPTIONS"]);
    expect(pilotAdminRoute("/api/internal/superadmin/unknown", { affiliateProgramEnabled: true })).toBeUndefined();
    expect(pilotAdminRoute("/api/affiliate/%2fother", { affiliateProgramEnabled: true })).toBeUndefined();
  });
});
