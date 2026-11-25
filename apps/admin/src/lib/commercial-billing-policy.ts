export function polarSubscriptionBlocksStripe(input: { source: string; subscriptionId: string | null; status: string | null }): boolean {
  return input.source === "polar" && Boolean(input.subscriptionId) && !["canceled", "incomplete_expired"].includes(input.status ?? "");
}

export function commercialBillingBlocksPolar(input: { onboardingStatus: string; hasOpenOffer: boolean; hasChargeableSubscription: boolean }): boolean {
  return input.onboardingStatus !== "awaiting_payment" || input.hasOpenOffer || input.hasChargeableSubscription;
}

export function stripeSubscriptionEventIsNewer(currentCreated: number | null, eventCreated: number): boolean {
  return (currentCreated ?? 0) < eventCreated;
}

export function commissionRefundAdjustment(input: {
  originalAmountCents: number;
  originalCommissionCents: number;
  currentPaidCommissionCents: number;
  chargeAmountCents: number;
  amountRefundedCents: number;
}) {
  const chargeAmount = Math.max(1, input.chargeAmountCents);
  const refunded = Math.min(chargeAmount, Math.max(0, input.amountRefundedCents));
  const remaining = chargeAmount - refunded;
  const remainingAmountCents = Math.floor(input.originalAmountCents * remaining / chargeAmount);
  const remainingCommissionCents = Math.floor(input.originalCommissionCents * remaining / chargeAmount);
  return {
    remainingAmountCents,
    remainingCommissionCents,
    reversalCents: Math.min(0, remainingCommissionCents - input.currentPaidCommissionCents),
    fullyRefunded: remaining === 0,
  };
}
