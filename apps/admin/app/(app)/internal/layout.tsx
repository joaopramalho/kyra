import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Building2, LayoutDashboard, ShieldCheck } from "lucide-react";

import { PATHNAME_HEADER } from "@/lib/locale-request";
import { requireSuperAdminEnrollmentSession, requireSuperAdminSession, SuperAdminAccessError } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get(PATHNAME_HEADER) ?? "/internal";
  if (pathname.startsWith("/internal/mfa")) return children;

  try {
    await requireSuperAdminSession(new Headers(requestHeaders));
  } catch (error) {
    if (error instanceof SuperAdminAccessError && error.status === 401) {
      redirect(`/en/login?returnTo=${encodeURIComponent(pathname)}`);
    }
    try {
      await requireSuperAdminEnrollmentSession(new Headers(requestHeaders));
      redirect("/internal/mfa/setup");
    } catch {
      notFound();
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/internal" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-emerald-600" aria-hidden="true" />
            Kyra Super Admin
          </Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Internal navigation">
            <Link className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-100" href="/internal">
              <LayoutDashboard className="size-4" aria-hidden="true" /> Overview
            </Link>
            <Link className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-100" href="/internal/clients">
              <Building2 className="size-4" aria-hidden="true" /> Clients
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
