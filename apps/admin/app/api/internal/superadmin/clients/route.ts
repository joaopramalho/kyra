import { NextResponse } from "next/server";

import { asApiResponse, parsePagination } from "@/lib/api-helpers";
import { listSuperAdminClients, requireSuperAdminSession } from "@/lib/superadmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireSuperAdminSession(request.headers);
    const { limit, offset } = parsePagination(request, { limit: 25, maxLimit: 100 });
    const search = new URL(request.url).searchParams.get("search") ?? "";
    const result = await listSuperAdminClients({ userId: session.user.id, search, limit, offset });
    return NextResponse.json({ ...result, pagination: { limit, offset, total: result.total, hasNext: result.hasNext } });
  } catch (error) {
    return asApiResponse(error);
  }
}
