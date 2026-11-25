import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, commercialCustomers, commercialSubscriptions, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const data = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const customers = await tx.select({ id: commercialCustomers.id, name: commercialCustomers.name, email: commercialCustomers.email, tenantId: commercialCustomers.tenantId, stripeCustomerId: commercialCustomers.stripeCustomerId, affiliateProfileId: commercialCustomers.affiliateProfileId, onboardingStatus: commercialCustomers.onboardingStatus, internalNotes: commercialCustomers.internalNotes, createdAt: commercialCustomers.createdAt }).from(commercialCustomers).orderBy(desc(commercialCustomers.createdAt)).limit(200);
      const tenants = await tx.select({ id: businesses.id, name: businesses.name, slug: businesses.slug }).from(businesses).orderBy(businesses.name).limit(500);
      const subscriptions = await tx.select({ customerId: commercialSubscriptions.customerId, planName: commercialSubscriptions.planName, status: commercialSubscriptions.status, monthlyAmountCents: commercialSubscriptions.monthlyAmountCents, currentPeriodEnd: commercialSubscriptions.currentPeriodEnd }).from(commercialSubscriptions).orderBy(desc(commercialSubscriptions.updatedAt));
      const latest = new Map<string, typeof subscriptions[number]>();
      for (const subscription of subscriptions) if (!latest.has(subscription.customerId)) latest.set(subscription.customerId, subscription);
      return { customers: customers.map((customer) => ({ ...customer, subscription: latest.get(customer.id) ?? null })), tenants };
    });
    return NextResponse.json(data);
  } catch (error) { return asApiResponse(error); }
}
