import { randomUUID } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { affiliateProfiles, commercialCommissions, platformAdminAuditEvents, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, readJson } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ affiliateProfileId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const { affiliateProfileId } = await context.params;
    const body = await readJson(request);
    const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const externalReference = typeof input.externalReference === "string" ? input.externalReference.trim().slice(0, 200) : "";
    if (!externalReference) return NextResponse.json({ error: "Record the external payout reference before completing a payout." }, { status: 400 });
    const result = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const affiliate = (await tx.select({ id: affiliateProfiles.id }).from(affiliateProfiles).where(eq(affiliateProfiles.id, affiliateProfileId)).for("update").limit(1))[0];
      if (!affiliate) throw new Error("Affiliate not found.");
      const eligible = await tx.select({ id: commercialCommissions.id, commissionCents: commercialCommissions.commissionCents }).from(commercialCommissions).where(and(eq(commercialCommissions.affiliateProfileId, affiliate.id), lte(commercialCommissions.clearsAt, new Date()), sql`${commercialCommissions.status} IN ('pending', 'available')`)).for("update");
      if (eligible.length === 0) throw new Error("There are no eligible commissions for payout.");
      const reversals = await tx.select({ id: commercialCommissions.id, commissionCents: commercialCommissions.commissionCents, recoveredCents: commercialCommissions.recoveredCents }).from(commercialCommissions).where(and(eq(commercialCommissions.affiliateProfileId, affiliate.id), eq(commercialCommissions.status, "reversed"))).for("update");
      const grossCents = eligible.reduce((total, row) => total + row.commissionCents, 0);
      const recoveredCents = reversals.reduce((total, row) => total + Math.max(0, Math.abs(row.commissionCents) - row.recoveredCents), 0);
      const netCents = grossCents - recoveredCents;
      if (netCents <= 0) throw new Error("Available commissions do not exceed outstanding refund or dispute reversals.");
      const now = new Date();
      for (const commission of eligible) await tx.update(commercialCommissions).set({ status: "paid", paidAt: now, payoutReference: externalReference, updatedAt: now }).where(eq(commercialCommissions.id, commission.id));
      for (const reversal of reversals) await tx.update(commercialCommissions).set({ status: "recovered", recoveredCents: Math.abs(reversal.commissionCents), paidAt: now, payoutReference: externalReference, updatedAt: now }).where(eq(commercialCommissions.id, reversal.id));
      await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.affiliate.payout_recorded", targetType: "affiliate_profile", targetId: affiliate.id, changes: { commissionCount: eligible.length, grossCents, recoveredCents, totalCents: netCents, externalReference }, requestId: randomUUID() });
      return { affiliateProfileId: affiliate.id, commissionCount: eligible.length, grossCents, recoveredCents, totalCents: netCents, externalReference, paidAt: now };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
