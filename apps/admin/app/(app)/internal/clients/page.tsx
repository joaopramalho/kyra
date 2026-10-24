import { headers } from "next/headers";
import Link from "next/link";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSuperAdminClients, requireSuperAdminSession } from "@/lib/superadmin";

const labels: Record<string, string> = { draft: "Draft", needs_connection: "Needs connection", ready_for_test: "Ready for test", active: "Active", paused: "Paused", error: "Error" };

export default async function SuperAdminClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await requireSuperAdminSession(new Headers(await headers()));
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 160);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const limit = 25;
  const result = await listSuperAdminClients({ userId: session.user.id, search, limit, offset: (page - 1) * limit });
  const href = (nextPage: number) => `/internal/clients?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(nextPage) })}`;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">Clients</h1><p className="mt-2 text-sm text-zinc-600">Searchable, read-only tenant inventory.</p></div>
      <form className="flex max-w-xl gap-2" method="get"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" /><Input className="pl-9" defaultValue={search} maxLength={160} name="q" placeholder="Search name, slug, or owner email" /></div><Button type="submit">Search</Button></form>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Updated</th></tr></thead><tbody className="divide-y divide-zinc-100">
          {result.data.map((client) => <tr key={client.id}><td className="px-4 py-3"><p className="font-medium">{client.name}</p><p className="text-xs text-zinc-500">{client.slug}</p></td><td className="px-4 py-3 text-zinc-600">{client.ownerEmail ?? "—"}</td><td className="px-4 py-3"><Badge variant="outline">{labels[client.lifecycle]}</Badge></td><td className="px-4 py-3 text-zinc-600">{new Date(client.updatedAt).toLocaleDateString("en-CA")}</td></tr>)}
          {result.data.length === 0 && <tr><td className="px-4 py-10 text-center text-zinc-500" colSpan={4}>No clients found.</td></tr>}
        </tbody></table>
      </div>
      <div className="flex items-center justify-between text-sm text-zinc-600"><span>{result.total} clients</span><div className="flex gap-2">{page > 1 && <Link className={buttonVariants({ variant: "outline" })} href={href(page - 1)}>Previous</Link>}{result.hasNext && <Link className={buttonVariants({ variant: "outline" })} href={href(page + 1)}>Next</Link>}</div></div>
    </div>
  );
}
