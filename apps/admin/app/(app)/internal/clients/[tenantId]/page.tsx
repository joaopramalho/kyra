import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { readManagedLmcDraft } from "@lobbystack/domain";
import { ManagedClientForm } from "@/components/managed-client-form";
import { getAppDatabase } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";

export default async function ManagedClientPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const parsed = z.string().uuid().safeParse((await params).tenantId);
  if (!parsed.success) notFound();
  const session = await requireSuperAdminSession(new Headers(await headers()));
  let record;
  try {
    record = await readManagedLmcDraft({ db: getAppDatabase().db }, { actorUserId: session.user.id, tenantId: parsed.data });
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) notFound();
    throw error;
  }
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Edit client draft</h1><p className="mt-2 text-sm text-zinc-600">Revision {record.revision}. Draft changes do not activate providers.</p></div><ManagedClientForm initial={record.draft} revision={record.revision} tenantId={record.tenantId} /></div>;
}
