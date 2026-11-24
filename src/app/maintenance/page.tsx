import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import Countdown from "./Countdown";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [m, c, g] = await Promise.all([getSettings("maintenance"), getSettings("cover"), getSettings("general")]);
  const name = c.enabled ? c.businessName || "Website" : g.siteName;
  return { title: `${m.title || "Maintenance"} — ${name}`, description: m.message || "Scheduled maintenance", robots: { index: false } };
}

export default async function MaintenancePage() {
  const [m, c, g] = await Promise.all([getSettings("maintenance"), getSettings("cover"), getSettings("general")]);
  const fa = (c.enabled ? c.lang : g.defaultLanguage) === "fa";
  const name = c.enabled ? c.businessName || (fa ? "وب‌سایت" : "Website") : g.siteName;
  const title = m.title || (fa ? "در حال به‌روزرسانی و نگهداری هستیم" : "We are performing scheduled maintenance");
  const message = m.message || (fa ? "برای ارائهٔ خدمات بهتر، سامانه موقتاً در دسترس نیست. به‌زودی بازمی‌گردیم. از شکیبایی شما سپاسگزاریم." : "We are improving our service and will be back shortly. Thank you for your patience.");
  const support = m.showSupport ? (c.enabled ? c.email || c.phone : g.supportUrl || g.supportEmail) : "";
  return (
    <div dir={fa ? "rtl" : "ltr"} className="relative flex min-h-screen items-center justify-center overflow-hidden px-4" style={{ background: "radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent), radial-gradient(900px 500px at 110% 110%, color-mix(in srgb, var(--accent2) 16%, transparent), transparent), var(--bg)" }}>
      <div className="card fade-in relative w-full max-w-xl p-8 text-center sm:p-10">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl text-white" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent2))" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-[spin_6s_linear_infinite]"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{name}</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-sm leading-7 text-muted">{message}</p>
        <div className="mx-auto mt-6 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-card2"><div className="h-full w-1/3 animate-[pulse_1.6s_ease-in-out_infinite] rounded-full" style={{ background: "linear-gradient(90deg,var(--accent),var(--accent2))" }} /></div>
        {m.endsAt && <Countdown until={m.endsAt} fa={fa} />}
        {support && <p className="mt-6 text-xs text-muted">{fa ? "پشتیبانی:" : "Support:"} <span dir="ltr" className="font-semibold text-ink">{support}</span></p>}
      </div>
    </div>
  );
}
