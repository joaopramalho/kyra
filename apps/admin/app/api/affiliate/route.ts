import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { affiliateAttributions, affiliateClicks, affiliateCommissions, affiliatePayoutItems, affiliatePayoutRuns, affiliateProfileStats, affiliateProfiles, commercialCommissions, commercialCustomers, commercialPayments, commercialSubscriptions, withBusinessTransaction } from "@lobbystack/db";
import { affiliateProgramEnabled } from "@/lib/affiliate-program";
import { asApiResponse, getAppDatabase, requireApiSession } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!affiliateProgramEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const session = await requireApiSession(request);
    const data = await withBusinessTransaction(getAppDatabase().db, { userId: session.user.id, actorType: "operator" }, async (tx) => {
      let profile = (await tx.select({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, status: affiliateProfiles.status, commissionRateBps: affiliateProfiles.commissionRateBps, payoutEmail: affiliateProfiles.payoutEmail }).from(affiliateProfiles).where(eq(affiliateProfiles.userId, session.user.id)).limit(1))[0];
      if (!profile) {
        const preferred = session.user.name ?? session.user.email?.split("@")[0] ?? `user-${session.user.id.slice(-8)}`;
        const base = preferred.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || `user-${session.user.id.slice(-8)}`;
        for (let index = 0; index < 25 && !profile; index += 1) {
          const suffix = index === 0 ? "" : `-${index + 1}`;
          const candidate = `${base.slice(0, 64 - suffix.length).replace(/-+$/g, "")}${suffix}`;
          [profile] = await tx.insert(affiliateProfiles).values({ userId: session.user.id, referralCode: candidate }).onConflictDoNothing().returning({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, status: affiliateProfiles.status, commissionRateBps: affiliateProfiles.commissionRateBps, payoutEmail: affiliateProfiles.payoutEmail });
          if (!profile) {
            profile = (await tx.select({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, status: affiliateProfiles.status, commissionRateBps: affiliateProfiles.commissionRateBps, payoutEmail: affiliateProfiles.payoutEmail }).from(affiliateProfiles).where(eq(affiliateProfiles.userId, session.user.id)).limit(1))[0];
          }
        }
        if (profile) await tx.insert(affiliateProfileStats).values({ affiliateProfileId: profile.id }).onConflictDoNothing();
      }
      if (!profile) throw new Error("Affiliate profile could not be created.");
      const siteUrl = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_BASE_URL ?? "https://app.lobbystack.com").replace(/\/$/, "");

      const [stats, clicks, attributions, commissions, payouts] = await Promise.all([
        tx.select({ clickCount: affiliateProfileStats.clickCount, referralCount: affiliateProfileStats.referralCount, conversionCount: affiliateProfileStats.conversionCount, pendingCommissionCents: affiliateProfileStats.pendingCommissionCents, paidCommissionCents: affiliateProfileStats.paidCommissionCents }).from(affiliateProfileStats).where(eq(affiliateProfileStats.affiliateProfileId, profile.id)).limit(1),
        tx.select({ clickedAt: affiliateClicks.clickedAt, sourceUrl: affiliateClicks.sourceUrl }).from(affiliateClicks).where(eq(affiliateClicks.affiliateProfileId, profile.id)).orderBy(desc(affiliateClicks.clickedAt)).limit(20),
        tx.select({ businessId: affiliateAttributions.businessId, referralCode: affiliateAttributions.referralCode, source: affiliateAttributions.source, attributedAt: affiliateAttributions.attributedAt }).from(affiliateAttributions).where(eq(affiliateAttributions.affiliateProfileId, profile.id)).orderBy(desc(affiliateAttributions.attributedAt)).limit(20),
        tx.select({ sourceKey: affiliateCommissions.sourceKey, amountCents: affiliateCommissions.amountCents, commissionCents: affiliateCommissions.commissionCents, currency: affiliateCommissions.currency, status: affiliateCommissions.status, payoutState: affiliateCommissions.payoutState, occurredAt: affiliateCommissions.occurredAt, clearsAt: affiliateCommissions.clearsAt }).from(affiliateCommissions).where(eq(affiliateCommissions.affiliateProfileId, profile.id)).orderBy(desc(affiliateCommissions.occurredAt)).limit(50),
        tx.select({ periodKey: affiliatePayoutRuns.periodKey, status: affiliatePayoutItems.status, amountCents: affiliatePayoutItems.amountCents, currency: affiliatePayoutItems.currency, paidAt: affiliatePayoutItems.paidAt, externalReference: affiliatePayoutItems.externalReference }).from(affiliatePayoutItems).innerJoin(affiliatePayoutRuns, eq(affiliatePayoutRuns.id, affiliatePayoutItems.payoutRunId)).where(eq(affiliatePayoutItems.affiliateProfileId, profile.id)).orderBy(desc(affiliatePayoutItems.createdAt)).limit(20),
      ]);

      return { profile: { ...profile, referralLink: `${siteUrl}/checkout/affiliate/${encodeURIComponent(profile.referralCode)}` }, stats: stats[0] ?? { clickCount: 0, referralCount: 0, conversionCount: 0, pendingCommissionCents: 0, paidCommissionCents: 0 }, clicks, attributions, commissions, payouts };
    });
    const commercialData = await withBusinessTransaction(getAppDatabase().db, { userId: session.user.id, actorType: "system" }, async (tx) => {
      const ownedProfile = (await tx.select({ id: affiliateProfiles.id }).from(affiliateProfiles).where(eq(affiliateProfiles.userId, session.user.id)).limit(1))[0];
      if (!ownedProfile) return { commissions: [], payouts: [], referredCustomers: 0, paidCustomers: 0, activeSubscriptions: 0, pendingCommissionCents: 0, availableCommissionCents: 0, paidCommissionCents: 0, reversalDebtCents: 0 };
      const rows = await tx.select({ sourceKey: commercialCommissions.sourceKey, amountCents: commercialCommissions.amountCents, commissionCents: commercialCommissions.commissionCents, currency: commercialCommissions.currency, status: commercialCommissions.status, occurredAt: commercialPayments.occurredAt, clearsAt: commercialCommissions.clearsAt, paidAt: commercialCommissions.paidAt, payoutReference: commercialCommissions.payoutReference }).from(commercialCommissions).innerJoin(commercialPayments, eq(commercialPayments.id, commercialCommissions.paymentId)).where(eq(commercialCommissions.affiliateProfileId, ownedProfile.id)).orderBy(desc(commercialPayments.occurredAt)).limit(100);
      const referredCustomers = await tx.select({ count: sql<number>`count(*)` }).from(commercialCustomers).where(eq(commercialCustomers.affiliateProfileId, ownedProfile.id));
      const paidCustomers = await tx.select({ count: sql<number>`count(*)` }).from(commercialCustomers).where(and(eq(commercialCustomers.affiliateProfileId, ownedProfile.id), sql`${commercialCustomers.onboardingStatus} IN ('paid_awaiting_onboarding', 'onboarded')`));
      const activeSubscriptions = await tx.select({ count: sql<number>`count(*)` }).from(commercialSubscriptions).innerJoin(commercialCustomers, eq(commercialCustomers.id, commercialSubscriptions.customerId)).where(and(eq(commercialCustomers.affiliateProfileId, ownedProfile.id), eq(commercialSubscriptions.status, "active")));
      const [commissionBalances] = await tx.select({ pendingCommissionCents: sql<number>`coalesce(sum(CASE WHEN ${commercialCommissions.status} = 'pending' AND ${commercialCommissions.clearsAt} > now() THEN ${commercialCommissions.commissionCents} ELSE 0 END), 0)`, availableCommissionCents: sql<number>`coalesce(sum(CASE WHEN ${commercialCommissions.status} = 'available' OR (${commercialCommissions.status} = 'pending' AND ${commercialCommissions.clearsAt} <= now()) THEN ${commercialCommissions.commissionCents} ELSE 0 END), 0)`, paidCommissionCents: sql<number>`coalesce(sum(CASE WHEN ${commercialCommissions.status} IN ('paid', 'reversed', 'recovered') THEN ${commercialCommissions.commissionCents} ELSE 0 END), 0)`, reversalDebtCents: sql<number>`coalesce(sum(CASE WHEN ${commercialCommissions.status} = 'reversed' THEN abs(${commercialCommissions.commissionCents}) - ${commercialCommissions.recoveredCents} ELSE 0 END), 0)` }).from(commercialCommissions).where(eq(commercialCommissions.affiliateProfileId, ownedProfile.id));
      const grouped = new Map<string, { periodKey: string; status: string; amountCents: number; currency: string; paidAt: Date | null; externalReference: string | null }>();
      for (const row of rows) {
        if ((row.status !== "paid" && row.status !== "recovered") || !row.payoutReference) continue;
        const current = grouped.get(row.payoutReference);
        grouped.set(row.payoutReference, { periodKey: current?.periodKey ?? `${row.paidAt?.getUTCFullYear() ?? 0}-${String((row.paidAt?.getUTCMonth() ?? 0) + 1).padStart(2, "0")}`, status: "paid", amountCents: (current?.amountCents ?? 0) + row.commissionCents, currency: row.currency, paidAt: row.paidAt, externalReference: row.payoutReference });
      }
      return { commissions: rows, payouts: Array.from(grouped.values()), referredCustomers: Number(referredCustomers[0]?.count ?? 0), paidCustomers: Number(paidCustomers[0]?.count ?? 0), activeSubscriptions: Number(activeSubscriptions[0]?.count ?? 0), pendingCommissionCents: Number(commissionBalances?.pendingCommissionCents ?? 0), availableCommissionCents: Number(commissionBalances?.availableCommissionCents ?? 0), paidCommissionCents: Number(commissionBalances?.paidCommissionCents ?? 0), reversalDebtCents: Number(commissionBalances?.reversalDebtCents ?? 0) };
    });
    const commissions = [...data.commissions.map((row) => ({ ...row, provider: "legacy" })), ...commercialData.commissions.map((row) => ({ sourceKey: row.sourceKey, amountCents: row.amountCents, commissionCents: row.commissionCents, currency: row.currency, status: row.status === "available" ? "pending" : row.status, payoutState: row.status === "paid" ? "paid" : row.status === "recovered" ? "recovered" : row.status === "voided" ? "voided" : row.status === "reversed" ? "reversed" : "unassigned", occurredAt: row.occurredAt, clearsAt: row.clearsAt, provider: "stripe" }))].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 100);
    const payouts = [...data.payouts, ...commercialData.payouts];
    return NextResponse.json({ ...data, commissions, payouts, stats: { ...data.stats, pendingCommissionCents: data.stats.pendingCommissionCents + commercialData.pendingCommissionCents, availableCommissionCents: commercialData.availableCommissionCents, paidCommissionCents: data.stats.paidCommissionCents + commercialData.paidCommissionCents, reversalDebtCents: commercialData.reversalDebtCents, referralCount: data.stats.referralCount + commercialData.referredCustomers, conversionCount: data.stats.conversionCount + commercialData.paidCustomers, activeSubscriptions: commercialData.activeSubscriptions } });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!affiliateProgramEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const session = await requireApiSession(request);
    const body = await request.json() as { payoutEmail?: unknown };
    const payoutEmail = typeof body.payoutEmail === "string" ? body.payoutEmail.trim().toLowerCase() : "";
    if (!payoutEmail || !/^[^\s@]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(payoutEmail)) {
      return NextResponse.json({ error: "A valid payout email is required." }, { status: 400 });
    }
    return NextResponse.json(await withBusinessTransaction(getAppDatabase().db, { userId: session.user.id, actorType: "operator" }, async (tx) => {
      const [profile] = await tx.update(affiliateProfiles).set({ payoutEmail, updatedAt: new Date() }).where(eq(affiliateProfiles.userId, session.user.id)).returning({ id: affiliateProfiles.id, payoutEmail: affiliateProfiles.payoutEmail });
      if (!profile) return { profile: null };
      return { profile };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
