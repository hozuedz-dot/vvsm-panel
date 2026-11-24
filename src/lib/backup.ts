import fs from "fs/promises";
import path from "path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backups } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { run } from "@/lib/system";
import { logEvent, notify } from "@/lib/telegram";

async function dir() {
  const s = await getSettings("backup");
  let d = s.dir;
  try {
    await fs.mkdir(d, { recursive: true });
  } catch {
    d = path.join(process.cwd(), "data", "backups");
    await fs.mkdir(d, { recursive: true });
  }
  return d;
}

export async function createBackup(kind: "manual" | "auto" = "manual") {
  const d = await dir();
  const filename = `vvsm-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
  const file = path.join(d, filename);
  const r = await run("pg_dump", ["--dbname", process.env.DATABASE_URL || "", "-Fc", "-f", file], 120000);
  if (!r.ok) {
    await logEvent("error", "backup", `pg_dump failed: ${r.out.slice(0, 200)}`);
    return { ok: false as const, error: r.out || "pg_dump unavailable" };
  }
  const st = await fs.stat(file);
  const [row] = await db.insert(backups).values({ filename, sizeBytes: st.size, kind }).returning();
  const s = await getSettings("backup");
  const all = await db.select().from(backups).orderBy(desc(backups.createdAt));
  for (const old of all.slice(Math.max(1, s.keep))) {
    await fs.rm(path.join(/*turbopackIgnore: true*/ d, old.filename), { force: true });
    await db.delete(backups).where(eq(backups.id, old.id));
  }
  await logEvent("info", "backup", `Backup created: ${filename}`);
  await notify("backup", `💾 Backup created: ${filename} (${(st.size / 1024 / 1024).toFixed(1)} MB)`);
  return { ok: true as const, backup: row };
}

export async function backupPath(id: number) {
  const [b] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  if (!b) return null;
  return { b, file: path.join(/*turbopackIgnore: true*/ await dir(), b.filename) };
}

export async function restoreBackup(id: number) {
  const p = await backupPath(id);
  if (!p) return { ok: false, error: "not_found" };
  const r = await run(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--dbname", process.env.DATABASE_URL || "", p.file],
    300000
  );
  await logEvent(r.ok ? "info" : "warn", "backup", `restore ${p.b.filename}: ${r.ok ? "ok" : r.out.slice(0, 200)}`);
  return { ok: r.ok, output: r.out.slice(0, 500) };
}

export async function deleteBackup(id: number) {
  const p = await backupPath(id);
  if (!p) return;
  await fs.rm(p.file, { force: true });
  await db.delete(backups).where(eq(backups.id, id));
}
