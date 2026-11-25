import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { commercialCustomers, commercialOffers, withBusinessTransaction } from "@lobbystack/db";
import { StripeBillingProvider } from "@lobbystack/providers";
import { getAppDatabase, readJson } from "@/lib/api-helpers";
import { enforceApiRateLimit } from "@/lib/public-api/rate-limit";
import { requestIpHash } from "@/lib/widget-keys";
import { stripeCommercialConfig } from "@/lib/stripe-commercial";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function GET(request: Request, context: RouteContext) {
  try {
    if (!stripeCommercialConfig()) return NextResponse.json({ error: "Checkout is not configured." }, { status: 503 });
    const rate = await enforceApiRateLimit(requestIpHash(request) ?? "unattributable");
    if ("reason" in rate && rate.reason === "unavailable") return NextResponse.json({ error: "Offer lookup is temporarily unavailable." }, { status: 503 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many offer requests. Please try again shortly." }, { status: 429 });
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({ error: "This offer is unavailable." }, { status: 404 });
    const offer = await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => (await tx.select({ id: commercialOffers.id, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, currency: commercialOffers.currency, expiresAt: commercialOffers.expiresAt, status: commercialOffers.status }).from(commercialOffers).where(eq(commercialOffers.tokenHash, tokenDigest(token))).limit(1))[0] ?? null);
    if (!offer || (offer.status !== "paid" && offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) || !["open", "checkout_pending", "paid"].includes(offer.status)) return NextResponse.json({ error: "This offer is unavailable." }, { status: 404 });
    return NextResponse.json({ status: offer.status, planName: offer.planName, monthlyAmountCents: offer.monthlyAmountCents, setupAmountCents: offer.setupAmountCents, discountAmountCents: offer.discountAmountCents, amountDueTodayCents: Math.max(0, offer.monthlyAmountCents + offer.setupAmountCents - offer.discountAmountCents), currency: offer.currency, expiresAt: offer.expiresAt });
  } catch { return NextResponse.json({ error: "Offer lookup is unavailable." }, { status: 503 }); }
}

export async function POST(request: Request, context: RouteContext) {
  let claimedOfferId: string | null = null;
  try {
    const rate = await enforceApiRateLimit(requestIpHash(request) ?? "unattributable");
    if ("reason" in rate && rate.reason === "unavailable") return NextResponse.json({ error: "Checkout is temporarily unavailable." }, { status: 503 });
    if (!rate.allowed) return NextResponse.json({ error: "Too many checkout attempts. Please try again shortly." }, { status: 429 });
    const config = stripeCommercialConfig();
    if (!config) return NextResponse.json({ error: "Checkout is not configured." }, { status: 503 });
    const secret = config.secretKey;
    const origin = config.appBaseUrl;
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({ error: "This offer is unavailable." }, { status: 404 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Customer details are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const customerEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const customerName = typeof input.name === "string" ? input.name.trim().slice(0, 180) : "";
    if (!customerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return NextResponse.json({ error: "A valid name and email are required." }, { status: 400 });
    const now = new Date();
    const claimed = await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => {
      const offer = (await tx.select({ id: commercialOffers.id, customerId: commercialOffers.customerId, planName: commercialOffers.planName, monthlyAmountCents: commercialOffers.monthlyAmountCents, setupAmountCents: commercialOffers.setupAmountCents, discountAmountCents: commercialOffers.discountAmountCents, currency: commercialOffers.currency, status: commercialOffers.status, expiresAt: commercialOffers.expiresAt, checkoutUrl: commercialOffers.checkoutUrl, checkoutSessionId: commercialOffers.checkoutSessionId, submissionKey: commercialOffers.submissionKey, updatedAt: commercialOffers.updatedAt }).from(commercialOffers).where(eq(commercialOffers.tokenHash, tokenDigest(token))).for("update").limit(1))[0];
      if (!offer || (offer.expiresAt && offer.expiresAt <= now) || !["open", "checkout_pending"].includes(offer.status)) return null;
      const [customer] = await tx.select({ id: commercialCustomers.id, name: commercialCustomers.name, email: commercialCustomers.email, stripeCustomerId: commercialCustomers.stripeCustomerId }).from(commercialCustomers).where(eq(commercialCustomers.id, offer.customerId)).limit(1);
      if (!customer) return null;
      if (offer.checkoutUrl && offer.status === "checkout_pending" && now.getTime() - offer.updatedAt.getTime() < 20 * 60 * 60_000) return { offer, customer, existingUrl: offer.checkoutUrl, attemptKey: offer.submissionKey ?? offer.id };
      const attemptKey = offer.checkoutUrl || (now.getTime() - offer.updatedAt.getTime() >= 20 * 60 * 60_000) ? randomUUID() : offer.submissionKey ?? randomUUID();
      await tx.update(commercialCustomers).set({ name: customer.name || customerName, email: customer.email || customerEmail, updatedAt: now }).where(eq(commercialCustomers.id, customer.id));
      await tx.update(commercialOffers).set({ status: "checkout_pending", checkoutSessionId: null, checkoutUrl: null, submissionKey: attemptKey, updatedAt: now }).where(eq(commercialOffers.id, offer.id));
      return { offer, customer: { ...customer, name: customer.name || customerName, email: customer.email || customerEmail }, existingUrl: null, attemptKey };
    });
    if (!claimed) return NextResponse.json({ error: "This offer is unavailable or has already been used." }, { status: 409 });
    claimedOfferId = claimed.offer.id;
    if (claimed.existingUrl) return NextResponse.json({ checkoutUrl: claimed.existingUrl });
    const provider = new StripeBillingProvider(secret);
    const maxCheckoutExpiry = Math.floor(Date.now() / 1000) + 21 * 60 * 60;
    const checkoutExpiresAt = claimed.offer.expiresAt ? Math.min(maxCheckoutExpiry, Math.floor(claimed.offer.expiresAt.getTime() / 1000)) : maxCheckoutExpiry;
    const session = await provider.createCheckout({ customerEmail: claimed.customer.email ?? customerEmail, customerName: claimed.customer.name, ...(claimed.customer.stripeCustomerId ? { customerId: claimed.customer.stripeCustomerId } : {}), planName: claimed.offer.planName, monthlyAmountCents: claimed.offer.monthlyAmountCents, setupAmountCents: claimed.offer.setupAmountCents, discountAmountCents: claimed.offer.discountAmountCents, currency: claimed.offer.currency, offerId: claimed.offer.id, checkoutAttemptKey: claimed.attemptKey, checkoutExpiresAt, customerRecordId: claimed.customer.id, successUrl: `${origin}/checkout/success?offer=${encodeURIComponent(token)}`, cancelUrl: `${origin}/checkout/${encodeURIComponent(token)}?canceled=1` });
    await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => {
      await tx.update(commercialOffers).set({ checkoutSessionId: session.id, checkoutUrl: session.url, updatedAt: new Date() }).where(and(eq(commercialOffers.id, claimed.offer.id), eq(commercialOffers.status, "checkout_pending")));
    });
    return NextResponse.json({ checkoutUrl: session.url });
  } catch {
    if (claimedOfferId) await withBusinessTransaction(getAppDatabase().db, { actorType: "system" }, async (tx) => {
      await tx.update(commercialOffers).set({ status: "open", updatedAt: new Date() }).where(and(eq(commercialOffers.id, claimedOfferId!), eq(commercialOffers.status, "checkout_pending"), isNull(commercialOffers.checkoutSessionId)));
    }).catch(() => undefined);
    return NextResponse.json({ error: "Checkout could not be started. Please try again." }, { status: 502 });
  }
}
