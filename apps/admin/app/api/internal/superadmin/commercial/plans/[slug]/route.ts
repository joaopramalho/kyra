import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { commercialPlans, platformAdminAuditEvents, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, readJson } from "@/lib/api-helpers";
import { requireSuperAdminSession } from "@/lib/superadmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ slug: string }> };
const cents = (value: unknown, name: string, allowZero = false) => {
  if (!Number.isSafeInteger(value) || (value as number) > 100_000_000 || (value as number) < (allowZero ? 0 : 1)) throw new Error(`${name} is outside the supported amount range.`);
  return value as number;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const { slug } = await context.params;
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Plan settings are required.");
    const input = body as Record<string, unknown>;
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 1000) : "";
    if (!name) throw new Error("Plan name is required.");
    const monthlyAmountCents = cents(input.monthlyAmountCents, "Monthly price");
    const setupAmountCents = cents(input.setupAmountCents, "Setup fee", true);
    const leadAllowance = input.leadAllowance === null || input.leadAllowance === "" ? null : cents(input.leadAllowance, "Lead allowance", true);
    for (const field of ["visible", "publiclyAvailable", "acceptsAffiliate", "allowPromotionCodes"] as const) if (typeof input[field] !== "boolean") throw new Error(`${field} must be a boolean.`);
    const stripeProductId = typeof input.stripeProductId === "string" && input.stripeProductId.trim() ? input.stripeProductId.trim().slice(0, 200) : null;
    const stripePriceId = typeof input.stripePriceId === "string" && input.stripePriceId.trim() ? input.stripePriceId.trim().slice(0, 200) : null;
    const updated = await withBusinessTransaction(getAppDatabase().db, { actorType: "system", userId: session.user.id }, async (tx) => {
      const [plan] = await tx.update(commercialPlans).set({ name, description, monthlyAmountCents, setupAmountCents, leadAllowance, stripeProductId, stripePriceId, visible: input.visible as boolean, publiclyAvailable: input.publiclyAvailable as boolean, acceptsAffiliate: input.acceptsAffiliate as boolean, allowPromotionCodes: input.allowPromotionCodes as boolean, updatedAt: new Date() }).where(eq(commercialPlans.slug, slug)).returning({ slug: commercialPlans.slug, name: commercialPlans.name, monthlyAmountCents: commercialPlans.monthlyAmountCents, setupAmountCents: commercialPlans.setupAmountCents });
      if (!plan) throw new Error("Commercial plan not found.");
      await tx.insert(platformAdminAuditEvents).values({ actorUserId: session.user.id, action: "commercial.plan.updated", targetType: "commercial_plan", targetId: slug, changes: { name, monthlyAmountCents, setupAmountCents, leadAllowance }, requestId: randomUUID() });
      return plan;
    });
    return NextResponse.json(updated);
  } catch (error) { return asApiResponse(error); }
}
