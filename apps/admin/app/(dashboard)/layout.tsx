import type { Metadata } from "next";
import { isPilotMode } from "@lobbystack/shared";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getActiveOnboardingState, isLmcPilotSetupRequired, resolveLmcPilotPageAccess, resolveOnboardingRoute } from "@lobbystack/domain";
import { RootDocument, appMetadata } from "@/app/root-document";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthDatabase, getSession } from "@/lib/auth";
import { getAppDatabase } from "@/lib/api-helpers";
import { localizePublicPath } from "@/lib/locale-path";
import { localeFromRequestHeaders, PATHNAME_HEADER } from "@/lib/locale-request";
import { routeNamespaces } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = appMetadata;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const { locale, source } = localeFromRequestHeaders(requestHeaders);
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(localizePublicPath("/login", locale));
  const pilotMode = isPilotMode(process.env);
  if (pilotMode) {
    const access = await resolveLmcPilotPageAccess({database:getAppDatabase().db,authDatabase:getAuthDatabase().db},session.user.id);
    if (!access) {
      // A verified new account has no tenant yet; explain manual pilot setup
      // instead of making a legitimate signup appear to have failed.
      if (await isLmcPilotSetupRequired({database:getAppDatabase().db,authDatabase:getAuthDatabase().db}, session.user.id)) redirect("/setup-required");
      // Never weaken the guard for unverified, revoked, foreign or
      // misconfigured workspaces.
      notFound();
    }
  } else {
    const onboarding = await getActiveOnboardingState(getAppDatabase().db, session.user.id);
    if (onboarding.stage !== "complete") redirect(resolveOnboardingRoute(onboarding.stage));
  }
  return (
    <RootDocument locale={locale} localeSource={source} namespaces={routeNamespaces(requestHeaders.get(PATHNAME_HEADER) ?? "/")}>
      <DashboardShell
        pilotMode={pilotMode}
        user={{
          email: session.user.email ?? "",
          name: session.user.name ?? session.user.email ?? "",
        }}
      >
        {children}
      </DashboardShell>
    </RootDocument>
  );
}
