import Link from "next/link";
import { headers } from "next/headers";
import { AlertTriangle, ArrowRight, Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSuperAdminOverview, requireSuperAdminSession, SUPERADMIN_LIFECYCLES } from "@/lib/superadmin";

const labels = {
  draft: "Draft",
  needs_connection: "Needs connection",
  ready_for_test: "Ready for test",
  active: "Active",
  paused: "Paused",
  error: "Error",
} as const;

export default async function SuperAdminOverviewPage() {
  const session = await requireSuperAdminSession(new Headers(await headers()));
  const overview = await getSuperAdminOverview(session.user.id);
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-emerald-700">Internal operations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-zinc-600">Read-only pilot health across Kyra clients.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm text-zinc-600">Total clients</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{overview.total}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-zinc-600">Active</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{overview.counts.active}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-zinc-600">Ready for test</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{overview.counts.ready_for_test}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm text-zinc-600"><AlertTriangle className="size-4" /> Needs attention</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{overview.needsAttention}</CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lifecycle</CardTitle>
          <Link className="flex items-center gap-1 text-sm font-medium text-emerald-700" href="/internal/clients">View clients <ArrowRight className="size-4" /></Link>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUPERADMIN_LIFECYCLES.map((state) => <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3" key={state}><span className="text-sm">{labels[state]}</span><Badge variant="secondary">{overview.counts[state]}</Badge></div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recently edited</CardTitle></CardHeader>
        <CardContent className="divide-y divide-zinc-100">
          {overview.recent.length === 0 ? <p className="py-6 text-sm text-zinc-500">No clients yet.</p> : overview.recent.map((client) => (
            <div className="flex items-center justify-between py-3" key={client.id}>
              <div className="flex items-center gap-3"><Building2 className="size-4 text-zinc-400" /><div><p className="text-sm font-medium">{client.name}</p><p className="text-xs text-zinc-500">{client.ownerEmail ?? client.slug}</p></div></div>
              <div className="text-right"><Badge variant="outline">{labels[client.lifecycle]}</Badge><p className="mt-1 text-xs text-zinc-500">{new Date(client.updatedAt).toLocaleDateString("en-CA")}</p></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
