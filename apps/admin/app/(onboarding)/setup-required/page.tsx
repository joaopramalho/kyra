import { eq } from "drizzle-orm";
import { users } from "@lobbystack/db";
import { isPilotMode } from "@lobbystack/shared";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAuthDatabase, getSession } from "@/lib/auth";
import { localizePublicPath } from "@/lib/locale-path";
import { localeFromRequestHeaders } from "@/lib/locale-request";

export const dynamic = "force-dynamic";

/** No workspace data is exposed before the trusted pilot bootstrap completes. */
export default async function SetupRequiredPage() {
  if (!isPilotMode(process.env)) notFound();
  const requestHeaders = await headers();
  const { locale } = localeFromRequestHeaders(requestHeaders);
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(localizePublicPath("/login", locale));

  const [account] = await getAuthDatabase().db
    .select({ verified: users.emailVerified, activeBusinessId: users.activeBusinessId })
    .from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!account?.verified || account.activeBusinessId) notFound();

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="mb-3 text-sm font-medium text-muted-foreground">Lead My Company</p>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace setup required</h1>
        <p className="mt-4 text-muted-foreground">
          Your account is verified, but your business workspace has not been activated yet.
          This pilot requires an administrator to configure your business and connect its calendar.
        </p>
        <p className="mt-4 text-muted-foreground">
          Your leads and email settings will become available after the workspace setup is completed.
          You do not need to create another account.
        </p>
        <div className="mt-6 rounded-lg bg-muted p-4">
          <p className="text-sm font-medium">Account ID for the pilot administrator</p>
          <code className="mt-2 block break-all text-sm">{session.user.id}</code>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          If you are running this pilot, complete the tenant bootstrap and Google Calendar setup
          using the project's operator setup instructions.
        </p>
      </div>
    </main>
  );
}
