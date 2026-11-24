// Reset the first admin's password (and disable 2FA):  vvsm reset-admin 'NewPassw0rd!'
import fs from "fs";
import crypto from "crypto";
import pg from "pg";

const pw = process.argv[2];
if (!pw || pw.length < 8) {
  console.error("Usage: node scripts/reset-admin.mjs <new-password (min 8 chars)>");
  process.exit(1);
}
for (const l of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m) process.env[m[1]] ??= m[2];
}
const salt = crypto.randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const r = await client.query(
  "UPDATE admins SET password_hash=$1, must_change=false, failed_attempts=0, locked_until=NULL, totp_enabled=false, totp_secret=NULL WHERE id=(SELECT min(id) FROM admins) RETURNING username",
  [hash]
);
await client.end();
console.log(r.rowCount ? `Password reset for admin "${r.rows[0].username}"` : "No admin found");
