import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { coverContent } from "@/lib/cover-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSettings("cover");
  const k = coverContent(c.theme, c.lang, c);
  return { title: `${k.name} — ${k.tagline}`, description: k.hero, manifest: null, icons: null };
}

export default async function CoverPage() {
  const c = await getSettings("cover");
  const k = coverContent(c.theme, c.lang, c);
  const fa = c.lang !== "en";
  const L = k.labels;
  const year = new Date().getFullYear();
  const grad = `linear-gradient(135deg, ${k.color}, ${k.color2})`;
  return (
    <div dir={fa ? "rtl" : "ltr"} className="min-h-screen bg-white text-slate-800" style={{ fontFamily: fa ? "Vazirmatn, Tahoma, sans-serif" : "Inter, Arial, sans-serif" }}>
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black text-white" style={{ background: grad }}>{k.name.slice(0, 1)}</span>
            <div><p className="text-sm font-extrabold leading-tight">{k.name}</p><p className="text-[11px] text-slate-500">{k.tagline}</p></div>
          </div>
          <nav className="hidden gap-6 text-sm font-semibold text-slate-600 md:flex">
            <a href="#services">{L.services}</a><a href="#about">{L.about}</a><a href="#faq">{L.faq}</a><a href="#contact">{L.contact}</a>
          </nav>
          {c.phone && <a href={`tel:${c.phone}`} className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: grad }} dir="ltr">{c.phone}</a>}
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]" style={{ background: grad }} />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2">
          <div>
            <p className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: grad }}>{c.city || k.tagline}</p>
            <h1 className="text-3xl font-black leading-tight sm:text-5xl">{k.tagline}</h1>
            <p className="mt-5 text-base leading-8 text-slate-600">{k.hero}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#contact" className="rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg" style={{ background: grad }}>{k.cta}</a>
              <a href="#services" className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold">{L.services}</a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {k.stats.map(([v, l]) => (
              <div key={l} className="rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm">
                <p className="text-3xl font-black" style={{ color: k.color }}>{v}</p>
                <p className="mt-1 text-sm text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-2xl font-black sm:text-3xl">{L.services}</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {k.services.map((s) => (
            <div key={s.title} className="rounded-3xl border border-slate-100 p-6 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="text-3xl">{s.icon}</span>
              <h3 className="mt-3 text-lg font-extrabold">{s.title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="about" className="scroll-mt-20 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <div><h2 className="text-2xl font-black sm:text-3xl">{L.about}</h2><p className="mt-5 leading-8 text-slate-600">{k.about}</p></div>
          <div>
            <h3 className="text-lg font-extrabold">{L.process}</h3>
            <ol className="mt-5 space-y-4">
              {k.steps.map((s) => (
                <li key={s.title} className="flex items-start gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: grad }}>{fa ? Number(s.icon).toLocaleString("fa-IR") : s.icon}</span>
                  <div><p className="font-bold">{s.title}</p><p className="text-sm text-slate-500">{s.text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-black sm:text-3xl">{L.reviews}</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {k.testimonials.map(([who, text]) => (
            <figure key={who} className="rounded-3xl border border-slate-100 p-6"><blockquote className="leading-8 text-slate-700">«{text}»</blockquote><figcaption className="mt-3 text-sm font-bold" style={{ color: k.color }}>— {who}</figcaption></figure>
          ))}
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-center text-2xl font-black sm:text-3xl">{L.faq}</h2>
          <div className="mt-8 space-y-3">
            {k.faq.map(([q, a]) => (
              <details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer list-none font-bold">{q}</summary><p className="mt-3 text-sm leading-7 text-slate-600">{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-2xl font-black sm:text-3xl">{L.contact}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {c.phone && <div className="rounded-2xl border border-slate-100 p-5"><p className="text-xs text-slate-500">{L.phone}</p><p className="mt-1 font-bold" dir="ltr">{c.phone}</p></div>}
            {c.email && <div className="rounded-2xl border border-slate-100 p-5"><p className="text-xs text-slate-500">{L.email}</p><p className="mt-1 font-bold" dir="ltr">{c.email}</p></div>}
            {(c.address || c.city) && <div className="rounded-2xl border border-slate-100 p-5"><p className="text-xs text-slate-500">{L.address}</p><p className="mt-1 font-bold">{c.address || c.city}</p></div>}
            <div className="rounded-2xl border border-slate-100 p-5"><p className="text-xs text-slate-500">{L.hours}</p><p className="mt-1 font-bold">{L.hoursValue}</p></div>
          </div>
          <form action={c.email ? `mailto:${c.email}` : "#contact"} method="post" encType="text/plain" className="space-y-3 rounded-3xl border border-slate-100 p-6 shadow-sm">
            <p className="font-extrabold">{L.request}</p>
            <input name="name" required placeholder={L.nameField} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400" />
            <input name="phone" required placeholder={L.phoneField} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400" dir="ltr" />
            <textarea name="message" rows={4} placeholder={L.msgField} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400" />
            <button type="submit" className="w-full rounded-xl py-3 text-sm font-bold text-white" style={{ background: grad }}>{L.send}</button>
          </form>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-500">© {fa ? year.toLocaleString("fa-IR", { useGrouping: false }) : year} {k.name} — {L.rights}</footer>
    </div>
  );
}
