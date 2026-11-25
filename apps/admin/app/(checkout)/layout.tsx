import { headers } from "next/headers";

import { RootDocument, appMetadata } from "@/app/root-document";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { PUBLIC_ROUTE_NAMESPACES } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export const metadata = appMetadata;

export default async function CommercialCheckoutLayout({ children }: { children: React.ReactNode }) {
  const { locale, source } = localeFromRequestHeaders(await headers());
  return <RootDocument locale={locale} localeSource={source} namespaces={PUBLIC_ROUTE_NAMESPACES}>{children}</RootDocument>;
}
