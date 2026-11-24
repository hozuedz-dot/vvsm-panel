import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VVSM VPN",
    short_name: "VVSM",
    description: "Manage your VVSM VPN account: usage, subscription links and crypto renewals.",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0f1f",
    theme_color: "#5b5bf0",
    categories: ["utilities", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Renew", url: "/portal", description: "Renew your subscription" },
      { name: "Apps", url: "/apps" },
    ],
  };
}
