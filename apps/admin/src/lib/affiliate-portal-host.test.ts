import { describe, expect, it } from "vitest";

import { affiliatePortalHostPath, isAffiliatePortalHostname } from "./affiliate-portal-host";

const host = "affiliates.leadmycompany.com";

describe("affiliate portal host boundary", () => {
  it("rewrites the custom host root to the independent portal route", () => {
    expect(affiliatePortalHostPath({ hostname: host, pathname: "/", enabled: true })).toBe("/affiliate-portal");
    expect(affiliatePortalHostPath({ hostname: "app.leadmycompany.com", pathname: "/", enabled: true })).toBeNull();
    expect(affiliatePortalHostPath({ hostname: host, pathname: "/", enabled: false })).toBe(false);
  });

  it("allows affiliate authentication, its own API, and required static assets", () => {
    for (const pathname of ["/login", "/signup", "/en/login", "/fr/forgot-password", "/affiliate-portal", "/api/auth/sign-in/email", "/api/auth/email-otp/verify-email", "/api/affiliate", "/brand/lmc-logo.svg", "/locales/en/affiliate.json", "/locales/fr/nav.json", "/_next/static/chunks/app.js"]) {
      expect(affiliatePortalHostPath({ hostname: host, pathname, enabled: true }), pathname).not.toBe(false);
      expect(affiliatePortalHostPath({ hostname: host, pathname, enabled: true }), pathname).not.toBeNull();
    }
  });

  it("blocks unrelated tenant, internal, and API routes on the affiliate hostname", () => {
    for (const pathname of ["/leads", "/internal/clients", "/api/businesses", "/api/auth/oauth2/register", "/api/affiliate/click", "/checkout/offer-token", "/affiliate/../leads", "/api/affiliate/%2fother"]) {
      expect(affiliatePortalHostPath({ hostname: host, pathname, enabled: true }), pathname).toBe(false);
    }
  });

  it("matches only the configured hostname", () => {
    expect(isAffiliatePortalHostname("AFFILIATES.LEADMYCOMPANY.COM.")).toBe(true);
    expect(isAffiliatePortalHostname("app.leadmycompany.com")).toBe(false);
  });
});
