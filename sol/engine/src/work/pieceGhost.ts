// The ghost row (#1092, the designer's NOW 3 of 05:14, JEV 5 and 7): a status question he keeps asking in this folder's
// sessions ("how are the cowork bugs") is a tool nobody made yet. Decided on this machine, never sent anywhere (tonight's
// rule for Jev: shapes, kinds, ids, counts, titles; never the text of a prompt; the lead's 05:54): a line of his is a
// status question by its words ("how are", "what's the status of", "where are"); asked twice or more today it is one he
// keeps asking; the folder's source whose words cover its name answers it. Every word covered: the folder's "new
// piece" row reads "make: cowork bugs" and the bench opens with that source (and its area and kind) pressed. Some
// words: the plain row; the bench's pill wears a dashed rim. Nothing: the plain "new piece".
import { readFileSync, statSync } from "node:fs";
import type { Source } from "./pieceBench.js";

export type Ghost = { name: string; reads: string; parts?: Record<string, string>; asked: string; tier: "acts" | "ghost" };

const cut = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const STOP = new Set(["how", "are", "is", "the", "what", "whats", "what's", "where", "did", "do", "does", "our", "my", "we", "us", "any", "of", "on", "with", "going", "doing", "today", "now", "status", "update", "check", "show", "me", "tell", "about", "a", "an", "and", "it", "they", "there", "this", "that", "so", "far", "please", "can", "you", "again", "look", "at", "in", "for", "to"]);

/** what he typed in one transcript: his own lines, short ones (a status question is short), no injected text (pure) */
export function typedIn(jsonl: string, since: number): string[] {
  return typedAt(jsonl, since).map((x) => x.t);
}
/** the same, each with when he typed it (a line with no time counts as now), so lines from many sessions sort (pure) */
export function typedAt(jsonl: string, since: number): { t: string; at: number }[] {
  const out: { t: string; at: number }[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.includes('"type":"user"')) continue;
    let e: { type?: string; isMeta?: boolean; timestamp?: string; message?: { content?: unknown } };
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "user" || e.isMeta) continue;
    if (e.timestamp && Date.parse(e.timestamp) < since) continue;
    const c = e.message?.content;
    const t = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x && typeof x === "object" && (x as { type?: string }).type === "text" ? String((x as { text?: unknown }).text ?? "") : "")).join(" ") : "";
    const s = t.trim();
    if (!s || s.startsWith("<") || s.length > 160 || /CLAUDE\.md|AGENTS\.md/.test(s)) continue;
    out.push({ t: cut(s, 160), at: e.timestamp ? Date.parse(e.timestamp) : Date.now() });
  }
  return out;
}

/** the tool's name from his question: its last words that are not asking words ("how are the releases" → "releases") (pure) */
export function nameFrom(q: string): string {
  const w = q.toLowerCase().replace(/[^a-z0-9 -]+/g, " ").split(/\s+/).filter((x) => x && !STOP.has(x));
  return w.slice(-2).join(" ").slice(0, 24);
}

/** a status question's name, or null: the line asks how something stands (pure) */
export function statusName(line: string): string | null {
  if (!/^\s*(how(['’]s| is| are)\b|what(['’]s| is) the status\b|status of\b|where (are|is)\b|any news on\b|what(['’]s| is) (up with|new (in|on|with))\b)/i.test(line)) return null;
  return nameFrom(line) || null;
}
const stem = (w: string) => w.toLowerCase().replace(/(ies)$/, "y").replace(/s$/, "");
/** which source answers a name, and how fully (pure): issues by its area and kind options, then each source's word */
export function sourceFor(name: string, sources: Source[]): { reads: string; parts?: Record<string, string>; covered: number } | null {
  const words = name.split(/\s+/).filter(Boolean).map(stem);
  if (!words.length) return null;
  let best: { reads: string; parts?: Record<string, string>; covered: number } | null = null;
  for (const s of sources) {
    if (s.asks) continue;
    const parts: Record<string, string> = {};
    let hit = 0;
    for (const w of words) {
      const part = (s.parts ?? []).find((p) => p.options.some((o) => stem(o) === w));
      if (part) { parts[part.label] = part.options.find((o) => stem(o) === w)!; hit++; continue; }
      if (s.word.toLowerCase().split(/[\s.]+/).map(stem).includes(w) || (w === "pr" && s.id === "prs")) hit++;
    }
    const covered = hit / words.length;
    if (hit && (!best || covered > best.covered)) best = { reads: s.id, ...(Object.keys(parts).length ? { parts } : {}), covered };
  }
  return best;
}
/** the ghost from his lines of the day, newest last (pure): the status question he asked most (twice at least), and
 *  the source that answers it */
export function ghostFrom(lines: string[], sources: Source[], made: string[] = []): Ghost | null {
  // a question a piece of the folder already answers (its title holds every word of the name) is not offered again
  const has = (n: string) => made.some((t) => n.split(/\s+/).map(stem).every((w) => t.toLowerCase().split(/[^a-z0-9]+/).map(stem).includes(w)));
  const asked = new Map<string, { n: number; last: string }>();
  for (const l of lines) { const n = statusName(l); if (n && !has(n)) asked.set(n, { n: (asked.get(n)?.n ?? 0) + 1, last: l }); }
  const top = [...asked.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n)[0];
  if (!top) return null;
  const src = sourceFor(top[0], sources);
  if (!src) return null;
  return { name: top[0], reads: src.reads, ...(src.parts ? { parts: src.parts } : {}), asked: top[1].last, tier: src.covered >= 1 ? "acts" : "ghost" };
}

// worked out at most every ten minutes per folder: cheap, and a question he asks again is seen within the hour
const cache = new Map<string, { at: number; g: Ghost | null }>();

/** the folder's ghost: his lines in its sessions of the last day, its sources; worked out here, never sent */
export async function ghostFor(cwd: string, sources: Source[], transcripts: () => Promise<string[]>, made: string[] = []): Promise<Ghost | null> {
  const c = cache.get(cwd);
  if (c && Date.now() - c.at < 10 * 60_000) return c.g;
  const since = Date.now() - 86_400_000, lines: { t: string; at: number }[] = [];
  for (const f of await transcripts().catch(() => [] as string[])) {
    try {
      if (statSync(f).mtimeMs < since) continue;
      // the tail only: a long session's last 400 KB
      const text = readFileSync(f, "utf8");
      lines.push(...typedAt(text.length > 400_000 ? text.slice(-400_000) : text, since));
    } catch { /* gone */ }
  }
  // nothing typed yet: asked again at the next look
  if (!lines.length) return null;
  const g = ghostFrom(lines.sort((a, b) => a.at - b.at).map((x) => x.t), sources, made);
  cache.set(cwd, { at: Date.now(), g });
  return g;
}
