import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { affiliateProfiles, commercialCommissions, commercialCustomers, commercialOffers, commercialPayments, commercialSubscriptions, stripeWebhookEvents, withBusinessTransaction } from "@lobbystack/db";
import { StripeBillingProvider } from "@lobbystack/providers";
import { getAppDatabase } from "@/lib/api-helpers";
import { stripeCommercialConfig } from "@/lib/stripe-commercial";
import { commissionRefundAdjustment, stripeSubscriptionEventIsNewer } from "@/lib/commercial-billing-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const asString = (value: unknown): string | null => typeof value === "string" ? value : null;
const asInteger = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
const stripeId = (value: unknown): string | null => typeof value === "string" ? value : asString(asRecord(value).id);
const invoicePaymentIntentId = (invoice: JsonRecord): string | null => {
  const direct = stripeId(invoice.payment_intent);
  if (direct) return direct;
  const payments = asRecord(invoice.payments).data;
  if (!Array.isArray(payments)) return null;
  for (const item of payments) {
    const payment = asRecord(asRecord(item).payment);
    const paymentIntentId = stripeId(payment.payment_intent);
    if (paymentIntentId) return paymentIntentId;
  }
  return null;
};

async function handleEvent(event: { id: string; type: string; created: number; data: { object: unknown } }) {
  const object = asRecord(event.data.object);
  const metadata = asRecord(object.metadata);
  const occurredAt = new Date(event.created * 1000);
  await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => {
    const existing = (await tx.select({ status: stripeWebhookEvents.status }).from(stripeWebhookEvents).where(eq(stripeWebhookEvents.stripeEventId, event.id)).limit(1))[0];
    if (existing?.status === "processed") return;
    if (!existing) await tx.insert(stripeWebhookEvents).values({ stripeEventId: event.id, eventType: event.type, status: "processing", payload: { objectId: asString(object.id) } }).onConflictDoNothing();
    else await tx.update(stripeWebhookEvents).set({ status: "processing", lastError: null, updatedAt: new Date() }).where(eq(stripeWebhookEvents.stripeEventId, event.id));

    if (event.type === "checkout.session.completed" && asString(object.payment_status) === "unpaid") {
      // Delayed payment methods finish Checkout before the payment settles.
      // Keep the offer pending until the signed async success/failure event.
    } else if (event.type === "checkout.session.async_payment_failed") {
      const offerId = asString(metadata.offer_id);
      if (!offerId) throw new Error("CHECKOUT_OFFER_METADATA_MISSING");
      await tx.update(commercialOffers).set({ status: "open", checkoutSessionId: null, checkoutUrl: null, updatedAt: new Date() }).where(and(eq(commercialOffers.id, offerId), eq(commercialOffers.status, "checkout_pending")));
    } else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const offerId = asString(metadata.offer_id);
      const customerRecordId = asString(metadata.customer_id) ?? asString(object.client_reference_id);
      const paymentStatus = asString(object.payment_status);
      if (!offerId || !customerRecordId || paymentStatus !== "paid") throw new Error("CHECKOUT_PAYMENT_NOT_CONFIRMED");
      const offer = (await tx.select({ id: commercialOffers.id, customerId: commercialOffers.customerId, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, status: commercialOffers.status }).from(commercialOffers).where(and(eq(commercialOffers.id, offerId), eq(commercialOffers.customerId, customerRecordId))).limit(1))[0];
      if (!offer) throw new Error("COMMERCIAL_OFFER_NOT_FOUND");
      const customerStripeId = stripeId(object.customer);
      await tx.update(commercialCustomers).set({ ...(customerStripeId ? { stripeCustomerId: customerStripeId } : {}), onboardingStatus: "paid_awaiting_onboarding", updatedAt: new Date() }).where(eq(commercialCustomers.id, customerRecordId));
      await tx.update(commercialOffers).set({ status: "paid", updatedAt: new Date() }).where(eq(commercialOffers.id, offer.id));
      const subscriptionId = stripeId(object.subscription);
      if (subscriptionId) await tx.insert(commercialSubscriptions).values({ customerId: offer.customerId, offerId: offer.id, stripeSubscriptionId: subscriptionId, planName: offer.planName, status: "pending", monthlyAmountCents: offer.monthlyAmountCents, currency: asString(object.currency) ?? "usd" }).onConflictDoNothing();
    } else if (event.type.startsWith("customer.subscription.")) {
      const customerRecordId = asString(metadata.customer_id);
      const offerId = asString(metadata.offer_id);
      const subscriptionId = asString(object.id);
      if (!customerRecordId || !subscriptionId) throw new Error("SUBSCRIPTION_METADATA_MISSING");
      const offer = offerId ? (await tx.select({ id: commercialOffers.id, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents }).from(commercialOffers).where(eq(commercialOffers.id, offerId)).limit(1))[0] : null;
      const item = asRecord(asRecord(object.items).data instanceof Array ? (asRecord(object.items).data as unknown[])[0] : null);
      const price = asRecord(item.price);
      const intervalStart = asInteger(object.current_period_start);
      const intervalEnd = asInteger(object.current_period_end);
      const current = (await tx.select({ id: commercialSubscriptions.id, lastStripeEventCreated: commercialSubscriptions.lastStripeEventCreated }).from(commercialSubscriptions).where(eq(commercialSubscriptions.stripeSubscriptionId, subscriptionId)).for("update").limit(1))[0];
      if (!current || stripeSubscriptionEventIsNewer(current.lastStripeEventCreated, event.created)) {
        const values = { customerId: customerRecordId, offerId: offer?.id ?? null, stripeSubscriptionId: subscriptionId, planName: offer?.planName ?? "Subscription", status: asString(object.status) ?? "unknown", monthlyAmountCents: offer?.monthlyAmountCents ?? asInteger(price.unit_amount), currency: asString(price.currency) ?? "usd", currentPeriodStart: intervalStart ? new Date(intervalStart * 1000) : null, currentPeriodEnd: intervalEnd ? new Date(intervalEnd * 1000) : null, cancelAtPeriodEnd: object.cancel_at_period_end === true, lastStripeEventCreated: event.created, updatedAt: new Date() };
        if (current) await tx.update(commercialSubscriptions).set(values).where(eq(commercialSubscriptions.id, current.id));
        else await tx.insert(commercialSubscriptions).values(values).onConflictDoNothing();
      }
      const customerStripeId = stripeId(object.customer);
      if (customerStripeId) await tx.update(commercialCustomers).set({ stripeCustomerId: customerStripeId, updatedAt: new Date() }).where(eq(commercialCustomers.id, customerRecordId));
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const subscriptionId = stripeId(object.subscription);
      const customerStripeId = stripeId(object.customer);
      let customer: { id: string; offerId?: string | null; monthlyAmountCents?: number } | null = subscriptionId ? (await tx.select({ id: commercialSubscriptions.customerId, offerId: commercialSubscriptions.offerId, monthlyAmountCents: commercialSubscriptions.monthlyAmountCents }).from(commercialSubscriptions).where(eq(commercialSubscriptions.stripeSubscriptionId, subscriptionId)).limit(1))[0] ?? null : null;
      if (!customer && customerStripeId) customer = (await tx.select({ id: commercialCustomers.id }).from(commercialCustomers).where(eq(commercialCustomers.stripeCustomerId, customerStripeId)).limit(1))[0] ?? null;
      if (!customer) {
        const subscriptionDetails = asRecord(asRecord(object.parent).subscription_details);
        const invoiceMetadata = asRecord(subscriptionDetails.metadata);
        const metadataCustomerId = asString(invoiceMetadata.customer_id);
        if (metadataCustomerId) customer = (await tx.select({ id: commercialCustomers.id }).from(commercialCustomers).where(eq(commercialCustomers.id, metadataCustomerId)).limit(1))[0] ?? null;
      }
      if (!customer) throw new Error("STRIPE_INVOICE_CUSTOMER_NOT_FOUND");
      const invoiceId = asString(object.id);
      if (!invoiceId) throw new Error("STRIPE_INVOICE_ID_MISSING");
      const paid = event.type === "invoice.paid";
      const existingPayment = (await tx.select({ id: commercialPayments.id, status: commercialPayments.status, amountCents: commercialPayments.amountCents }).from(commercialPayments).where(eq(commercialPayments.stripeObjectId, invoiceId)).for("update").limit(1))[0];
      const paymentConfirmed = paid || existingPayment?.status === "paid";
      const amount = paymentConfirmed && existingPayment?.status === "paid" ? existingPayment.amountCents : paid ? asInteger(object.amount_paid) : asInteger(object.amount_due);
      const paymentIntentId = invoicePaymentIntentId(object);
      const payload = { customerId: customer.id, offerId: "offerId" in customer ? customer.offerId ?? null : null, stripeObjectId: invoiceId, stripePaymentIntentId: paymentIntentId, kind: "invoice", status: paymentConfirmed ? "paid" : "failed", amountCents: amount, currency: asString(object.currency) ?? "usd", description: asString(object.description) ?? (paymentConfirmed ? "Subscription invoice paid" : "Subscription invoice payment failed"), hostedInvoiceUrl: asString(object.hosted_invoice_url), occurredAt };
      const [payment] = await tx.insert(commercialPayments).values({ ...payload, lastStripeEventCreated: event.created }).onConflictDoUpdate({ target: commercialPayments.stripeObjectId, set: { stripePaymentIntentId: sql`COALESCE(${paymentIntentId}, ${commercialPayments.stripePaymentIntentId})`, lastStripeEventCreated: sql`GREATEST(COALESCE(${commercialPayments.lastStripeEventCreated}, 0), ${event.created})`, status: payload.status, amountCents: payload.amountCents, hostedInvoiceUrl: payload.hostedInvoiceUrl, occurredAt: sql`GREATEST(${commercialPayments.occurredAt}, ${occurredAt})`, updatedAt: new Date() } }).returning({ id: commercialPayments.id });
      if (paymentConfirmed && payment) {
        const customerRecord = (await tx.select({ affiliateProfileId: commercialCustomers.affiliateProfileId, commissionRateBps: commercialCustomers.commissionRateBps }).from(commercialCustomers).where(eq(commercialCustomers.id, customer.id)).limit(1))[0];
        const affiliate = customerRecord?.affiliateProfileId ? (await tx.select({ id: affiliateProfiles.id, commissionRateBps: affiliateProfiles.commissionRateBps, status: affiliateProfiles.status }).from(affiliateProfiles).where(eq(affiliateProfiles.id, customerRecord.affiliateProfileId)).limit(1))[0] : null;
        const invoiceParent = asRecord(object.parent);
        const subscriptionDetails = asRecord(invoiceParent.subscription_details);
        const invoiceMetadata = asRecord(subscriptionDetails.metadata);
        const invoiceOfferId = asString(invoiceMetadata.offer_id);
        const invoiceOffer = invoiceOfferId ? (await tx.select({ monthlyAmountCents: commercialOffers.monthlyAmountCents }).from(commercialOffers).where(eq(commercialOffers.id, invoiceOfferId)).limit(1))[0] : null;
        const invoiceLines = asRecord(object.lines).data;
        const recurringLineTotal = Array.isArray(invoiceLines) ? invoiceLines.reduce((sum, rawLine) => {
          const line = asRecord(rawLine);
          const price = asRecord(line.price);
          const legacyMonthlyLine = asRecord(price.recurring).interval === "month";
          const currentSubscriptionLine = line.type === "subscription" && asRecord(asRecord(line.parent).subscription_item_details).proration !== true;
          return legacyMonthlyLine || currentSubscriptionLine ? sum + Math.max(0, asInteger(line.amount)) : sum;
        }, 0) : 0;
        const contractualMonthly = customer.monthlyAmountCents ?? invoiceOffer?.monthlyAmountCents ?? 0;
        const baseAmount = recurringLineTotal > 0 ? (contractualMonthly > 0 ? Math.min(contractualMonthly, recurringLineTotal) : recurringLineTotal) : contractualMonthly;
        const commissionRateBps = customerRecord?.commissionRateBps ?? affiliate?.commissionRateBps ?? 0;
        if (affiliate?.status === "active" && baseAmount > 0 && commissionRateBps > 0) {
          const rawHoldDays = Number(process.env.AFFILIATE_COMMISSION_HOLD_DAYS ?? "30");
          const holdDays = Number.isInteger(rawHoldDays) && rawHoldDays >= 0 && rawHoldDays <= 3650 ? rawHoldDays : 30;
          const commissionCents = Math.floor(baseAmount * commissionRateBps / 10_000);
          await tx.insert(commercialCommissions).values({ affiliateProfileId: affiliate.id, customerId: customer.id, paymentId: payment.id, sourceKey: `stripe-invoice:${invoiceId}:${affiliate.id}`, amountCents: baseAmount, originalAmountCents: baseAmount, commissionRateBps, commissionCents, originalCommissionCents: commissionCents, currency: asString(object.currency) ?? "usd", status: "pending", clearsAt: new Date(Date.now() + holdDays * 86_400_000) }).onConflictDoNothing();
        }
      }
    } else if (event.type === "charge.refunded") {
      const chargeId = asString(object.id);
      const paymentIntentId = stripeId(object.payment_intent);
      const customerStripeId = stripeId(object.customer);
      const customer = customerStripeId ? (await tx.select({ id: commercialCustomers.id }).from(commercialCustomers).where(eq(commercialCustomers.stripeCustomerId, customerStripeId)).limit(1))[0] : null;
      if (customer) {
        if (chargeId) {
          const existingRefund = (await tx.select({ status: commercialPayments.status, amountCents: commercialPayments.amountCents }).from(commercialPayments).where(eq(commercialPayments.stripeObjectId, chargeId)).for("update").limit(1))[0];
          const refundedAmount = Math.max(existingRefund?.amountCents ?? 0, asInteger(object.amount_refunded));
          const fullyRefunded = existingRefund?.status === "refunded" || object.refunded === true;
          await tx.insert(commercialPayments).values({ customerId: customer.id, stripeObjectId: chargeId, stripePaymentIntentId: paymentIntentId, lastStripeEventCreated: event.created, kind: "refund", status: fullyRefunded ? "refunded" : "partially_refunded", amountCents: refundedAmount, currency: asString(object.currency) ?? "usd", description: "Stripe refund", occurredAt }).onConflictDoUpdate({ target: commercialPayments.stripeObjectId, set: { stripePaymentIntentId: paymentIntentId, lastStripeEventCreated: sql`GREATEST(COALESCE(${commercialPayments.lastStripeEventCreated}, 0), ${event.created})`, status: fullyRefunded ? "refunded" : "partially_refunded", amountCents: refundedAmount, occurredAt, updatedAt: new Date() } });
        }
      }
      const invoiceId = stripeId(object.invoice);
      const invoice = invoiceId
        ? (await tx.select({ id: commercialPayments.id }).from(commercialPayments).where(eq(commercialPayments.stripeObjectId, invoiceId)).limit(1))[0]
        : paymentIntentId ? (await tx.select({ id: commercialPayments.id }).from(commercialPayments).where(eq(commercialPayments.stripePaymentIntentId, paymentIntentId)).limit(1))[0] : null;
      if (customer && !invoice) throw new Error("STRIPE_REFUND_INVOICE_MAPPING_NOT_FOUND");
      if (invoice) {
        if (!chargeId) throw new Error("STRIPE_REFUND_CHARGE_ID_MISSING");
          const commissionRows = await tx.select({ id: commercialCommissions.id, affiliateProfileId: commercialCommissions.affiliateProfileId, customerId: commercialCommissions.customerId, paymentId: commercialCommissions.paymentId, sourceKey: commercialCommissions.sourceKey, amountCents: commercialCommissions.amountCents, originalAmountCents: commercialCommissions.originalAmountCents, commissionCents: commercialCommissions.commissionCents, originalCommissionCents: commercialCommissions.originalCommissionCents, commissionRateBps: commercialCommissions.commissionRateBps, currency: commercialCommissions.currency, clearsAt: commercialCommissions.clearsAt, status: commercialCommissions.status }).from(commercialCommissions).where(and(eq(commercialCommissions.paymentId, invoice.id), sql`${commercialCommissions.status} NOT IN ('reversed', 'recovered')`));
          const chargeAmount = Math.max(1, asInteger(object.amount));
          const refundPayment = chargeId ? (await tx.select({ status: commercialPayments.status, amountCents: commercialPayments.amountCents }).from(commercialPayments).where(eq(commercialPayments.stripeObjectId, chargeId)).limit(1))[0] : null;
          const refunded = Math.min(chargeAmount, Math.max(refundPayment?.amountCents ?? 0, asInteger(object.amount_refunded)));
          const fullyRefunded = refundPayment?.status === "refunded" || object.refunded === true || refunded >= chargeAmount;
          for (const commission of commissionRows) {
            const refund = commissionRefundAdjustment({ originalAmountCents: commission.originalAmountCents, originalCommissionCents: commission.originalCommissionCents, currentPaidCommissionCents: commission.commissionCents, chargeAmountCents: chargeAmount, amountRefundedCents: refunded });
            const remainingAmount = refund.remainingAmountCents;
            const remainingCommission = refund.remainingCommissionCents;
            if (commission.status === "paid") {
              const reversalCents = refund.reversalCents;
              if (reversalCents < 0) await tx.insert(commercialCommissions).values({ affiliateProfileId: commission.affiliateProfileId, customerId: commission.customerId, paymentId: commission.paymentId, sourceKey: `stripe-refund:${chargeId}:${commission.id}`, amountCents: commission.originalAmountCents - remainingAmount, originalAmountCents: commission.originalAmountCents - remainingAmount, commissionRateBps: commission.commissionRateBps, commissionCents: reversalCents, originalCommissionCents: Math.abs(reversalCents), currency: commission.currency, status: "reversed", clearsAt: occurredAt }).onConflictDoUpdate({ target: commercialCommissions.sourceKey, set: { amountCents: commission.originalAmountCents - remainingAmount, originalAmountCents: commission.originalAmountCents - remainingAmount, commissionCents: reversalCents, originalCommissionCents: Math.abs(reversalCents), status: sql`CASE WHEN ABS(${reversalCents}) <= ${commercialCommissions.recoveredCents} THEN 'recovered' ELSE 'reversed' END`, updatedAt: new Date() } });
            } else {
              await tx.update(commercialCommissions).set({ amountCents: remainingAmount, commissionCents: remainingCommission, status: fullyRefunded ? "voided" : commission.status, updatedAt: new Date() }).where(eq(commercialCommissions.id, commission.id));
            }
          }
      }
    } else if (event.type.startsWith("charge.dispute.")) {
      const charge = asRecord(object.charge);
      const customerStripeId = stripeId(object.customer) ?? stripeId(charge.customer);
      const customer = customerStripeId ? (await tx.select({ id: commercialCustomers.id }).from(commercialCustomers).where(eq(commercialCustomers.stripeCustomerId, customerStripeId)).limit(1))[0] : null;
      const disputeId = asString(object.id);
      let applyDispute = true;
      if (customer) {
        if (disputeId) {
          const currentDispute = (await tx.select({ lastStripeEventCreated: commercialPayments.lastStripeEventCreated }).from(commercialPayments).where(eq(commercialPayments.stripeObjectId, disputeId)).for("update").limit(1))[0];
          applyDispute = !currentDispute || stripeSubscriptionEventIsNewer(currentDispute.lastStripeEventCreated, event.created);
          if (applyDispute) await tx.insert(commercialPayments).values({ customerId: customer.id, stripeObjectId: disputeId, lastStripeEventCreated: event.created, kind: "dispute", status: asString(object.status) ?? "unknown", amountCents: asInteger(object.amount), currency: asString(object.currency) ?? "usd", description: "Stripe dispute", occurredAt }).onConflictDoUpdate({ target: commercialPayments.stripeObjectId, set: { lastStripeEventCreated: event.created, status: asString(object.status) ?? "unknown", amountCents: asInteger(object.amount), occurredAt, updatedAt: new Date() } });
        }
      }
      if (customer && applyDispute) {
        const disputeStatus = asString(object.status);
        const paymentIntentId = stripeId(object.payment_intent) ?? stripeId(charge.paymentIntentId);
        if (!paymentIntentId) throw new Error("STRIPE_DISPUTE_PAYMENT_INTENT_MISSING");
        const invoice = (await tx.select({ id: commercialPayments.id }).from(commercialPayments).where(eq(commercialPayments.stripePaymentIntentId, paymentIntentId)).limit(1))[0];
        if (!invoice) throw new Error("STRIPE_DISPUTE_INVOICE_MAPPING_NOT_FOUND");
        const commissionRows = await tx.select({ id: commercialCommissions.id, affiliateProfileId: commercialCommissions.affiliateProfileId, customerId: commercialCommissions.customerId, paymentId: commercialCommissions.paymentId, sourceKey: commercialCommissions.sourceKey, amountCents: commercialCommissions.amountCents, originalAmountCents: commercialCommissions.originalAmountCents, commissionCents: commercialCommissions.commissionCents, originalCommissionCents: commercialCommissions.originalCommissionCents, commissionRateBps: commercialCommissions.commissionRateBps, currency: commercialCommissions.currency, clearsAt: commercialCommissions.clearsAt, status: commercialCommissions.status }).from(commercialCommissions).where(and(eq(commercialCommissions.paymentId, invoice.id), sql`${commercialCommissions.status} NOT IN ('reversed', 'recovered')`));
        for (const commission of commissionRows) {
          if (event.type === "charge.dispute.closed" && commission.status === "disputed") {
            const status = disputeStatus === "won" ? commission.clearsAt <= new Date() ? "available" : "pending" : "voided";
            await tx.update(commercialCommissions).set({ status, updatedAt: new Date() }).where(eq(commercialCommissions.id, commission.id));
          } else if (event.type === "charge.dispute.closed" && disputeStatus !== "won" && commission.status === "paid") {
            await tx.insert(commercialCommissions).values({ affiliateProfileId: commission.affiliateProfileId, customerId: commission.customerId, paymentId: commission.paymentId, sourceKey: `stripe-dispute:${disputeId}:${commission.id}`, amountCents: commission.amountCents, originalAmountCents: commission.amountCents, commissionRateBps: commission.commissionRateBps, commissionCents: -commission.commissionCents, originalCommissionCents: commission.commissionCents, currency: commission.currency, status: "reversed", clearsAt: occurredAt }).onConflictDoNothing();
          } else if (event.type !== "charge.dispute.closed" && ["pending", "available"].includes(commission.status)) {
            await tx.update(commercialCommissions).set({ status: "disputed", updatedAt: new Date() }).where(eq(commercialCommissions.id, commission.id));
          }
        }
      }
    }
    await tx.update(stripeWebhookEvents).set({ status: "processed", processedAt: new Date(), updatedAt: new Date() }).where(eq(stripeWebhookEvents.stripeEventId, event.id));
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const config = stripeCommercialConfig();
  if (!signature || !config) return new NextResponse("Webhook is not configured.", { status: 503 });
  const rawBody = await request.text();
  let event;
  try { event = new StripeBillingProvider(config.secretKey).constructEvent(rawBody, signature, config.webhookSecret); }
  catch { return new NextResponse("Invalid webhook signature.", { status: 400 }); }
  try {
    if (event.type.startsWith("charge.dispute.") || event.type === "charge.refunded") {
      const stripeObject = asRecord(event.data.object);
      const chargeId = event.type === "charge.refunded" ? stripeId(stripeObject.id) : stripeId(stripeObject.charge);
      if (chargeId) {
        const charge = await new StripeBillingProvider(config.secretKey).retrieveCharge(chargeId);
        event.data.object = event.type === "charge.refunded"
          ? { ...stripeObject, customer: stripeObject.customer ?? charge.customer, payment_intent: stripeObject.payment_intent ?? charge.paymentIntentId } as unknown as typeof event.data.object
          : { ...stripeObject, charge: { ...asRecord(stripeObject.charge), customer: charge.customer, paymentIntentId: charge.paymentIntentId } } as unknown as typeof event.data.object;
      }
    }
    await handleEvent(event);
    return NextResponse.json({ received: true });
  } catch {
    // Return a retryable response. The event record and financial mutations are
    // committed in one transaction, so a transient error cannot half-apply it.
    await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => {
      await tx.insert(stripeWebhookEvents).values({ stripeEventId: event.id, eventType: event.type, status: "failed", payload: { objectId: asString(asRecord(event.data.object).id) }, lastError: "event processing failed" }).onConflictDoUpdate({ target: stripeWebhookEvents.stripeEventId, set: { status: "failed", lastError: "event processing failed", updatedAt: new Date() } });
    }).catch(() => undefined);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
