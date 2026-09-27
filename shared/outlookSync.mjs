const day = 86_400_000;

function timestamp(value) {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error("Explicit timezone required");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid timestamp");
  return parsed;
}

// Only anonymous time ranges leave the Outlook connector; no subjects or bodies.
export function validateSnapshot(input, now = Date.now()) {
  if (!input || input.version !== 1 || input.category !== "AT" || input.showAs !== "busy" || input.complete !== true) throw new Error("Incomplete or incorrect Outlook snapshot");
  const start = timestamp(input.windowStart);
  const end = timestamp(input.windowEnd);
  const fetched = timestamp(input.fetchedAt);
  if (end <= start || end - start > 93 * day || start < now - day || start > now + day) throw new Error("Invalid synchronization window");
  if (Math.abs(now - fetched) > 60 * 60_000) throw new Error("Snapshot is stale");
  if (!Array.isArray(input.blocks) || input.blocks.length > 5000) throw new Error("Invalid block list");
  const ranges = input.blocks.map((block) => {
    if (!block || Object.keys(block).some((key) => !["start", "end"].includes(key))) throw new Error("Only start and end are permitted");
    const a = timestamp(block.start), b = timestamp(block.end);
    if (b <= a || b - a > 93 * day || b <= start || a >= end) throw new Error("Invalid busy interval");
    return [Math.max(a, start), Math.min(b, end)];
  }).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return {
    windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(),
    fetchedAt: new Date(fetched).toISOString(),
    blocks: merged.map(([a, b]) => ({ start: new Date(a).toISOString(), end: new Date(b).toISOString() }))
  };
}
