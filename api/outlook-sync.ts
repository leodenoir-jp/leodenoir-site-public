import { createHash, timingSafeEqual } from "node:crypto";
import { validateSnapshot } from "../shared/outlookSync.mjs";
import { createServiceClient } from "./_lib/counseling.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  const secret = process.env.OUTLOOK_SYNC_SECRET;
  if (!secret || secret.length < 32) return res.status(503).json({ message: "Sync is not configured" });
  const token = String(req.headers?.authorization || "").replace(/^Bearer /, "");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(token), digest(secret))) return res.status(401).json({ message: "Unauthorized" });
  let snapshot;
  try {
    snapshot = validateSnapshot(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
  } catch {
    return res.status(400).json({ message: "Invalid or incomplete snapshot; existing reservations retained" });
  }
  try {
    const client = await createServiceClient();
    const { data, error } = await client.rpc("sync_outlook_at_busy", {
      p_start: snapshot.windowStart, p_end: snapshot.windowEnd,
      p_fetched: snapshot.fetchedAt, p_blocks: snapshot.blocks
    });
    if (error) {
      console.error("Outlook AT sync rejected", { code: error.code });
      return res.status(409).json({ message: "Sync rejected; previous reservations retained", code: error.code });
    }
    const saved: { start: string; end: string }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: readError } = await client.from("calendar_reservations")
        .select("starts_at,ends_at").eq("source_type", "learning").like("source_id", "OUTLOOK-AT:%")
        .eq("status", "active").gte("starts_at", snapshot.windowStart).lt("starts_at", snapshot.windowEnd)
        .order("starts_at").range(offset, offset + 499);
      if (readError) throw readError;
      saved.push(...(rows || []).map((row: any) => ({ start: new Date(row.starts_at).toISOString(), end: new Date(row.ends_at).toISOString() })));
      if (!rows || rows.length < 500) break;
    }
    if (JSON.stringify(saved) !== JSON.stringify(snapshot.blocks)) {
      console.error("Outlook AT sync verification failed");
      return res.status(500).json({ message: "Synchronization verification failed" });
    }
    return res.status(200).json({ ...data, verified: true });
  } catch {
    console.error("Outlook AT sync failed");
    return res.status(500).json({ message: "Sync failed; check server configuration" });
  }
}
