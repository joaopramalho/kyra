import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  account: { billingKey: "tenant-billing-key", customerId: "customer", subscriptionId: "subscription", plan: "pro", subscriptionState: "past_due" } as Record<string, string | null> | null,
  denied: false,
  stripeCustomerId: null as string | null,
  transaction: vi.fn(),
  portal: vi.fn(),
}));
vi.mock("@/lib/api-helpers", () => ({
  getAppDatabase: () => ({ db: {} }),
  businessIdFromRequest: () => "business",
  asApiResponse: (error: { status?: number; message?: string }) => Response.json({ error: error.message ?? "Request failed" }, { status: error.status ?? 500 }),
  withOperatorTransaction: async (_request: Request, callback: (input: unknown) => unknown, options: unknown) => {
    fixture.transaction(options);
    if (fixture.denied) throw { status: 403 };
    return callback({ session: { user: { id: "operator-user" } }, tx: { select: () => ({ from: () => ({ where: () => ({ limit: async () => fixture.account ? [fixture.account] : [] }) }) }) } });
  },
}));
vi.mock("@lobbystack/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback({
      select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === actual.commercialCustomers && fixture.stripeCustomerId ? [{ stripeCustomerId: fixture.stripeCustomerId }] : [] }) }) }),
    }),
  };
});
vi.mock("@lobbystack/providers", () => ({ PolarBillingProvider: class { createCustomerPortalSession = fixture.portal; } }));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "isolated-unit-test-token");
  vi.stubEnv("POLAR_ORGANIZATION_ID", "isolated-unit-test-org");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  fixture.account = { billingKey: "tenant-billing-key", customerId: "customer", subscriptionId: "subscription", plan: "pro", subscriptionState: "past_due" };
  fixture.denied = false;
  fixture.stripeCustomerId = null;
  fixture.portal.mockResolvedValue({ url: "https://billing.example.invalid/session" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("billing portal route", () => {
  it.each(["active", "trialing", "past_due", "canceled"])("opens recovery/history access for %s subscriptions", async (subscriptionState) => {
    fixture.account!.subscriptionState = subscriptionState;
    const response = await POST(new Request("http://localhost:3000/api/billing/portal?businessId=business", { method: "POST" }));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(fixture.transaction).toHaveBeenCalledWith({ minimumRole: "business_admin" });
    expect(fixture.portal).toHaveBeenCalledWith({ externalCustomerId: "tenant-billing-key", returnUrl: "http://localhost:3000/settings/plan" });
  });
  it("rejects a customer without billing history before calling the provider", async () => {
    fixture.account = null;
    expect((await POST(new Request("http://localhost:3000/api/billing/portal", { method: "POST" }))).status).toBe(409);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
  it("routes Stripe-linked tenants away from the Polar portal", async () => {
    fixture.stripeCustomerId = "cus_commercial";
    expect((await POST(new Request("http://localhost:3000/api/billing/portal?businessId=business", { method: "POST" }))).status).toBe(409);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
  it("does not contact the provider after authorization fails", async () => {
    fixture.denied = true;
    expect((await POST(new Request("http://localhost:3000/api/billing/portal", { method: "POST" }))).status).toBe(403);
    expect(fixture.portal).not.toHaveBeenCalled();
  });
});
