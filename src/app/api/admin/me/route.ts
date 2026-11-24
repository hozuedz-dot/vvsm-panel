import { clearSessionCookie, getAdmin, previewNoLogin, unauthorized } from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBootstrap();
  const a = await getAdmin();
  if (!a) return unauthorized();
  const g = await getSettings("general");
  return Response.json({
    id: a.id,
    username: a.username,
    totpEnabled: a.totpEnabled,
    mustChange: a.mustChange,
    preview: previewNoLogin(),
    lastLoginAt: a.lastLoginAt,
    siteName: g.siteName,
    domain: g.domain,
    demoMode: g.demoMode,
  });
}

export async function DELETE() {
  await clearSessionCookie("vvsm_admin");
  return Response.json({ ok: true });
}
