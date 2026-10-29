import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { reserveOnboardingNumberClaim } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getNumberClaimTokenSecret } from "@/lib/twilio-provider";

export async function POST(request: Request) {
  try { const { session, businessId } = await requireOperatorBusiness(request, { pilotCapability: "voice" }); const body = await readJson(request) as { claimToken?: string; idempotencyKey?: string }; if (!body.claimToken) return NextResponse.json({ error: "claimToken is required." }, { status: 400 }); return NextResponse.json({ claimId: await reserveOnboardingNumberClaim(createDomainContext(), { userId: session.user.id, businessId, claimToken: body.claimToken, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: body.idempotencyKey ?? randomUUID() }) }, { status: 202 }); } catch (error) { return asApiResponse(error); }
}
