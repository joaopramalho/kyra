import { headers } from "next/headers";

import { RootDocument } from "@/app/root-document";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { resolveLocale } from "@/lib/locale";
import "../globals.css";

export const dynamic = "force-dynamic";

export default async function AffiliatePortalLayout({ children }: { children: React.ReactNode }) {
  const requestLocale = localeFromRequestHeaders(await headers());
  return <RootDocument locale={resolveLocale(requestLocale.locale)} localeSource={requestLocale.source} namespaces={["common", "auth", "onboarding", "affiliate", "nav"]}>{children}</RootDocument>;
}
