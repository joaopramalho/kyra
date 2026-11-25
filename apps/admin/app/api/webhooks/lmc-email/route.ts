import { handleLmcEmailWebhook } from "@lobbystack/domain";
import { isLmcEmailLeadsEnabled } from "@lobbystack/shared";
import { getLmcInbound, getLmcServices } from "@/lib/lmc-runtime";
export async function POST(request: Request) {
  if (!isLmcEmailLeadsEnabled()) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return handleLmcEmailWebhook(
    request,
    getLmcInbound(),
    getLmcServices().reception,
  );
}
