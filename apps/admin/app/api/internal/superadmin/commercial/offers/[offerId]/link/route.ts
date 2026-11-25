import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { commercialOffers, platformAdminAuditEvents, withBusinessTransaction } from "@lobbystack/db";
import { StripeBillingProvider } from "@lobbystack/providers";
import { asApiResponse, getAppDatabase } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";
import { stripeCommercialConfig } from "@/lib/stripe-commercial";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ offerId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const { offerId } = await context.params;
    const origin = process.env.APP_BASE_URL?.replace(/\/$/, "");
    if (!origin) throw new Error("APP_BASE_URL is required to issue payment links.");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const current = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => (await tx.select({ id: commercialOffers.id, status: commercialOffers.status, checkoutSessionId: commercialOffers.checkoutSessionId, expiresAt: commercialOffers.expiresAt }).from(commercialOffers).where(eq(commercialOffers.id, offerId)).limit(1))[0] ?? null);
    if (!current) throw new Error("Offer not found.");
    if (current.status === "paid" || current.status === "revoked" || current.status === "expired") throw new Error("Only unpaid active offers can have a new payment link.");
    if (current.expiresAt && current.expiresAt <= new Date()) throw new Error("This offer has expired and cannot issue a new payment link.");
    if (current.status === "checkout_pending" && current.checkoutSessionId) {
      const config = stripeCommercialConfig();
      if (!config) return NextResponse.json({ error: "Stripe is not configured to rotate this active checkout." }, { status: 503 });
      try { await new StripeBillingProvider(config.secretKey).expireCheckoutSession(current.checkoutSessionId); }
      catch { return NextResponse.json({ error: "The active Stripe checkout could not be expired. It may already be complete." }, { status: 409 }); }
    }
    await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const offer = (await tx.select({ id: commercialOffers.id, status: commercialOffers.status }).from(commercialOffers).where(eq(commercialOffers.id, offerId)).for("update").limit(1))[0];
      if (!offer || !["open", "checkout_pending"].includes(offer.status)) throw new Error("This offer is no longer available for a new payment link.");
      await tx.update(commercialOffers).set({ tokenHash, status: "open", checkoutSessionId: null, checkoutUrl: null, updatedAt: new Date() }).where(eq(commercialOffers.id, offerId));
      await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.offer.link_rotated", targetType: "commercial_offer", targetId: offerId, changes: {}, requestId: randomUUID() });
    });
    return NextResponse.json({ paymentUrl: `${origin}/checkout/${token}` });
  } catch (error) { return asApiResponse(error); }
}
