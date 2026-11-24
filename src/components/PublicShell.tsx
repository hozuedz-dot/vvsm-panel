"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { LangSwitch, ThemeToggle, useI18n } from "@/i18n";
import { Icon } from "@/components/ui";

export default function PublicShell({ children, banner }: { children: ReactNode; banner?: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/#pricing", l: t("land.nav.pricing") },
    { href: "/blog", l: t("land.nav.blog") },
    { href: "/apps", l: t("land.nav.apps") },
    { href: "/portal", l: t("land.nav.portal") },
  ];
  return (
    <div className="min-h-screen">
      {banner && <div className="bg-warn/20 px-4 py-2 text-center text-sm font-semibold text-warn">🛠 {banner}</div>}
      <header className="sticky top-0 z-30 border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent2))" }}><Icon name="bolt" size={18} /></span>
            <span className="text-lg font-extrabold tracking-tight">VVSM</span>
          </Link>
          <nav className="ms-6 hidden items-center gap-1 md:flex">
            {links.map((l) => <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:bg-card2 hover:text-ink">{l.l}</Link>)}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <LangSwitch compact />
            <ThemeToggle />
            <Link href="/buy" className="btn btn-primary hidden sm:inline-flex">{t("land.buy")}</Link>
            <button className="btn !px-2.5 md:hidden" onClick={() => setOpen(!open)} aria-label="menu"><Icon name="menu" /></button>
          </div>
        </div>
        {open && (
          <div className="fade-in border-t border-line px-4 py-2 md:hidden">
            {links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold">{l.l}</Link>)}
            <Link href="/buy" onClick={() => setOpen(false)} className="btn btn-primary mt-1 w-full">{t("land.buy")}</Link>
          </div>
        )}
      </header>
      {children}
      <footer className="mt-20 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} VVSM · vvsm.online</p>
          <div className="flex gap-4">
            <Link href="/blog" className="hover:text-ink">{t("land.nav.blog")}</Link>
            <Link href="/apps" className="hover:text-ink">{t("land.nav.apps")}</Link>
            <Link href="/portal" className="hover:text-ink">{t("land.nav.portal")}</Link>
            <Link href="/admin" className="hover:text-ink">{t("land.admin")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
