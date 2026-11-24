import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { billingAccounts, commercialCustomers, withBusinessTransaction } from "@lobbystack/db";
import { PolarBillingProvider } from "@lobbystack/providers";
import { hasBillingCustomerPortal } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, getAppDatabase, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const access = await withOperatorTransaction(request, async ({ tx, session, businessId: authorizedBusinessId }) => ({ authorizedBusinessId, userId: session.user.id, account: (await tx.select({ billingKey: billingAccounts.billingKey, customerId: billingAccounts.customerId, subscriptionId: billingAccounts.subscriptionId, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, authorizedBusinessId)).limit(1))[0] ?? null }), { minimumRole: "business_admin" });
    const stripeCustomerId = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: access.userId, businessId: access.authorizedBusinessId }, async (tx) => (await tx.select({ stripeCustomerId: commercialCustomers.stripeCustomerId }).from(commercialCustomers).where(eq(commercialCustomers.tenantId, access.authorizedBusinessId)).limit(1))[0]?.stripeCustomerId ?? null);
    if (stripeCustomerId) return NextResponse.json({ error: "Stripe commercial billing is linked to this tenant. Use the Stripe billing action instead." }, { status: 409 });
    const token = process.env.POLAR_ACCESS_TOKEN;
    const organizationId = process.env.POLAR_ORGANIZATION_ID;
    if (!token || !organizationId) throw new Error("Billing customer portal is not configured.");
    const account = access.account;
    if (!account || !hasBillingCustomerPortal(account)) return NextResponse.json({ error: "A billing customer with subscription history is required before opening the customer portal." }, { status: 409 });
    const provider = new PolarBillingProvider({ accessToken: token, organizationId, ...(process.env.POLAR_API_BASE_URL ? { baseUrl: process.env.POLAR_API_BASE_URL } : {}) });
    return NextResponse.json(await provider.createCustomerPortalSession({ externalCustomerId: account.billingKey, returnUrl: `${process.env.APP_BASE_URL ?? new URL(request.url).origin}/settings/plan` }));
  } catch (error) { return asApiResponse(error); }
}
