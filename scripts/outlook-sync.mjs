import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { validateSnapshot } from "../shared/outlookSync.mjs";

const secretPath = new URL("../.vercel/outlook-sync-secret", import.meta.url);
if (process.argv.includes("--init-secret")) {
  mkdirSync(new URL("../.vercel/", import.meta.url), { recursive: true });
  writeFileSync(secretPath, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
  console.log("Local sync credential created. Keep it out of source control.");
} else {
  try {
    const path = process.argv[2];
    if (!path) throw new Error("Usage: node scripts/outlook-sync.mjs <snapshot.json> [--apply]");
    const input = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
    const snapshot = validateSnapshot(input);
    console.log(JSON.stringify({ blockCount: snapshot.blocks.length, windowStart: snapshot.windowStart, windowEnd: snapshot.windowEnd }));
    if (process.argv.includes("--apply")) {
      const secret = readFileSync(secretPath, "utf8").trim();
      if (secret.length < 32) throw new Error("Sync credential is unavailable");
      const response = await fetch("https://leodenoir.com/api/outlook-sync", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, complete: true, category: "AT", showAs: "busy", ...snapshot })
      });
      const body = await response.json();
      if (!response.ok || body.verified !== true || body.blockCount !== snapshot.blocks.length) {
        throw new Error(`Synchronization failed (HTTP ${response.status}, code ${body.code || "verification"}). Existing bookings must not be overwritten manually.`);
      }
      console.log(JSON.stringify({ verified: true, blockCount: body.blockCount, syncedAt: body.syncedAt }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Synchronization failed");
    process.exitCode = 1;
  }
}
