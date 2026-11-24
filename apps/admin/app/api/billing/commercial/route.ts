import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { commercialCustomers, commercialPayments, commercialSubscriptions, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await withOperatorTransaction(request, async ({ session, businessId }) => ({ userId: session.user.id, businessId }), { minimumRole: "business_admin" });
    const result = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: access.userId, businessId: access.businessId }, async (tx) => {
      const customer = (await tx.select({ id: commercialCustomers.id, name: commercialCustomers.name, email: commercialCustomers.email, stripeCustomerId: commercialCustomers.stripeCustomerId, onboardingStatus: commercialCustomers.onboardingStatus }).from(commercialCustomers).where(eq(commercialCustomers.tenantId, access.businessId)).limit(1))[0];
      if (!customer) return { customer: null, portalAvailable: false, subscriptions: [], invoices: [] };
      const subscriptions = await tx.select({ planName: commercialSubscriptions.planName, status: commercialSubscriptions.status, monthlyAmountCents: commercialSubscriptions.monthlyAmountCents, currency: commercialSubscriptions.currency, currentPeriodStart: commercialSubscriptions.currentPeriodStart, currentPeriodEnd: commercialSubscriptions.currentPeriodEnd, cancelAtPeriodEnd: commercialSubscriptions.cancelAtPeriodEnd }).from(commercialSubscriptions).where(eq(commercialSubscriptions.customerId, customer.id)).orderBy(desc(commercialSubscriptions.updatedAt));
      const invoices = await tx.select({ kind: commercialPayments.kind, status: commercialPayments.status, amountCents: commercialPayments.amountCents, currency: commercialPayments.currency, description: commercialPayments.description, hostedInvoiceUrl: commercialPayments.hostedInvoiceUrl, occurredAt: commercialPayments.occurredAt }).from(commercialPayments).where(eq(commercialPayments.customerId, customer.id)).orderBy(desc(commercialPayments.occurredAt)).limit(100);
      return { customer: { name: customer.name, email: customer.email, onboardingStatus: customer.onboardingStatus }, portalAvailable: Boolean(customer.stripeCustomerId), subscriptions, invoices };
    });
    return NextResponse.json(result);
  } catch (error) { return asApiResponse(error); }
}
