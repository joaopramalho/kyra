import { headers } from "next/headers";

import { CommercialSalesConsole } from "@/components/commercial-sales-console";
import { requireSuperAdminSession } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export default async function CommercialPage() {
  await requireSuperAdminSession(new Headers(await headers()));
  return <div className="space-y-7"><div><p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Sales administration</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Billing and onboarding</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Create Stripe payment links, monitor paid subscriptions, and connect customers to tenants after manual provisioning.</p></div><CommercialSalesConsole /></div>;
}
