import Stripe from "stripe";

export type StripeCheckoutInput = {
  customerEmail: string;
  customerId?: string | undefined;
  customerName: string;
  planName: string;
  monthlyAmountCents: number;
  setupAmountCents: number;
  discountAmountCents: number;
  allowPromotionCodes?: boolean | undefined;
  stripePriceId?: string | null | undefined;
  checkoutAttemptKey?: string | undefined;
  checkoutExpiresAt?: number | undefined;
  currency: string;
  offerId: string;
  customerRecordId: string;
  successUrl: string;
  cancelUrl: string;
};

export class StripeBillingProvider {
  private readonly stripe: Stripe;

  constructor(secretKey: string, stripe?: Stripe) {
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY_REQUIRED");
    this.stripe = stripe ?? new Stripe(secretKey);
  }

  async createCheckout(input: StripeCheckoutInput): Promise<{ id: string; url: string }> {
    const currency = input.currency.toLowerCase();
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    if (input.monthlyAmountCents > 0) {
      if (input.stripePriceId) {
        const price = await this.stripe.prices.retrieve(input.stripePriceId);
        if (!price.active || price.unit_amount !== input.monthlyAmountCents || price.currency !== currency || price.recurring?.interval !== "month") throw new Error("CONFIGURED_STRIPE_PRICE_MISMATCH");
        lineItems.push({ price: price.id, quantity: 1 });
      } else {
        lineItems.push({ price_data: {
          currency,
          product_data: { name: input.planName },
          unit_amount: input.monthlyAmountCents,
          recurring: { interval: "month" },
        }, quantity: 1 });
      }
    }
    if (input.setupAmountCents > 0) {
      lineItems.push({ price_data: {
        currency,
        product_data: { name: `${input.planName} setup` },
        unit_amount: input.setupAmountCents,
      }, quantity: 1 });
    }
    if (input.monthlyAmountCents <= 0 || lineItems.length === 0) throw new Error("RECURRING_CHECKOUT_TOTAL_MUST_BE_POSITIVE");

    let couponId: string | undefined;
    if (input.discountAmountCents > 0) {
      const coupon = await this.stripe.coupons.create({
        amount_off: input.discountAmountCents,
        currency,
        duration: "once",
        name: `Offer ${input.offerId}`,
        metadata: { offer_id: input.offerId },
      }, { idempotencyKey: `commercial-offer-discount:${input.offerId}` });
      couponId = coupon.id;
    }

    const idempotencyKey = input.checkoutAttemptKey ?? input.offerId;
    const expiresAt = input.checkoutExpiresAt ?? Math.floor(Date.now() / 1000) + 21 * 60 * 60;
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      ...(input.customerId ? { customer: input.customerId } : { customer_email: input.customerEmail }),
      line_items: lineItems,
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.customerRecordId,
      metadata: { offer_id: input.offerId, customer_id: input.customerRecordId },
      subscription_data: { metadata: { offer_id: input.offerId, customer_id: input.customerRecordId } },
      allow_promotion_codes: input.discountAmountCents === 0 && input.allowPromotionCodes !== false,
      billing_address_collection: "required",
      expires_at: expiresAt,
    }, { idempotencyKey: `commercial-offer-checkout:${idempotencyKey}` });
    if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
    return { id: session.id, url: session.url };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const portal = await this.stripe.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
    return { url: portal.url };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    await this.stripe.checkout.sessions.expire(sessionId);
  }

  async retrieveCharge(chargeId: string): Promise<{ id: string; customer: string | null; paymentIntentId: string | null }> {
    const charge = await this.stripe.charges.retrieve(chargeId);
    return { id: charge.id, customer: typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null, paymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null };
  }

  constructEvent(rawBody: string, signature: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
