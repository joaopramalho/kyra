import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { commercialPlans, platformAdminAuditEvents, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, readJson } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Plan details are required.");
    const input = body as Record<string, unknown>;
    const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 1000) : "";
    const monthlyAmountCents = input.monthlyAmountCents;
    const setupAmountCents = input.setupAmountCents ?? 0;
    const leadAllowance = input.leadAllowance ?? null;
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(slug) || !name || !Number.isSafeInteger(monthlyAmountCents) || (monthlyAmountCents as number) <= 0 || !Number.isSafeInteger(setupAmountCents) || (setupAmountCents as number) < 0 || ((leadAllowance !== null) && (!Number.isSafeInteger(leadAllowance) || (leadAllowance as number) < 0))) throw new Error("Plan values are invalid.");
    const result = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const [plan] = await tx.insert(commercialPlans).values({ slug, name, description, monthlyAmountCents: monthlyAmountCents as number, setupAmountCents: setupAmountCents as number, leadAllowance: leadAllowance as number | null, visible: true, publiclyAvailable: false, acceptsAffiliate: false, allowPromotionCodes: true }).returning({ id: commercialPlans.id, slug: commercialPlans.slug });
      await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.plan.created", targetType: "commercial_plan", targetId: slug, changes: { name, monthlyAmountCents, setupAmountCents, leadAllowance }, requestId: randomUUID() });
      return plan;
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
