// The sessions card's reading (sideAll.tsx, 2026-11-11, Marco: "clear interpretation in layman's terms so any user could
// clearly read and understand what each session did"): a session said in plain words, from what the face already holds.
// The list gives a title, a state, times, who started it; the thread (read on a press, work.peek) gives what was asked
// and the last wrap-up's recap, else the last thing it said. Nothing here invents: what is not known is not said.
// A stored one-line recap per session, so the list reads without a press, is the engine's half (sol-mif/sol-dev #1066).
// Pure, so it is tested (src/side-read.test.ts).
import type { St } from "./sideRows";

const MAX = 72;          // a title longer than this is cut at a pause in it (a comma, a colon, a dash), else at a word
const KEEP = 56;         // a title this short, with no prompt shape, is the person's own: kept as written
const PROMPT = /^(#+\s|>\s|[-*]\s|you\s|please\s|hi\b|hey\b)/i;

/** a session's title made readable: a first prompt ("# Step 5: the folders' agents (one builder, NucBox…", "You are
 *  builder D of pass 4 … in this folder: /home/…") becomes its first plain clause; a title the person gave is kept */
export function plainTitle(raw: string): string {
  const one = (raw ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (one.length <= KEEP && !PROMPT.test(one)) return one.replace(/\s+/g, " ");
  let t = one.replace(/\s+/g, " ")
    .replace(/^(#+|>|[-*])\s*/, "")
    .replace(/(`+|\*\*|__)(.+?)\1/g, "$2")
    .replace(/\s*\([^()]*\)/g, "")              // asides in brackets: "(issue #1054)", "(one builder, NucBox)"
    .replace(/\s*\([^)]*$/, "")                 // and one the cut left open
    .replace(/\s+(~|\/)[^\s,;]*\/[^\s,;]*/g, "") // paths
    .replace(/…$/, "")
    .replace(/^(please|hi|hey)[,!]?\s+/i, "");
  const are = t.match(/^you are (an? |the )?/i), you = t.match(/^you (?=\w)/i);
  if (are) t = cap(t.slice(are[0].length)); else if (you) t = cap(t.slice(you[0].length));
  const end = t.search(/[.?!](\s|$)/);
  if (end > 0) t = t.slice(0, end);
  if (t.length > MAX) {
    const head = t.slice(0, MAX), pause = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "), head.lastIndexOf(" — "), head.lastIndexOf(" - "));
    t = pause >= 24 ? t.slice(0, pause) : head.slice(0, head.lastIndexOf(" ") > 24 ? head.lastIndexOf(" ") : MAX) + "…";
  }
  return t.replace(/[\s,:;—-]+$/, "").trim() || one.slice(0, MAX);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** a time as a person says it: just now, 4 min ago, 3 hours ago, yesterday, 3 days ago, on Oct 31 */
export function ago(t: number, now = Date.now()): string {
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "an hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return `on ${new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
/** how long a stretch of work has gone on: under a minute, 12 min, 2 hours */
export const span = (since: number, now = Date.now()) => {
  const m = Math.floor((now - since) / 60_000);
  return m < 1 ? "under a minute" : m < 60 ? `${m} min` : Math.floor(m / 60) === 1 ? "an hour" : `${Math.floor(m / 60)} hours`;
};

/** where a session stands, in one plain line */
export function standing(st: St, s: { updatedAt: number; archived?: boolean; pinned?: boolean }, since?: number, now = Date.now()): string {
  const at = ago(s.updatedAt, now);
  const line = st === "needs" ? "Waiting for your answer"
    : st === "running" ? (since ? `Working on it, for ${span(since, now)}` : "Working on it now")
    : st === "failed" ? `Stopped with an error ${at}`
    : st === "unread" ? `Finished ${at}, not seen yet`
    : st === "done" ? `Done ${at}`
    : `Last used ${at}`;
  return [s.archived ? "Put away" : "", s.archived ? line.charAt(0).toLowerCase() + line.slice(1) : line].filter(Boolean).join(" · ") + (s.pinned ? " · pinned" : "");
}

/** markdown and machine tags out of a line read aloud: **bold**, `code`, # heads, list dashes, <room-content …> */
const plain = (v: string) => v
  .replace(/<\/?[a-z][\w-]*(\s[^>]*)?>/gi, " ").replace(/(\*\*|__|`+)/g, "")
  .replace(/(^|\n)\s*(#+|[-*]|\d+\.)\s+/g, "$1").replace(/\s+/g, " ").trim();

export type Said = { kind: string; text?: unknown; recap?: unknown; parent?: unknown };
/** what a session's thread says of it: the first thing asked, the last wrap-up's recap, the last thing it said */
export function readOf(items: Said[] | undefined): { asked?: string; did?: string; said?: string } {
  if (!items) return {};
  const str = (v: unknown) => (typeof v === "string" ? plain(v) : "");
  const asked = items.find((i) => i.kind === "me" && !i.parent && str(i.text));
  let did = "", said = "";
  for (let i = items.length - 1; i >= 0 && (!did || !said); i--) {
    const x = items[i];
    if (!did && x.kind === "wrap") did = str(x.recap);
    if (!said && x.kind === "you" && !x.parent) said = str(x.text);
  }
  return { ...(asked ? { asked: str(asked.text).replace(/^#+\s*/, "").slice(0, 600) } : {}), ...(did ? { did: did.slice(0, 600) } : {}), ...(said ? { said: said.slice(0, 600) } : {}) };
}

/** folders that share a name are told apart by the folder they sit in ("base", in tour4 · "base", in tour3) */
export function twins(keys: string[], nameOf: (k: string) => string): Map<string, string> {
  const by = new Map<string, string[]>();
  for (const k of keys) by.set(nameOf(k), [...(by.get(nameOf(k)) ?? []), k]);
  const out = new Map<string, string>();
  for (const ks of by.values()) {
    if (ks.length < 2) continue;
    for (const k of ks) { const parts = k.replace(/\/+$/, "").split("/"); out.set(k, `in ${parts[parts.length - 2] || "/"}`); }
  }
  return out;
}

/** a path as the person reads it: their home as ~ */
export const homePath = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, "~");
