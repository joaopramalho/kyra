import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { affiliateProfiles, commercialCustomers, commercialOffers, commercialPlans, withBusinessTransaction } from "@lobbystack/db";
import { StripeBillingProvider } from "@lobbystack/providers";
import { getAppDatabase, readJson } from "@/lib/api-helpers";
import { enforceApiRateLimit } from "@/lib/public-api/rate-limit";
import { requestIpHash } from "@/lib/widget-keys";
import { stripeCommercialConfig } from "@/lib/stripe-commercial";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ code: string }> };
const normalizeCode = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function rateLimit(request: Request) {
  const decision = await enforceApiRateLimit(requestIpHash(request) ?? "unattributable");
  if ("reason" in decision && decision.reason === "unavailable") return NextResponse.json({ error: "Checkout is temporarily unavailable." }, { status: 503 });
  if (!decision.allowed) return NextResponse.json({ error: "Too many checkout attempts. Please try again shortly." }, { status: 429 });
  return null;
}

export async function GET(request: Request, context: RouteContext) {
  const limited = await rateLimit(request);
  if (limited) return limited;
  if (!stripeCommercialConfig()) return NextResponse.json({ error: "Checkout is not configured." }, { status: 503 });
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const data = await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => {
      const affiliate = (await tx.select({ id: affiliateProfiles.id, status: affiliateProfiles.status, commissionRateBps: affiliateProfiles.commissionRateBps }).from(affiliateProfiles).where(eq(affiliateProfiles.referralCode, code)).limit(1))[0];
      if (!affiliate || affiliate.status !== "active") return null;
      const plans = await tx.select({ slug: commercialPlans.slug, name: commercialPlans.name, description: commercialPlans.description, monthlyAmountCents: commercialPlans.monthlyAmountCents, setupAmountCents: commercialPlans.setupAmountCents, leadAllowance: commercialPlans.leadAllowance, currency: commercialPlans.currency }).from(commercialPlans).where(and(eq(commercialPlans.visible, true), eq(commercialPlans.publiclyAvailable, true), eq(commercialPlans.acceptsAffiliate, true))).orderBy(commercialPlans.monthlyAmountCents);
      return { plans };
    });
    return data ? NextResponse.json(data) : NextResponse.json({ error: "Referral link is unavailable." }, { status: 404 });
  } catch { return NextResponse.json({ error: "Referral offer is temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request, context: RouteContext) {
  const limited = await rateLimit(request);
  if (limited) return limited;
  const config = stripeCommercialConfig();
  if (!config) return NextResponse.json({ error: "Checkout is not configured." }, { status: 503 });
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Customer details are required.");
    const input = body as Record<string, unknown>;
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 180) : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const planSlug = typeof input.planSlug === "string" ? input.planSlug.trim().toLowerCase() : "";
    const submissionKey = typeof input.idempotencyKey === "string" && /^[0-9a-f-]{36}$/i.test(input.idempotencyKey) ? input.idempotencyKey : "";
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !planSlug || !submissionKey) throw new Error("A valid name, email, plan and checkout request ID are required.");
    const offer = await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`commercial-affiliate:${code}:${email}:${planSlug}`}, 0))`);
      const affiliate = (await tx.select({ id: affiliateProfiles.id, status: affiliateProfiles.status, commissionRateBps: affiliateProfiles.commissionRateBps }).from(affiliateProfiles).where(eq(affiliateProfiles.referralCode, code)).limit(1))[0];
      if (!affiliate || affiliate.status !== "active") throw new Error("Referral link is unavailable.");
      const plan = (await tx.select({ id: commercialPlans.id, slug: commercialPlans.slug, name: commercialPlans.name, monthlyAmountCents: commercialPlans.monthlyAmountCents, setupAmountCents: commercialPlans.setupAmountCents, leadAllowance: commercialPlans.leadAllowance, currency: commercialPlans.currency, stripePriceId: commercialPlans.stripePriceId, allowPromotionCodes: commercialPlans.allowPromotionCodes }).from(commercialPlans).where(and(eq(commercialPlans.slug, planSlug), eq(commercialPlans.visible, true), eq(commercialPlans.publiclyAvailable, true), eq(commercialPlans.acceptsAffiliate, true))).limit(1))[0];
      if (!plan) throw new Error("The selected plan is unavailable.");
      const priorAttempt = (await tx.select({ id: commercialOffers.id, customerId: commercialOffers.customerId, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, allowPromotionCodes: commercialOffers.allowPromotionCodes, stripePriceId: commercialOffers.stripePriceId, checkoutSessionId: commercialOffers.checkoutSessionId, checkoutUrl: commercialOffers.checkoutUrl, status: commercialOffers.status, updatedAt: commercialOffers.updatedAt }).from(commercialOffers).where(eq(commercialOffers.submissionKey, submissionKey)).limit(1))[0];
      if (priorAttempt) {
        const priorCustomer = (await tx.select({ id: commercialCustomers.id, name: commercialCustomers.name, email: commercialCustomers.email, stripeCustomerId: commercialCustomers.stripeCustomerId, onboardingStatus: commercialCustomers.onboardingStatus }).from(commercialCustomers).where(eq(commercialCustomers.id, priorAttempt.customerId)).limit(1))[0];
        if (!priorCustomer || priorCustomer.email !== email || priorAttempt.planName !== plan.name) throw new Error("Checkout request ID has already been used.");
        if (priorAttempt.status === "paid" || priorCustomer.onboardingStatus !== "awaiting_payment") throw new Error("This customer already has a paid subscription. Contact sales for a plan change.");
        if (priorAttempt.checkoutUrl && Date.now() - priorAttempt.updatedAt.getTime() < 20 * 60 * 60_000) return { ...priorAttempt, customer: priorCustomer, currency: plan.currency, existingUrl: priorAttempt.checkoutUrl, attemptKey: submissionKey };
        const attemptKey = randomUUID();
        await tx.update(commercialOffers).set({ checkoutSessionId: null, checkoutUrl: null, submissionKey: attemptKey, updatedAt: new Date() }).where(eq(commercialOffers.id, priorAttempt.id));
        return { ...priorAttempt, customer: priorCustomer, currency: plan.currency, existingUrl: null, attemptKey };
      }
      let customer = (await tx.select({ id: commercialCustomers.id, name: commercialCustomers.name, email: commercialCustomers.email, stripeCustomerId: commercialCustomers.stripeCustomerId, onboardingStatus: commercialCustomers.onboardingStatus }).from(commercialCustomers).where(and(eq(commercialCustomers.email, email), eq(commercialCustomers.affiliateProfileId, affiliate.id))).limit(1))[0];
      if (customer && customer.onboardingStatus !== "awaiting_payment") throw new Error("This customer already has a paid subscription. Contact sales for a plan change.");
      if (customer) {
        const open = (await tx.select({ id: commercialOffers.id, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, allowPromotionCodes: commercialOffers.allowPromotionCodes, stripePriceId: commercialOffers.stripePriceId, checkoutSessionId: commercialOffers.checkoutSessionId, checkoutUrl: commercialOffers.checkoutUrl, status: commercialOffers.status, submissionKey: commercialOffers.submissionKey, updatedAt: commercialOffers.updatedAt }).from(commercialOffers).where(and(eq(commercialOffers.customerId, customer.id), eq(commercialOffers.status, "checkout_pending"))).orderBy(desc(commercialOffers.createdAt)).limit(1))[0];
        if (open && open.planName !== plan.name) throw new Error("An unpaid checkout is already open for this customer.");
        if (open) {
          const attemptExpired = Date.now() - open.updatedAt.getTime() >= 20 * 60 * 60_000;
          if (open.checkoutUrl && !attemptExpired) return { ...open, customer, currency: plan.currency, existingUrl: open.checkoutUrl, attemptKey: open.submissionKey ?? submissionKey };
          if (!open.checkoutUrl && !attemptExpired) return { ...open, customer, currency: plan.currency, existingUrl: null, attemptKey: open.submissionKey ?? submissionKey };
          const attemptKey = randomUUID();
          await tx.update(commercialOffers).set({ submissionKey: attemptKey, checkoutSessionId: null, checkoutUrl: null, updatedAt: new Date() }).where(eq(commercialOffers.id, open.id));
          return { ...open, customer, currency: plan.currency, existingUrl: null, attemptKey };
        }
      } else {
        const [created] = await tx.insert(commercialCustomers).values({ name, email, affiliateProfileId: affiliate.id, commissionRateBps: affiliate.commissionRateBps, onboardingStatus: "awaiting_payment" }).returning({ id: commercialCustomers.id, name: commercialCustomers.name, email: commercialCustomers.email, stripeCustomerId: commercialCustomers.stripeCustomerId, onboardingStatus: commercialCustomers.onboardingStatus });
        customer = created!;
      }
      const [createdOffer] = await tx.insert(commercialOffers).values({ customerId: customer!.id, tokenHash: digest(randomBytes(32).toString("base64url")), submissionKey, planName: plan.name, monthlyAmountCents: plan.monthlyAmountCents, setupAmountCents: plan.setupAmountCents, discountAmountCents: 0, allowPromotionCodes: plan.allowPromotionCodes, currency: plan.currency, leadAllowance: plan.leadAllowance, stripePriceId: plan.stripePriceId, status: "checkout_pending" }).returning({ id: commercialOffers.id, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, allowPromotionCodes: commercialOffers.allowPromotionCodes, stripePriceId: commercialOffers.stripePriceId, checkoutSessionId: commercialOffers.checkoutSessionId, checkoutUrl: commercialOffers.checkoutUrl, status: commercialOffers.status });
      await tx.update(commercialCustomers).set({ name, updatedAt: new Date() }).where(eq(commercialCustomers.id, customer!.id));
      return { ...createdOffer!, customer: { ...customer!, name }, currency: plan.currency, existingUrl: null, attemptKey: submissionKey };
    });
    if (offer.existingUrl) return NextResponse.json({ checkoutUrl: offer.existingUrl });
    const provider = new StripeBillingProvider(config.secretKey);
    const session = await provider.createCheckout({ customerEmail: offer.customer.email ?? email, customerName: offer.customer.name, ...(offer.customer.stripeCustomerId ? { customerId: offer.customer.stripeCustomerId } : {}), planName: offer.planName, monthlyAmountCents: offer.monthlyAmountCents, setupAmountCents: offer.setupAmountCents, discountAmountCents: offer.discountAmountCents, allowPromotionCodes: offer.allowPromotionCodes, stripePriceId: offer.stripePriceId, checkoutAttemptKey: offer.attemptKey, currency: offer.currency, offerId: offer.id, customerRecordId: offer.customer.id, successUrl: `${config.appBaseUrl}/checkout/success`, cancelUrl: `${config.appBaseUrl}/checkout/affiliate/${encodeURIComponent(code)}?canceled=1` });
    await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => { await tx.update(commercialOffers).set({ checkoutSessionId: session.id, checkoutUrl: session.url, updatedAt: new Date() }).where(eq(commercialOffers.id, offer.id)); });
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be started.";
    const status = /unavailable|already|wait/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
