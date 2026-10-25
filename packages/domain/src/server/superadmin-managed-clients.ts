import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";

import { superAdminClientDraftSchema, type SuperAdminClientDraft } from "@lobbystack/contracts";
import {
  businessInvitations, businesses, enqueueOutbox, lmcTenantDrafts, platformAdminAuditEvents,
  platformAdminOperations, receptionistProfiles, staff, withBusinessTransaction, type Database,
} from "@lobbystack/db";
import { defaultAppointmentChangePolicy } from "@lobbystack/shared";
import { requirePlatformAdmin } from "../authz";

type Context = { db: Database; now?: () => Date };
type OperationResponse = Record<string, unknown>;

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function previousOperation(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], input: { actorUserId: string; action: string; idempotencyKey: string; hash: string }) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.actorUserId}:${input.action}:${input.idempotencyKey}`}, 0))`);
  const [existing] = await tx.select({ requestHash: platformAdminOperations.requestHash, response: platformAdminOperations.response }).from(platformAdminOperations)
    .where(and(eq(platformAdminOperations.actorUserId, input.actorUserId), eq(platformAdminOperations.action, input.action), eq(platformAdminOperations.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing && existing.requestHash !== input.hash) throw Object.assign(new Error("IDEMPOTENCY_KEY_REUSED"), { status: 409, code: "idempotency_conflict" });
  return existing?.response;
}

async function recordOperation(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], input: { actorUserId: string; action: string; idempotencyKey: string; hash: string; response: OperationResponse }) {
  await tx.insert(platformAdminOperations).values({ actorUserId: input.actorUserId, action: input.action, idempotencyKey: input.idempotencyKey, requestHash: input.hash, response: input.response });
}

async function audit(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], input: { actorUserId: string; action: string; tenantId: string; changes: Record<string, unknown>; requestId: string }) {
  await tx.insert(platformAdminAuditEvents).values({ actorUserId: input.actorUserId, action: input.action, targetType: "business", targetId: input.tenantId, changes: input.changes, requestId: input.requestId });
}

export async function provisionManagedLmcClient(context: Context, input: { actorUserId: string; idempotencyKey: string; requestId: string; draft: unknown }) {
  const draft = superAdminClientDraftSchema.parse(input.draft);
  const hash = requestHash(draft);
  const tenantId = randomUUID();
  return await withBusinessTransaction(context.db, { actorType: "system", userId: input.actorUserId, businessId: tenantId }, async (tx) => {
    await requirePlatformAdmin(tx, input.actorUserId);
    const previous = await previousOperation(tx, { actorUserId: input.actorUserId, action: "client.create", idempotencyKey: input.idempotencyKey, hash });
    if (previous) return { ...(previous as { tenantId: string; revision: number }), created: false };
    const now = context.now?.() ?? new Date();
    await tx.insert(businesses).values({ id: tenantId, name: draft.name, slug: draft.slug, timezone: draft.timezone, businessType: draft.businessType, status: "draft", onboardingStage: "managed_draft", deploymentMode: "cloud", createdAt: now, updatedAt: now });
    await tx.insert(staff).values({ businessId: tenantId, name: draft.name, timezone: draft.timezone, active: true, createdAt: now, updatedAt: now });
    await tx.insert(receptionistProfiles).values({ businessId: tenantId, greeting: `Thanks for calling ${draft.name}.`, tone: "warm and direct", summary: `${draft.name} uses Kyra to respond to service requests.`, bookingPolicy: "Only confirm a booking after availability is checked.", voiceInstructions: "Sound calm, confident, and concise. Escalate urgent requests when policy requires it.", smsInstructions: "Keep replies concise and friendly.", transferMode: "on_request", appointmentChangePolicy: defaultAppointmentChangePolicy, createdAt: now, updatedAt: now });
    await tx.insert(lmcTenantDrafts).values({ tenantId, ownerEmail: draft.ownerEmail, draft, revision: 1, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId, createdAt: now, updatedAt: now });
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: tenantId, aggregateType: "business", aggregateId: tenantId, dedupeKey: `business:${tenantId}:snapshot:draft`, payload: { businessId: tenantId, reason: "managed_draft_created" } });
    await audit(tx, { actorUserId: input.actorUserId, action: "client.create", tenantId, changes: { lifecycle: "draft", ownerEmailChanged: true }, requestId: input.requestId });
    const response = { tenantId, revision: 1, created: true };
    await recordOperation(tx, { actorUserId: input.actorUserId, action: "client.create", idempotencyKey: input.idempotencyKey, hash, response });
    return response;
  });
}

export async function readManagedLmcDraft(context: Context, input: { actorUserId: string; tenantId: string }) {
  return await withBusinessTransaction(context.db, { actorType: "system", userId: input.actorUserId, businessId: input.tenantId }, async (tx) => {
    await requirePlatformAdmin(tx, input.actorUserId);
    const [row] = await tx.select({ draft: lmcTenantDrafts.draft, revision: lmcTenantDrafts.revision, updatedAt: lmcTenantDrafts.updatedAt }).from(lmcTenantDrafts).where(eq(lmcTenantDrafts.tenantId, input.tenantId)).limit(1);
    if (!row) throw Object.assign(new Error("CLIENT_DRAFT_NOT_FOUND"), { status: 404, code: "not_found" });
    return { tenantId: input.tenantId, draft: superAdminClientDraftSchema.parse(row.draft), revision: row.revision, updatedAt: row.updatedAt };
  });
}

