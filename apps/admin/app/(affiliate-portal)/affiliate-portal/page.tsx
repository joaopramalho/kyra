import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { brand } from "@lobbystack/shared/brand";
import { AffiliatePortalSignOut } from "@/components/affiliate-portal-sign-out";
import { LiveAffiliateSurface } from "@/components/live-affiliate-surface";
import { affiliateProgramEnabled } from "@/lib/affiliate-program";
import { resolveLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { versionedAssetUrl } from "@/lib/versioned-assets";

export const dynamic = "force-dynamic";

export default async function AffiliatePortalPage() {
  if (!affiliateProgramEnabled()) notFound();
  const requestHeaders = await headers();
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(`/en/login?returnTo=${encodeURIComponent("/affiliate-portal")}`);

  const requestLocale = localeFromRequestHeaders(requestHeaders);
  const locale = resolveLocale(requestLocale.locale);
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link aria-label={brand.name} className="flex items-center gap-2.5" href="/affiliate-portal">
            <Image alt="" aria-hidden className="size-7 dark:invert" height={28} src={versionedAssetUrl(brand.logoPath)} unoptimized width={28} />
            <span className="font-heading text-lg font-semibold tracking-tight">{brand.name}<span className="ml-2 text-sm font-normal text-muted-foreground">Affiliates</span></span>
          </Link>
          <AffiliatePortalSignOut locale={locale} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <LiveAffiliateSurface />
      </main>
    </div>
  );
}
