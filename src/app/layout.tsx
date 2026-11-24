import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/i18n";
import { Toaster } from "@/components/ui";
import type { Lang } from "@/lib/format";

export const metadata: Metadata = {
  title: "VVSM — Secure VPN",
  description: "VVSM VPN panel: VLESS, VMess, Trojan, WireGuard, OpenVPN, Hysteria2 and Psiphon with crypto payments.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#5b5bf0", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const c = await cookies();
  const h = await headers();
  const al = (h.get("accept-language") || "").toLowerCase();
  const guess: Lang = al.startsWith("fa") ? "fa" : al.startsWith("ru") ? "ru" : al.startsWith("de") ? "de" : "en";
  const cl = c.get("vvsm_lang")?.value as Lang | undefined;
  const lang: Lang = cl && ["fa", "en", "ru", "de"].includes(cl) ? cl : guess;
  const theme = c.get("vvsm_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={lang} dir={lang === "fa" ? "rtl" : "ltr"} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Vazirmatn:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <Providers initialLang={lang} initialTheme={theme}>
          {children}
          <Toaster />
        </Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
          }}
        />
      </body>
    </html>
  );
}
