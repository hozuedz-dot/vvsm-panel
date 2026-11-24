"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LangSwitch, ThemeToggle, useI18n } from "@/i18n";
import { Btn, Field, Icon, api } from "@/components/ui";

export default function AdminLogin() {
  const { t, tr } = useI18n();
  const router = useRouter();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [code, setCode] = useState("");
  const [need2fa, setNeed] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Already authenticated (valid session, or preview mode with login skipped) → go straight to the panel.
  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" }).then((r) => {
      if (r.ok) router.replace("/admin");
    }).catch(() => {});
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await api<{ need2fa?: boolean }>("/api/admin/login", "POST", { username, password, code });
    setBusy(false);
    if (r.data.need2fa && r.ok) return setNeed(true);
    if (!r.ok) {
      if (r.data.need2fa) setNeed(true);
      return setErr(tr(`err.${r.data.error}`, t("common.error")));
    }
    router.replace("/admin");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-40 start-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(closest-side,var(--accent),transparent)" }} />
      <div className="absolute end-4 top-4 flex gap-2"><LangSwitch compact /><ThemeToggle /></div>
      <form onSubmit={submit} className="card fade-in relative w-full max-w-sm space-y-4 p-6 sm:p-8">
        <div className="mb-2 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent2))" }}><Icon name="security" size={24} /></span>
          <div>
            <h1 className="text-xl font-extrabold">{t("login.title")}</h1>
            <p className="text-sm text-muted">{t("login.subtitle")}</p>
          </div>
        </div>
        <Field label={t("c.username")}><input className="input" value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" required dir="ltr" /></Field>
        <Field label={t("c.password")}><input className="input" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required dir="ltr" /></Field>
        {need2fa && <Field label={t("account.code")}><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus dir="ltr" /></Field>}
        {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
        <Btn variant="primary" className="w-full !py-2.5" loading={busy} type="submit">{t("login.submit")}</Btn>
        <p className="text-center text-xs text-muted">{t("login.hint")}</p>
      </form>
    </div>
  );
}
