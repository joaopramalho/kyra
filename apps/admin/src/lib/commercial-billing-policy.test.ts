import { describe, expect, it } from "vitest";

import { commercialBillingBlocksPolar, commissionRefundAdjustment, polarSubscriptionBlocksStripe, stripeSubscriptionEventIsNewer } from "./commercial-billing-policy";

describe("commercial billing policy", () => {
  it("blocks a Stripe switch while a Polar subscription can still renew", () => {
    expect(polarSubscriptionBlocksStripe({ source: "polar", subscriptionId: "sub_polar", status: "active" })).toBe(true);
    expect(polarSubscriptionBlocksStripe({ source: "polar", subscriptionId: "sub_polar", status: "canceled" })).toBe(false);
    expect(polarSubscriptionBlocksStripe({ source: "manual", subscriptionId: "sub_legacy", status: "active" })).toBe(false);
  });

  it("ignores older subscription lifecycle events", () => {
    expect(stripeSubscriptionEventIsNewer(200, 199)).toBe(false);
    expect(stripeSubscriptionEventIsNewer(200, 201)).toBe(true);
    expect(stripeSubscriptionEventIsNewer(null, 1)).toBe(true);
  });

  it("blocks Polar checkout while a Stripe offer is open or a Stripe subscription can bill", () => {
    expect(commercialBillingBlocksPolar({ onboardingStatus: "awaiting_payment", hasOpenOffer: true, hasChargeableSubscription: false })).toBe(true);
    expect(commercialBillingBlocksPolar({ onboardingStatus: "paid_awaiting_onboarding", hasOpenOffer: false, hasChargeableSubscription: false })).toBe(true);
    expect(commercialBillingBlocksPolar({ onboardingStatus: "awaiting_payment", hasOpenOffer: false, hasChargeableSubscription: false })).toBe(false);
  });

  it("calculates repeated cumulative partial refunds from the original commission", () => {
    const firstRefund = commissionRefundAdjustment({ originalAmountCents: 49_900, originalCommissionCents: 12_475, currentPaidCommissionCents: 0, chargeAmountCents: 124_900, amountRefundedCents: 24_980 });
    const laterCumulativeRefund = commissionRefundAdjustment({ originalAmountCents: 49_900, originalCommissionCents: 12_475, currentPaidCommissionCents: 0, chargeAmountCents: 124_900, amountRefundedCents: 49_960 });
    expect(firstRefund.remainingCommissionCents).toBe(9_980);
    expect(laterCumulativeRefund.remainingCommissionCents).toBe(7_485);
    expect(laterCumulativeRefund.fullyRefunded).toBe(false);
  });

  it("records an explicit negative adjustment after a commission was paid", () => {
    const refund = commissionRefundAdjustment({ originalAmountCents: 49_900, originalCommissionCents: 12_475, currentPaidCommissionCents: 12_475, chargeAmountCents: 124_900, amountRefundedCents: 24_980 });
    expect(refund.reversalCents).toBe(-2_495);
    expect(refund.remainingAmountCents).toBe(39_920);
  });

  it("caps full refunds at the original paid commission", () => {
    const refund = commissionRefundAdjustment({ originalAmountCents: 49_900, originalCommissionCents: 12_475, currentPaidCommissionCents: 12_475, chargeAmountCents: 124_900, amountRefundedCents: 999_999 });
    expect(refund).toMatchObject({ remainingAmountCents: 0, remainingCommissionCents: 0, reversalCents: -12_475, fullyRefunded: true });
  });
});