export async function updateManagedLmcDraft(context: Context, input: { actorUserId: string; tenantId: string; expectedRevision: number; requestId: string; draft: unknown }) {
  const draft = superAdminClientDraftSchema.parse(input.draft);
  return await withBusinessTransaction(context.db, { actorType: "system", userId: input.actorUserId, businessId: input.tenantId }, async (tx) => {
    await requirePlatformAdmin(tx, input.actorUserId);
    const [current] = await tx.select({ revision: lmcTenantDrafts.revision, draft: lmcTenantDrafts.draft }).from(lmcTenantDrafts).where(eq(lmcTenantDrafts.tenantId, input.tenantId)).limit(1).for("update");
    if (!current) throw Object.assign(new Error("CLIENT_DRAFT_NOT_FOUND"), { status: 404, code: "not_found" });
    if (current.revision !== input.expectedRevision) throw Object.assign(new Error("CLIENT_DRAFT_CHANGED"), { status: 409, code: "revision_conflict" });
    const now = context.now?.() ?? new Date();
    const revision = current.revision + 1;
    await tx.update(lmcTenantDrafts).set({ ownerEmail: draft.ownerEmail, draft, revision, updatedByUserId: input.actorUserId, updatedAt: now }).where(eq(lmcTenantDrafts.tenantId, input.tenantId));
    await tx.update(businesses).set({ name: draft.name, slug: draft.slug, timezone: draft.timezone, businessType: draft.businessType, updatedAt: now }).where(eq(businesses.id, input.tenantId));
    const old = superAdminClientDraftSchema.parse(current.draft);
    const changedFields = (["name", "slug", "timezone", "businessType", "ownerEmail", "hours", "settings"] as const).filter((key) => JSON.stringify(old[key]) !== JSON.stringify(draft[key]));
    await audit(tx, { actorUserId: input.actorUserId, action: "client.draft.update", tenantId: input.tenantId, changes: { revision, changedFields }, requestId: input.requestId });
    return { tenantId: input.tenantId, revision, changed: changedFields.length > 0 };
  });
}

export async function inviteManagedLmcOwner(context: Context, input: { actorUserId: string; tenantId: string; idempotencyKey: string; requestId: string; appBaseUrl: string }) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const hash = requestHash({ tenantId: input.tenantId });
  return await withBusinessTransaction(context.db, { actorType: "system", userId: input.actorUserId, businessId: input.tenantId }, async (tx) => {
    await requirePlatformAdmin(tx, input.actorUserId);
    const previous = await previousOperation(tx, { actorUserId: input.actorUserId, action: `client.invite:${input.tenantId}`, idempotencyKey: input.idempotencyKey, hash });
    if (previous) return { ...(previous as { tenantId: string; invitationId: string }), created: false };
    const [draft] = await tx.select({ ownerEmail: lmcTenantDrafts.ownerEmail }).from(lmcTenantDrafts).where(eq(lmcTenantDrafts.tenantId, input.tenantId)).limit(1);
    if (!draft) throw Object.assign(new Error("CLIENT_DRAFT_NOT_FOUND"), { status: 404, code: "not_found" });
    const now = context.now?.() ?? new Date();
    const [pending] = await tx.select({ id: businessInvitations.id }).from(businessInvitations).where(and(eq(businessInvitations.businessId, input.tenantId), eq(businessInvitations.normalizedEmail, draft.ownerEmail), eq(businessInvitations.role, "business_owner"), eq(businessInvitations.status, "pending"), gt(businessInvitations.expiresAt, now))).limit(1);
    if (pending) {
      const response = { tenantId: input.tenantId, invitationId: pending.id, created: false };
      await recordOperation(tx, { actorUserId: input.actorUserId, action: `client.invite:${input.tenantId}`, idempotencyKey: input.idempotencyKey, hash, response });
      return response;
    }
    const invitationId = randomUUID();
    await tx.insert(businessInvitations).values({ id: invitationId, businessId: input.tenantId, invitedByUserId: input.actorUserId, email: draft.ownerEmail, normalizedEmail: draft.ownerEmail, role: "business_owner", tokenHash, status: "pending", expiresAt: new Date(now.getTime() + 7 * 86_400_000) });
    const url = new URL("/accept-invite", input.appBaseUrl); url.searchParams.set("token", token);
    await enqueueOutbox(tx, { topic: "email.send", businessId: input.tenantId, aggregateType: "business_invitation", aggregateId: invitationId, dedupeKey: `managed-invitation:${invitationId}:send`, payload: { invitationId, email: draft.ownerEmail, token, template: "invitation", url: url.href } });
    await audit(tx, { actorUserId: input.actorUserId, action: "client.invite", tenantId: input.tenantId, changes: { invitationId, role: "business_owner" }, requestId: input.requestId });
    const response = { tenantId: input.tenantId, invitationId, created: true };
    await recordOperation(tx, { actorUserId: input.actorUserId, action: `client.invite:${input.tenantId}`, idempotencyKey: input.idempotencyKey, hash, response });
    return response;
  });
}
