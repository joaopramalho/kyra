import { describe, expect, it, vi } from "vitest";

import Stripe from "stripe";

import { StripeBillingProvider } from "./stripeBilling";

type FakeStripe = {
  coupons: { create: ReturnType<typeof vi.fn> };
  checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
  billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
  charges: { retrieve: ReturnType<typeof vi.fn> };
  webhooks: { constructEvent: ReturnType<typeof vi.fn> };
};

function fakeStripe(): FakeStripe {
  return {
    coupons: { create: vi.fn().mockResolvedValue({ id: "coupon_once" }) },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.test/session" }) } },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.test/session" }) } },
    charges: { retrieve: vi.fn().mockResolvedValue({ id: "ch_123", customer: "cus_123", payment_intent: "pi_123" }) },
    webhooks: { constructEvent: vi.fn().mockReturnValue({ id: "evt_1", type: "invoice.paid" }) },
  };
}

describe("StripeBillingProvider", () => {
  it("creates a saved-price subscription with a one-time setup fee and idempotent discount", async () => {
    const stripe = fakeStripe();
    const provider = new StripeBillingProvider("sk_test_unit", stripe as unknown as Stripe);
    await expect(provider.createCheckout({ customerEmail: "owner@example.test", customerName: "Example Co", planName: "Growth", monthlyAmountCents: 49_900, setupAmountCents: 74_900, discountAmountCents: 10_000, currency: "usd", offerId: "offer-1", customerRecordId: "customer-1", successUrl: "https://app.example.test/checkout/success", cancelUrl: "https://app.example.test/checkout/canceled" })).resolves.toEqual({ id: "cs_test_1", url: "https://checkout.stripe.test/session" });
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 10_000, duration: "once", currency: "usd" }), { idempotencyKey: "commercial-offer-discount:offer-1" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ mode: "subscription", customer_email: "owner@example.test", line_items: [{ price_data: expect.objectContaining({ unit_amount: 49_900, recurring: { interval: "month" } }), quantity: 1 }, { price_data: expect.objectContaining({ unit_amount: 74_900 }), quantity: 1 }], discounts: [{ coupon: "coupon_once" }], allow_promotion_codes: false }), { idempotencyKey: "commercial-offer-checkout:offer-1" });
  });

  it("reuses an authorized customer ID for checkout and rejects non-recurring offers", async () => {
    const stripe = fakeStripe();
    const provider = new StripeBillingProvider("sk_test_unit", stripe as unknown as Stripe);
    await provider.createCheckout({ customerEmail: "owner@example.test", customerName: "Example Co", customerId: "cus_saved", planName: "Custom", monthlyAmountCents: 10_000, setupAmountCents: 0, discountAmountCents: 0, currency: "usd", offerId: "offer-2", customerRecordId: "customer-2", successUrl: "https://app.example.test/success", cancelUrl: "https://app.example.test/cancel" });
    const [params] = stripe.checkout.sessions.create.mock.calls[0]!;
    expect(params).toEqual(expect.objectContaining({ customer: "cus_saved" }));
    expect(params).not.toHaveProperty("customer_email");
    await expect(provider.createCheckout({ customerEmail: "owner@example.test", customerName: "Example Co", planName: "One-time", monthlyAmountCents: 0, setupAmountCents: 100, discountAmountCents: 0, currency: "usd", offerId: "offer-3", customerRecordId: "customer-3", successUrl: "https://app.example.test/success", cancelUrl: "https://app.example.test/cancel" })).rejects.toThrow("RECURRING_CHECKOUT_TOTAL_MUST_BE_POSITIVE");
  });

  it("supports a customer-specific recurring price with no setup fee or predefined Stripe Price", async () => {
    const stripe = fakeStripe();
    const provider = new StripeBillingProvider("sk_test_unit", stripe as unknown as Stripe);
    await provider.createCheckout({ customerEmail: "buyer@example.test", customerName: "Buyer LLC", planName: "Negotiated pilot", monthlyAmountCents: 17_342, setupAmountCents: 0, discountAmountCents: 0, currency: "usd", offerId: "custom-1", customerRecordId: "customer-1", successUrl: "https://app.example.test/success", cancelUrl: "https://app.example.test/cancel" });
    const [params] = stripe.checkout.sessions.create.mock.calls[0]!;
    expect(params.line_items).toEqual([{ price_data: expect.objectContaining({ unit_amount: 17_342, recurring: { interval: "month" }, product_data: { name: "Negotiated pilot" } }), quantity: 1 }]);
  });

  it("creates a customer portal session and verifies webhook signatures through the SDK", async () => {
    const stripe = fakeStripe();
    const provider = new StripeBillingProvider("sk_test_unit", stripe as unknown as Stripe);
    await expect(provider.createPortalSession({ customerId: "cus_123", returnUrl: "https://app.example.test/settings/plan" })).resolves.toEqual({ url: "https://billing.stripe.test/session" });
    expect(provider.constructEvent("{}", "t=1,v1=signature", "whsec_test")).toEqual({ id: "evt_1", type: "invoice.paid" });
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith("{}", "t=1,v1=signature", "whsec_test");
  });

  it("resolves a dispute charge to its invoice and customer", async () => {
    const stripe = fakeStripe();
    const provider = new StripeBillingProvider("sk_test_unit", stripe as unknown as Stripe);
    await expect(provider.retrieveCharge("ch_123")).resolves.toEqual({ id: "ch_123", customer: "cus_123", paymentIntentId: "pi_123" });
    expect(stripe.charges.retrieve).toHaveBeenCalledWith("ch_123");
  });
});
