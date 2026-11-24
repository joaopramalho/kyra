import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { commercialCustomers, withBusinessTransaction } from "@lobbystack/db";
import { StripeBillingProvider } from "@lobbystack/providers";
import { asApiResponse, getAppDatabase, withOperatorTransaction } from "@/lib/api-helpers";
import { stripeCommercialConfig } from "@/lib/stripe-commercial";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const config = stripeCommercialConfig();
    if (!config) return NextResponse.json({ error: "Billing portal is not configured." }, { status: 503 });
    const access = await withOperatorTransaction(request, async ({ session, businessId }) => ({ userId: session.user.id, businessId }), { minimumRole: "business_admin" });
    const customerId = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: access.userId, businessId: access.businessId }, async (tx) => (await tx.select({ stripeCustomerId: commercialCustomers.stripeCustomerId }).from(commercialCustomers).where(eq(commercialCustomers.tenantId, access.businessId)).limit(1))[0]?.stripeCustomerId ?? null);
    if (!customerId) return NextResponse.json({ error: "Stripe billing is not associated with this tenant." }, { status: 409 });
    const portal = await new StripeBillingProvider(config.secretKey).createPortalSession({ customerId, returnUrl: `${config.appBaseUrl}/settings/plan` });
    return NextResponse.json(portal);
  } catch (error) { return asApiResponse(error); }
}
