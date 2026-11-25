import { describe, expect, it } from "vitest";

import { configuredAuthTrustedOrigins, isDisabledAuthEmailEndpoint } from "./auth";

describe("auth email endpoint policy", () => {
  it("blocks public OTP send and passwordless endpoints", () => {
    expect(isDisabledAuthEmailEndpoint("/send-verification-email")).toBe(true);
    expect(isDisabledAuthEmailEndpoint("/email-otp/send-verification-otp")).toBe(true);
    expect(isDisabledAuthEmailEndpoint("/sign-in/email-otp")).toBe(true);
  });

  it("allows only the required public OTP endpoints", () => {
    expect(isDisabledAuthEmailEndpoint("/email-otp/verify-email")).toBe(false);
    expect(isDisabledAuthEmailEndpoint("/email-otp/request-password-reset")).toBe(false);
    expect(isDisabledAuthEmailEndpoint("/email-otp/reset-password")).toBe(false);
  });

  it("allows server-only OTP methods that have no route path", () => {
    expect(isDisabledAuthEmailEndpoint(undefined)).toBe(false);
  });
});

describe("affiliate portal auth origins", () => {
  it("trusts only the configured HTTPS affiliate portal origin when the feature is enabled", () => {
    expect(configuredAuthTrustedOrigins({
      NODE_ENV: "production",
      APP_BASE_URL: "https://app.leadmycompany.com",
      AFFILIATE_PORTAL_URL: "https://affiliates.leadmycompany.com",
      NEXT_PUBLIC_AFFILIATE_PROGRAM_ENABLED: "true",
    })).toEqual(["https://app.leadmycompany.com", "https://affiliates.leadmycompany.com"]);
  });

  it("does not trust affiliate origins while disabled or for non-HTTPS production URLs", () => {
    expect(configuredAuthTrustedOrigins({ APP_BASE_URL: "https://app.leadmycompany.com", AFFILIATE_PORTAL_URL: "https://affiliates.leadmycompany.com" })).toEqual(["https://app.leadmycompany.com"]);
    expect(configuredAuthTrustedOrigins({ NODE_ENV: "production", APP_BASE_URL: "https://app.leadmycompany.com", AFFILIATE_PORTAL_URL: "http://affiliates.leadmycompany.com", NEXT_PUBLIC_AFFILIATE_PROGRAM_ENABLED: "true" })).toEqual(["https://app.leadmycompany.com"]);
  });
});
