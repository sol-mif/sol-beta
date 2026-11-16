// The one canonical JSON (pure): what an event is written as before it is hashed, the same for both books. Cowork v3's
// trail (team/v3/trail.ts) made it and exports it from there as before; the local log (log.ts, the event format v1)
// imports it from here. It lives outside team/v3 because nothing outside team/v3 may load a v3 module while Cowork v3's
// switch is off (test/v3-off.test.ts), and the log runs with that switch off.
import { createHash } from "node:crypto";

/** JSON with every object's keys sorted and nothing undefined: the one way an event is written (pure) */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** the content pointer of a value (pure); no value at all is "" */
export const hashOf = (value: unknown): string => (value === undefined ? "" : sha(canonical(value)));
