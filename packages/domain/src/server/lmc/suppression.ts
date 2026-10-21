import { and, asc, eq, sql } from "drizzle-orm";
import {
  lmcLeads,
  lmcSuppressions,
  lmcEvents,
  type DatabaseTransaction,
} from "@lobbystack/db";

export async function suppressLmcEmail(
  tx: DatabaseTransaction,
  tenantId: string,
  email: string,
  reason: "opt_out" | "bounce" | "complaint",
  now: Date,
) {
  // Lock all conversations for the address so concurrent send transactions finish before suppression commits.
  await tx
    .select({ id: lmcLeads.id })
    .from(lmcLeads)
    .where(and(eq(lmcLeads.tenantId, tenantId), eq(lmcLeads.email, email)))
    .orderBy(asc(lmcLeads.id))
    .for("update");
  await tx
    .insert(lmcSuppressions)
    .values({ tenantId, email, reason, createdAt: now })
    .onConflictDoNothing({
      target: [lmcSuppressions.tenantId, lmcSuppressions.email],
    });
  await tx
    .update(lmcLeads)
    .set({
      status: reason === "opt_out" ? "opted_out" : "suppressed",
      reason,
      aiPaused: true,
      followupGeneration: sql`${lmcLeads.followupGeneration}+1`,
      updatedAt: now,
    })
    .where(and(eq(lmcLeads.tenantId, tenantId), eq(lmcLeads.email, email)));
  await tx
    .insert(lmcEvents)
    .values({
      tenantId,
      type: "email_suppressed",
      metadata: { reason },
      createdAt: now,
    });
}
