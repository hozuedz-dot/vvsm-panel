import { getAdmin, unauthorized } from "@/lib/auth";
import { subscriptionOriginOf } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  return Response.json({ origin: await subscriptionOriginOf(req) }, { headers: { "Cache-Control": "no-store" } });
}
