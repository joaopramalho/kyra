import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { affiliateProfileStats, affiliateProfiles, commercialCommissions, platformAdminAuditEvents, users, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, readJson } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";
import { stripeCommercialConfig } from "@/lib/stripe-commercial";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function codeFrom(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export async function GET(request: Request) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const config = stripeCommercialConfig();
    return NextResponse.json(await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const profiles = await tx.select({ id: affiliateProfiles.id, userId: affiliateProfiles.userId, userName: users.name, email: users.email, referralCode: affiliateProfiles.referralCode, status: affiliateProfiles.status, commissionRateBps: affiliateProfiles.commissionRateBps, payoutEmail: affiliateProfiles.payoutEmail, createdAt: affiliateProfiles.createdAt }).from(affiliateProfiles).innerJoin(users, eq(users.id, affiliateProfiles.userId)).orderBy(desc(affiliateProfiles.createdAt)).limit(200);
      const commissions = await tx.select({ affiliateProfileId: commercialCommissions.affiliateProfileId, status: commercialCommissions.status, commissionCents: commercialCommissions.commissionCents, clearsAt: commercialCommissions.clearsAt }).from(commercialCommissions);
      return { affiliates: profiles.map((profile) => {
        const rows = commissions.filter((commission) => commission.affiliateProfileId === profile.id);
        const now = new Date();
        return { ...profile, referralLink: `${config?.appBaseUrl ?? process.env.APP_BASE_URL?.replace(/\/$/, "") ?? ""}/checkout/affiliate/${encodeURIComponent(profile.referralCode)}`, pendingCommissionCents: rows.filter((row) => row.status === "pending" && row.clearsAt > now).reduce((sum, row) => sum + row.commissionCents, 0), availableCommissionCents: rows.filter((row) => row.status === "available" || (row.status === "pending" && row.clearsAt <= now)).reduce((sum, row) => sum + row.commissionCents, 0), paidCommissionCents: rows.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.commissionCents, 0) };
      }) };
    }));
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    if (!stripeCommercialConfig()) return NextResponse.json({ error: "Stripe commercial billing is not configured." }, { status: 503 });
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Affiliate details are required.");
    const input = body as Record<string, unknown>;
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const rate = input.commissionRateBps === undefined ? 2500 : input.commissionRateBps;
    const requestedCode = typeof input.referralCode === "string" ? codeFrom(input.referralCode) : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(rate) || (rate as number) < 0 || (rate as number) > 10_000) throw new Error("Affiliate email or commission rate is invalid.");
    const result = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const user = (await tx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.normalizedEmail, email)).limit(1))[0];
      if (!user) throw new Error("Create or invite this user account before adding them as an affiliate.");
      const existing = (await tx.select({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode }).from(affiliateProfiles).where(eq(affiliateProfiles.userId, user.id)).limit(1))[0];
      if (existing) {
        const [profile] = await tx.update(affiliateProfiles).set({ status: "active", commissionRateBps: rate as number, updatedAt: new Date() }).where(eq(affiliateProfiles.id, existing.id)).returning({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, commissionRateBps: affiliateProfiles.commissionRateBps });
        await tx.insert(affiliateProfileStats).values({ affiliateProfileId: existing.id }).onConflictDoNothing();
        return { ...profile!, userEmail: user.email, userName: user.name, reused: true };
      }
      const preferred = requestedCode || codeFrom(user.name || user.email.split("@")[0] || user.id.slice(-8));
      if (preferred.length < 2) throw new Error("A referral code must contain at least two letters or numbers.");
      const [profile] = await tx.insert(affiliateProfiles).values({ userId: user.id, referralCode: preferred, status: "active", commissionRateBps: rate as number }).returning({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode, commissionRateBps: affiliateProfiles.commissionRateBps });
      await tx.insert(affiliateProfileStats).values({ affiliateProfileId: profile!.id }).onConflictDoNothing();
      await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.affiliate.created", targetType: "affiliate_profile", targetId: profile!.id, changes: { userId: user.id, referralCode: preferred, commissionRateBps: rate }, requestId: randomUUID() });
      return { ...profile!, userEmail: user.email, userName: user.name, reused: false };
    });
    const origin = stripeCommercialConfig()!.appBaseUrl;
    return NextResponse.json({ ...result, referralLink: `${origin}/checkout/affiliate/${encodeURIComponent(result.referralCode)}` }, { status: result.reused ? 200 : 201 });
  } catch (error) { return asApiResponse(error); }
}
