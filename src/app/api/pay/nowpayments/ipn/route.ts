/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { applyNowStatus, verifyNowSignature } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { logEvent } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const p = await getSettings("payments");
  const sig = req.headers.get("x-nowpayments-sig") || "";
  if (!verifyNowSignature(body, sig, p.nowpayments.ipnSecret)) {
    await logEvent("warn", "payments", "NOWPayments IPN rejected: bad signature");
    return Response.json({ error: "bad_signature" }, { status: 401 });
  }
  const orderId = String(body.order_id || "");
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return Response.json({ error: "order_not_found" }, { status: 404 });
  // guard against underpayment: price must be fully paid (within tolerance)
  if (["finished", "confirmed", "sending"].includes(body.payment_status)) {
    const paid = Number(body.actually_paid ?? body.pay_amount ?? 0);
    const want = Number(o.payAmount);
    if (paid && want && paid < want * (1 - p.underpaidTolerancePct / 100)) {
      await db.update(orders).set({ status: "underpaid" }).where(eq(orders.id, o.id));
      return Response.json({ ok: true, note: "underpaid" });
    }
  }
  await applyNowStatus(o.id, String(body.payment_status));
  return Response.json({ ok: true });
}
