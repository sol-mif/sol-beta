// Agents' meta (#1327, pass 2): traces. A trace is one time a job was done: a sticky's `did:` line (Home writes it under
// the sticky in the folder's stickies.md, the face's home/folders/stickies.ts), a "show me once" (its `step:` lines and
// the cadence said), or an answered ask handed in by whoever heard it (recordAsk). Kept per home in
// <HOME>/agents-traces.json (never committed), with Jev's pair scores so a pair is asked once.
//   - [x] Title — what it asks
//     - asked Nov 10 19:40
//     - did: what was made, with its file names · read: mail, rota.pdf · 20 min
//     - shown Nov 11 · every week
//     - step: …
// What a did line says is read loosely: the files it names and its words give what was made and for whom, a "read:"
// part (or "from …") the sources, "N min" or "N h" the person's own minutes, the sticky's title a date it had to meet.
// What a line does not say stays empty; nothing is guessed (an empty part fails the gate it feeds, offer.ts).
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Place } from "./places.js";
import { MONTH, dateWord, monthOf } from "./places.js";

export type Made = { kind: string; for: "self" | "others" };
export type Trace = {
  id: string;
  /** the place's id (places.ts) */
  place: string;
  at: number;
  sources: string[];
  made: Made;
  steps: string[];
  /** the person's own minutes, when said */
  minutes: number | null;
  /** a date the work had to meet (YYYY-MM-DD) */
  date?: string;
  /** a cadence the person said ("every week") */
  cadence?: string;
  /** the sticky's title and its did line, as written */
  text: string;
  from: "did" | "shown" | "ask";
};
export type TraceFile = { v: 1; traces: Trace[]; pairs: Record<string, number | null> };

const KEEP = 2000;

/** "Nov 10 19:40" → ms, in the year that puts it at or before now (pure); null when it is not a stamp */
export function stampAt(s: string, now: number): number | null {
  const m = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?:\\s+(\\d{1,2}):(\\d\\d))?`, "i").exec(s);
  if (!m) return null;
  const mo = monthOf(m[1]);
  if (mo < 0) return null;
  const y0 = m[3] ? Number(m[3]) : new Date(now).getFullYear();
  let t = new Date(y0, mo, Number(m[2]), m[4] ? Number(m[4]) : 12, m[5] ? Number(m[5]) : 0).getTime();
  if (!m[3] && t > now + 86_400_000) t = new Date(y0 - 1, mo, Number(m[2]), m[4] ? Number(m[4]) : 12, m[5] ? Number(m[5]) : 0).getTime();
  return t;
}
/** a date a title names (pure): "by Dec 1", "Dec 24", "2026-12-01" → YYYY-MM-DD in the year after `at`'s month; else undefined */
export function dateIn(title: string, at: number): string | undefined {
  const iso = /\b(\d{4})-(\d\d)-(\d\d)\b/.exec(title);
  if (iso) return iso[0];
  const m = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})\\b`, "i").exec(title);
  if (!m) return undefined;
  const d0 = new Date(at), mo = monthOf(m[1]);
  let y = d0.getFullYear();
  if (new Date(y, mo, Number(m[2])).getTime() < at - 31 * 86_400_000) y++;
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}
/** the person's minutes a line says (pure): "20 min", "1.5 h", "6 h" */
export function minutesIn(s: string): number | null {
  const m = /\b(\d+(?:\.\d+)?)\s*(min|mins|minutes|h|hrs?|hours?)\b/i.exec(s);
  if (!m) return null;
  return Math.round(Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1));
}
/** the files a line names (pure) */
export const filesIn = (s: string) => [...s.matchAll(/(?:[\w.-]+\/)*[\w-]+\.[a-z0-9]{1,5}\b|\b[\w-]+\/(?=[\s,.;)]|$)/gi)].map((m) => m[0]);
/** what was made, and for whom (pure): by the files it names, else by its words; kind "" when it does not say */
export function madeOf(did: string): Made {
  const s = did.toLowerCase();
  const others = /\b(draft(ed|s)?|repl(y|ied)|message|e-?mail|nudge|letter to|sent|send|swap asks? to)\b|drafts\//i.test(did);
  const file = filesIn(did).find((f) => !f.endsWith("/")) ?? null;
  let kind = "";
  if (/\bcalendar|\bevents?\b|\bshifts? in\b|\bdates? in\b/.test(s)) kind = "calendar";
  else if (others) kind = "message";
  else if (/\blist\b/.test(s)) kind = "list";
  else if (file) kind = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  else if (filesIn(did).length) kind = "file";
  else if (/\b(made|wrote|saved|filed|logged|matched|checked|added|updated)\b/.test(s)) kind = "note";
  return { kind, for: others ? "others" : "self" };
}
/** the sources a did line says it read (pure): its "read:" part, else "from …" */
export function sourcesIn(did: string): string[] {
  const r = /(?:^|·)\s*read:\s*([^·]+)/i.exec(did) ?? /\bfrom\s+([^·;]+)/i.exec(did);
  if (!r) return [];
  const files = filesIn(r[1]).filter((f) => !f.endsWith("/"));
  if (files.length && !/read:/i.test(r[0])) return [...new Set(files.map((f) => f.toLowerCase()))];
  return [...new Set(r[1].split(/,|\band\b/).map((x) => x.trim().toLowerCase().replace(/^(the|my|your|\d+)\s+/, "")).filter((x) => x && !dateWord(x)))];
}
/** the steps of a did line (pure): its parts between " · ", the read and the minutes left out */
export const stepsOf = (did: string) => did.split("·").map((x) => x.trim()).filter((x) => x && !/^read:/i.test(x) && minutesIn(x) === null);

