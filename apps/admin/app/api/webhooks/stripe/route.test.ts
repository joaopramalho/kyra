import type * as DbModule from "@lobbystack/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ constructEvent: vi.fn(), retrieveCharge: vi.fn(), withBusinessTransaction: vi.fn(), config: vi.fn(), writes: vi.fn() }));

vi.mock("@lobbystack/providers", () => ({
  StripeBillingProvider: class {
    constructEvent(...args: unknown[]) { return mocks.constructEvent(...args); }
    retrieveCharge(...args: unknown[]) { return mocks.retrieveCharge(...args); }
  },
}));
vi.mock("@/lib/stripe-commercial", () => ({ stripeCommercialConfig: mocks.config }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof DbModule>(),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

import { POST } from "./route";

function makeTx(eventStatus: string | null = null) {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => eventStatus ? [{ status: eventStatus }] : [] }) }) }),
    insert: () => ({ values: () => { mocks.writes(); return { onConflictDoNothing: async () => undefined }; } }),
    update: () => ({ set: () => ({ where: async () => { mocks.writes(); } }) }),
  };
  return tx;
}

function request(signature = "t=1,v1=signature") {
  return new Request("https://app.example.test/api/webhooks/stripe", { method: "POST", body: "{\"event\":true}", headers: { "stripe-signature": signature } });
}

describe("Stripe commercial webhook ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({ secretKey: "sk_test_unit", webhookSecret: "whsec_test", appBaseUrl: "https://app.example.test" });
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback(makeTx()));
    mocks.constructEvent.mockReturnValue({ id: "evt_1", type: "unhandled.event", created: 1, data: { object: { id: "obj_1" } } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects invalid signatures before opening a database transaction", async () => {
    mocks.constructEvent.mockImplementation(() => { throw new Error("signature mismatch"); });
    expect((await POST(request("invalid"))).status).toBe(400);
    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
  });

  it("returns retryable configuration failure when billing is disabled", async () => {
    mocks.config.mockReturnValue(null);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("persists and acknowledges a verified event transactionally", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.constructEvent).toHaveBeenCalledWith("{\"event\":true}", "t=1,v1=signature", "whsec_test");
    expect(mocks.withBusinessTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not reprocess an already completed Stripe event", async () => {
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback(makeTx("processed")));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.withBusinessTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
});
