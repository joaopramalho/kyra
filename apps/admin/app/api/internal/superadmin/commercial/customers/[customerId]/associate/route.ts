import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts, billingCheckoutRequests, businesses, commercialCustomers, platformAdminAuditEvents, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, readJson } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";
import { polarSubscriptionBlocksStripe } from "@/lib/commercial-billing-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ customerId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const { customerId } = await context.params;
    const body = await readJson(request);
    const tenantId = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).tenantId : null;
    if (typeof tenantId !== "string" || !tenantId) return NextResponse.json({ error: "tenantId is required." }, { status: 400 });
    const result = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const customer = (await tx.select({ id: commercialCustomers.id, tenantId: commercialCustomers.tenantId, onboardingStatus: commercialCustomers.onboardingStatus }).from(commercialCustomers).where(eq(commercialCustomers.id, customerId)).for("update").limit(1))[0];
      if (!customer) throw new Error("Commercial customer not found.");
      if (customer.onboardingStatus !== "paid_awaiting_onboarding" && customer.onboardingStatus !== "onboarded") throw new Error("Only a paid customer can be associated with a tenant.");
      if (customer.tenantId && customer.tenantId !== tenantId) throw new Error("A billing customer cannot be reassigned after association.");
      const tenant = (await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, tenantId)).limit(1))[0];
      if (!tenant) throw new Error("The selected tenant does not exist.");
      const polarAccount = (await tx.select({ subscriptionId: billingAccounts.subscriptionId, subscriptionState: billingAccounts.subscriptionState, source: billingAccounts.source }).from(billingAccounts).where(eq(billingAccounts.businessId, tenantId)).limit(1))[0];
      if (polarAccount && polarSubscriptionBlocksStripe({ source: polarAccount.source, subscriptionId: polarAccount.subscriptionId, status: polarAccount.subscriptionState })) throw new Error("This tenant has an active Polar subscription. Cancel or resolve it before associating Stripe billing.");
      const pendingPolarCheckout = (await tx.select({ id: billingCheckoutRequests.id }).from(billingCheckoutRequests).where(and(eq(billingCheckoutRequests.businessId, tenantId), sql`${billingCheckoutRequests.status} IN ('pending', 'processing', 'ready')`)).limit(1))[0];
      if (pendingPolarCheckout) throw new Error("This tenant has a pending Polar checkout. Resolve it before associating Stripe billing.");
      const other = (await tx.select({ id: commercialCustomers.id }).from(commercialCustomers).where(eq(commercialCustomers.tenantId, tenantId)).limit(1))[0];
      if (other && other.id !== customer.id) throw new Error("The selected tenant already has another billing customer.");
      await tx.update(commercialCustomers).set({ tenantId, onboardingStatus: "onboarded", updatedAt: new Date() }).where(eq(commercialCustomers.id, customer.id));
      await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.customer.associated", targetType: "commercial_customer", targetId: customer.id, changes: { tenantId }, requestId: randomUUID() });
      return { customerId: customer.id, tenantId, onboardingStatus: "onboarded" };
    });
    return NextResponse.json(result);
  } catch (error) { return asApiResponse(error); }
}