const ITEM = /^- \[( |x|X)\]\s+(.*)$/, NOTE = /^\s{2,}- (.*)$/;
const idOf = (...xs: (string | number)[]) => `t-${createHash("sha256").update(xs.join("\u0000")).digest("hex").slice(0, 12)}`;

/** the traces in one place's stickies.md (pure). `place` is the folder's place; a sticky whose title names one of
 *  `items` (a source's items in this folder) is that item's trace instead. `now` sets the year of a stamp. */
export function tracesIn(text: string, place: string, now: number, items: { id: string; name: string }[] = []): Trace[] {
  const out: Trace[] = [];
  type S = { title: string; notes: string[] };
  const stickies: S[] = [];
  for (const line of text.split("\n")) {
    const m = ITEM.exec(line), n = NOTE.exec(line);
    if (m) stickies.push({ title: m[2].split(" — ")[0].trim(), notes: [] });
    else if (n && stickies.length) stickies[stickies.length - 1].notes.push(n[1].trim());
  }
  for (const s of stickies) {
    const item = items.find((it) => new RegExp(`\\b${it.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(s.title));
    const where = item ? `${place}#${item.id}` : place;
    const shown = s.notes.map((n) => /^shown (.+?) · (every .+|when I press)$/.exec(n)).find(Boolean);
    const cadence = shown && /^every/.test(shown[2]) ? shown[2] : /\bevery (day|week|month|morning|evening|night|\w+day)\b/i.exec(s.title)?.[0];
    let asked: number | null = null;
    for (const n of s.notes) {
      if (/^asked\b/i.test(n)) { asked = stampAt(n, now); continue; }
      const d = /^did:?\s*(.*)$/i.exec(n);
      if (!d) continue;
      const at = asked ?? stampAt(d[1], now) ?? now;
      out.push({
        id: idOf(where, s.title, d[1], at), place: where, at, sources: sourcesIn(d[1]), made: madeOf(d[1]), steps: stepsOf(d[1]),
        minutes: minutesIn(d[1]), ...(dateIn(s.title, at) ? { date: dateIn(s.title, at) } : {}), ...(cadence ? { cadence } : {}),
        text: `${s.title}: ${d[1]}`, from: "did",
      });
      asked = null;
    }
    if (shown) {
      const steps = s.notes.filter((n) => /^step:/.test(n)).map((n) => n.replace(/^step:\s*/, ""));
      const at = stampAt(shown[1], now) ?? now;
      const urls = steps.flatMap((x) => [...x.matchAll(/https?:\/\/([^/\s]+)/g)].map((m) => m[1]));
      out.push({ id: idOf(where, s.title, "shown", at), place: where, at, sources: [...new Set(urls)], made: madeOf(s.title), steps, minutes: null, ...(cadence ? { cadence } : {}), text: `${s.title}: shown once`, from: "shown" });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the store

export const tracesFile = (home: string) => join(home, "agents-traces.json");
export function loadTraces(home: string): TraceFile {
  try {
    const j = JSON.parse(readFileSync(tracesFile(home), "utf8"));
    return { v: 1, traces: Array.isArray(j?.traces) ? j.traces : [], pairs: j?.pairs && typeof j.pairs === "object" ? j.pairs : {} };
  } catch { return { v: 1, traces: [], pairs: {} }; }
}
export function saveTraces(home: string, f: TraceFile) {
  const file = tracesFile(home), tmp = `${file}.${process.pid}.tmp`;
  const traces = [...f.traces].sort((a, b) => a.at - b.at).slice(-KEEP), keep = new Set(traces.map((t) => t.id));
  const pairs = Object.fromEntries(Object.entries(f.pairs).filter(([k]) => k.split("|").every((id) => keep.has(id) || !id.startsWith("t-"))));
  writeFileSync(tmp, JSON.stringify({ v: 1, traces, pairs }, null, 1) + "\n");
  renameSync(tmp, file);
}

/** read every place's stickies.md into the store; returns the store and how many traces are new */
export function collect(home: string, places: Place[], now: number): { file: TraceFile; fresh: number } {
  const file = loadTraces(home), have = new Set(file.traces.map((t) => t.id));
  let fresh = 0;
  for (const p of places) {
    if (p.item) continue;
    let text = "";
    try { text = readFileSync(join(home, p.folder, "stickies.md"), "utf8"); } catch { continue; }
    const items = places.filter((x) => x.item && x.parent === p.id).map((x) => ({ id: x.item!.id, name: x.name }));
    for (const t of tracesIn(text, p.id, now, items)) if (!have.has(t.id)) { file.traces.push(t); have.add(t.id); fresh++; }
  }
  if (fresh) saveTraces(home, file);
  return { file, fresh };
}
/** an answered ask, handed in by whoever heard it (a chat ask the person answered, a "show me once") */
export function recordAsk(home: string, t: Omit<Trace, "id" | "from">): Trace {
  const file = loadTraces(home);
  const full: Trace = { ...t, id: idOf(t.place, t.text, t.at), from: "ask" };
  if (!file.traces.some((x) => x.id === full.id)) { file.traces.push(full); saveTraces(home, file); }
  return full;
}
