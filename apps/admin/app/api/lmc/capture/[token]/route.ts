import { handleLmcCapture } from "@lobbystack/domain";
import { isLmcEmailLeadsEnabled } from "@lobbystack/shared";
import { getLmcServices } from "@/lib/lmc-runtime";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
export function OPTIONS() {
  if (!isLmcEmailLeadsEnabled()) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 204, headers: cors });
}
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isLmcEmailLeadsEnabled()) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { token } = await context.params;
  const response = await handleLmcCapture(
    request,
    token,
    getLmcServices().capture,
  );
  for (const [key, value] of Object.entries(cors))
    response.headers.set(key, value);
  return response;
}
