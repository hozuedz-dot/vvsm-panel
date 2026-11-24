"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function Qr({ text, size = 180, dark = "#0f172a", light = "#ffffff" }: { text: string; size?: number; dark?: string; light?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M", color: { dark, light } })
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [text, size, dark, light]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="QR" className="rounded-xl" style={{ background: light }} /> : <div style={{ width: size, height: size }} className="animate-pulse rounded-xl bg-card2" />;
}
