import { NextResponse } from "next/server";

import { getOnboardingNumberClaim } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function GET(request: Request, context: { params: Promise<{ claimId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request, { pilotCapability: "voice" });
    const { claimId } = await context.params;
    const claim = await getOnboardingNumberClaim(createDomainContext(), { userId: session.user.id, businessId, claimId });
    if (claim && claim.purpose !== "replacement") return NextResponse.json({ error: "Replacement claim not found." }, { status: 404 });
    return NextResponse.json({ claim });
  } catch (error) { return asApiResponse(error); }
}
