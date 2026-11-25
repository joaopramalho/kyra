import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { affiliateProfiles, billingAccounts, billingCheckoutRequests, businesses, commercialCustomers, commercialOffers, commercialPlans, platformAdminAuditEvents, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, readJson } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";
import { stripeCommercialConfig } from "@/lib/stripe-commercial";
import { polarSubscriptionBlocksStripe } from "@/lib/commercial-billing-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxCents = 100_000_000;
function cents(value: unknown, field: string, optional = false): number {
  if (optional && value === undefined) return 0;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maxCents) throw new Error(`${field} must be a whole number of cents within the supported range.`);
  return value as number;
}

export async function GET(request: Request) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    return NextResponse.json(await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const rows = await tx.select({ id: commercialOffers.id, customerName: commercialCustomers.name, customerEmail: commercialCustomers.email, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, currency: commercialOffers.currency, status: commercialOffers.status, expiresAt: commercialOffers.expiresAt, checkoutUrl: commercialOffers.checkoutUrl, createdAt: commercialOffers.createdAt }).from(commercialOffers).innerJoin(commercialCustomers, eq(commercialCustomers.id, commercialOffers.customerId)).orderBy(desc(commercialOffers.createdAt)).limit(100);
      const plans = await tx.select({ slug: commercialPlans.slug, name: commercialPlans.name, description: commercialPlans.description, monthlyAmountCents: commercialPlans.monthlyAmountCents, setupAmountCents: commercialPlans.setupAmountCents, leadAllowance: commercialPlans.leadAllowance, stripeProductId: commercialPlans.stripeProductId, stripePriceId: commercialPlans.stripePriceId, visible: commercialPlans.visible, publiclyAvailable: commercialPlans.publiclyAvailable, acceptsAffiliate: commercialPlans.acceptsAffiliate, allowPromotionCodes: commercialPlans.allowPromotionCodes }).from(commercialPlans).orderBy(commercialPlans.monthlyAmountCents);
      const metrics = await tx.execute<{ mrr: string | number; activeSubscriptions: string | number; newSubscriptions: string | number; setupFeesSold: string | number; cashCollected: string | number; failedPayments: string | number; awaitingOnboarding: string | number; awaitingTenant: string | number; pendingCommissions: string | number; availableCommissions: string | number; paidCommissions: string | number }>(sql`
        SELECT
          coalesce((SELECT sum(monthly_amount_cents) FROM commercial_subscriptions WHERE status = 'active'), 0) AS mrr,
          (SELECT count(*) FROM commercial_subscriptions WHERE status = 'active') AS "activeSubscriptions",
          (SELECT count(*) FROM commercial_subscriptions WHERE created_at >= date_trunc('month', now())) AS "newSubscriptions",
          coalesce((SELECT sum(setup_amount_cents) FROM commercial_offers WHERE status = 'paid'), 0) AS "setupFeesSold",
          coalesce((SELECT sum(CASE WHEN kind = 'invoice' AND status = 'paid' THEN amount_cents WHEN kind = 'refund' THEN -amount_cents ELSE 0 END) FROM commercial_payments), 0) AS "cashCollected",
          (SELECT count(*) FROM commercial_payments WHERE kind = 'invoice' AND status = 'failed') AS "failedPayments",
          (SELECT count(*) FROM commercial_customers WHERE onboarding_status = 'paid_awaiting_onboarding') AS "awaitingOnboarding",
          (SELECT count(*) FROM commercial_customers WHERE onboarding_status = 'paid_awaiting_onboarding' AND tenant_id IS NULL) AS "awaitingTenant",
          coalesce((SELECT sum(commission_cents) FROM commercial_commissions WHERE status = 'pending' AND clears_at > now()), 0) AS "pendingCommissions",
          coalesce((SELECT sum(commission_cents) FROM commercial_commissions WHERE status = 'available' OR (status = 'pending' AND clears_at <= now())), 0) - coalesce((SELECT sum(abs(commission_cents) - recovered_cents) FROM commercial_commissions WHERE status = 'reversed'), 0) AS "availableCommissions",
          coalesce((SELECT sum(commission_cents) FROM commercial_commissions WHERE status IN ('paid', 'reversed', 'recovered')), 0) AS "paidCommissions"
      `);
      const metric = metrics.rows[0];
      return { offers: rows, plans, overview: metric ? Object.fromEntries(Object.entries(metric).map(([key, value]) => [key, Number(value)])) : {} };
    }));
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (!stripeCommercialConfig()) return NextResponse.json({ error: "Stripe commercial billing is not configured." }, { status: 503 });
    const session = await requireSuperAdminSession(request.headers);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("An offer is required.");
    const input = body as Record<string, unknown>;
    const name = typeof input.customerName === "string" ? input.customerName.trim().slice(0, 180) : "";
    const planName = typeof input.planName === "string" ? input.planName.trim().slice(0, 120) : "";
    const email = typeof input.customerEmail === "string" ? input.customerEmail.trim().toLowerCase() : "";
    const notes = typeof input.internalNotes === "string" ? input.internalNotes.trim().slice(0, 4000) : null;
    if (!name || !planName) throw new Error("Customer and plan names are required.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Customer email is invalid.");
    const monthlyAmountCents = cents(input.monthlyAmountCents, "Monthly amount");
    const setupAmountCents = cents(input.setupAmountCents, "Setup amount", true);
    const discountAmountCents = cents(input.discountAmountCents, "Discount amount", true);
    if (monthlyAmountCents === 0 || discountAmountCents >= monthlyAmountCents + setupAmountCents) throw new Error("Offer amounts must leave a positive payment due today.");
    const leadAllowance = input.leadAllowance === undefined || input.leadAllowance === null ? null : cents(input.leadAllowance, "Lead allowance");
    const expiresAt = input.expiresAt === undefined || input.expiresAt === null || input.expiresAt === "" ? null : new Date(String(input.expiresAt));
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 30 * 60_000)) throw new Error("Offer expiration must be at least 30 minutes in the future.");
    const tenantId = typeof input.tenantId === "string" && input.tenantId ? input.tenantId : null;
    const affiliateProfileId = typeof input.affiliateProfileId === "string" && input.affiliateProfileId ? input.affiliateProfileId : null;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const offerId = randomUUID();
    const origin = process.env.APP_BASE_URL?.replace(/\/$/, "");
    if (!origin) throw new Error("APP_BASE_URL is required to create commercial payment links.");
    const offer = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      if (tenantId) {
        const tenant = (await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, tenantId)).limit(1))[0];
        if (!tenant) throw new Error("The selected tenant does not exist.");
        const assigned = (await tx.select({ id: commercialCustomers.id }).from(commercialCustomers).where(eq(commercialCustomers.tenantId, tenantId)).limit(1))[0];
        if (assigned) throw new Error("The selected tenant already has an associated billing customer.");
        const polarAccount = (await tx.select({ subscriptionId: billingAccounts.subscriptionId, subscriptionState: billingAccounts.subscriptionState, source: billingAccounts.source }).from(billingAccounts).where(eq(billingAccounts.businessId, tenantId)).limit(1))[0];
        if (polarAccount && polarSubscriptionBlocksStripe({ source: polarAccount.source, subscriptionId: polarAccount.subscriptionId, status: polarAccount.subscriptionState })) throw new Error("This tenant has an active Polar subscription. Resolve it before creating a Stripe offer.");
        const pendingPolarCheckout = (await tx.select({ id: billingCheckoutRequests.id }).from(billingCheckoutRequests).where(and(eq(billingCheckoutRequests.businessId, tenantId), sql`${billingCheckoutRequests.status} IN ('pending', 'processing', 'ready')`)).limit(1))[0];
        if (pendingPolarCheckout) throw new Error("This tenant has a pending Polar checkout. Resolve it before creating a Stripe offer.");
      }
      if (affiliateProfileId) {
        const affiliate = (await tx.select({ id: affiliateProfiles.id, commissionRateBps: affiliateProfiles.commissionRateBps }).from(affiliateProfiles).where(and(eq(affiliateProfiles.id, affiliateProfileId), eq(affiliateProfiles.status, "active"))).limit(1))[0];
        if (!affiliate) throw new Error("The selected affiliate is not active.");
        const [customer] = await tx.insert(commercialCustomers).values({ name, email: email || null, tenantId, affiliateProfileId, commissionRateBps: affiliate.commissionRateBps, onboardingStatus: "awaiting_payment", internalNotes: notes, createdBy: session.user.id }).returning({ id: commercialCustomers.id });
        const [created] = await tx.insert(commercialOffers).values({ id: offerId, customerId: customer!.id, tokenHash, planName, monthlyAmountCents, setupAmountCents, discountAmountCents, currency: "usd", leadAllowance, expiresAt, createdBy: session.user.id }).returning({ id: commercialOffers.id, customerId: commercialOffers.customerId, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, expiresAt: commercialOffers.expiresAt });
        await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.offer.created", targetType: "commercial_offer", targetId: offerId, changes: { customerId: created!.customerId, planName, monthlyAmountCents, setupAmountCents, discountAmountCents }, requestId: randomUUID() });
        return created!;
      }
      const [customer] = await tx.insert(commercialCustomers).values({ name, email: email || null, tenantId, affiliateProfileId, onboardingStatus: "awaiting_payment", internalNotes: notes, createdBy: session.user.id }).returning({ id: commercialCustomers.id });
      const [created] = await tx.insert(commercialOffers).values({ id: offerId, customerId: customer!.id, tokenHash, planName, monthlyAmountCents, setupAmountCents, discountAmountCents, currency: "usd", leadAllowance, expiresAt, createdBy: session.user.id }).returning({ id: commercialOffers.id, customerId: commercialOffers.customerId, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, expiresAt: commercialOffers.expiresAt });
      await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.offer.created", targetType: "commercial_offer", targetId: offerId, changes: { customerId: created!.customerId, planName, monthlyAmountCents, setupAmountCents, discountAmountCents }, requestId: randomUUID() });
      return created!;
    });
    return NextResponse.json({ ...offer, paymentUrl: `${origin}/checkout/${token}` }, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
