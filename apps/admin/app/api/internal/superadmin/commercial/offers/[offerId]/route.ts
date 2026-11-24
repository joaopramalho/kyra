import { randomUUID } from "node:crypto";
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

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const { offerId } = await context.params;
    const config = stripeCommercialConfig();
    const current = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => (await tx.select({ id: commercialOffers.id, status: commercialOffers.status, checkoutSessionId: commercialOffers.checkoutSessionId }).from(commercialOffers).where(eq(commercialOffers.id, offerId)).limit(1))[0] ?? null);
    if (!current) throw new Error("Offer not found.");
    if (current.status === "paid") throw new Error("A paid offer cannot be revoked.");
    if (current.status === "checkout_pending" && current.checkoutSessionId) {
      if (!config) return NextResponse.json({ error: "Stripe is not configured to revoke this active checkout." }, { status: 503 });
      try { await new StripeBillingProvider(config.secretKey).expireCheckoutSession(current.checkoutSessionId); }
      catch { return NextResponse.json({ error: "The Stripe checkout could not be expired. It may already be complete." }, { status: 409 }); }
    }
    await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const offer = (await tx.select({ id: commercialOffers.id, status: commercialOffers.status }).from(commercialOffers).where(eq(commercialOffers.id, offerId)).for("update").limit(1))[0];
      if (!offer) throw new Error("Offer not found.");
      if (offer.status === "paid") throw new Error("A paid offer cannot be revoked.");
      if (offer.status === "open" || offer.status === "checkout_pending") {
        await tx.update(commercialOffers).set({ status: "revoked", checkoutUrl: null, updatedAt: new Date() }).where(eq(commercialOffers.id, offer.id));
        await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.offer.revoked", targetType: "commercial_offer", targetId: offer.id, changes: {}, requestId: randomUUID() });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
