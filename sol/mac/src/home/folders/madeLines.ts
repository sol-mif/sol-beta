// What was made (#1490 "See what was made"). A made thing is one `did:` line under a sticky:
// what Sol or the place's agent made for it, written by the run (STICKY_RULE: "did: what you made, with its file names").
// Nothing new is kept for it: the line is the thing, so a hand or an agent writing one makes one. Here, pure: each line
// read as a card (its title, its one line, the file it names, when), every place's gathered newest first by day, and
// "new" (made in the last two days and not opened yet; opened ones are remembered on this computer only).
import { DAY } from "./due.ts";

type One = { done: boolean; t: string; notes: string[] };
export type MadeThing = {
  /** the place's id (its folder under the home), the sticky it was for, its did: line as written: together, its key */
  place: string; sticky: string; did: string; key: string;
  /** the card's words: the file's name, else the line's first part; then the rest */
  t: string; line: string;
  /** the file it names, as written (made/2026-11-18-week.md), relative to the place's folder */
  file?: string;
  /** when it was made: the "asked" line before it (the run starts at the press), null when none says */
  at: number | null;
  /** the sticky is still open: the card is clipped under it; else it waits in the place's made pile */
  open: boolean;
  /** the trust gate (#1497): a draft (it reaches someone) or an ask (money, a submission, a deletion) Sol made ready and
   *  did not do; `act` is the one word that does it (Send, Pay …), the person's yes */
  waits?: "draft" | "ask"; act?: string;
  /** it waits on the person now: a draft or an ask, the newest made for a sticky still open */
  waiting: boolean;
};

const FILE = /(?:^|[\s(,])((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,8})(?=$|[\s),;·])/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ASKED = /^asked (\w{3})\w* (\d{1,2}) (\d{1,2}):(\d{2})/i;

/** an "asked Nov 13 18:10" line's time (stickies.ts stamp: no year; a date ahead of now is last year's) */
export function askedAt(note: string, now = Date.now()): number | null {
  const m = ASKED.exec(note.trim());
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1].toLowerCase());
  if (mo < 0) return null;
  const y = new Date(now).getFullYear();
  let t = new Date(y, mo, +m[2], +m[3], +m[4]).getTime();
  if (t > now + DAY) t = new Date(y - 1, mo, +m[2], +m[3], +m[4]).getTime();
  return t;
}

/** one did: line as a card: "did: 9 bakes counted into made/sat-bake.md · 6 boxes set aside · read: x · 25 min" →
 *  t "sat-bake.md", line "9 bakes counted · 6 boxes set aside"; the run's own bookkeeping (read: …, minutes) left out */
export function cardOf(did: string): { t: string; line: string; file?: string } {
  const body = did.replace(/^did:?\s*/i, "").replace(WAIT, "").replace(/`/g, "").trim();
  const parts = body.split(/\s+·\s+/).map((p) => p.trim()).filter((p) => p && !/^read:/i.test(p) && !/^\d+\s*(min|m|s|h)$/i.test(p));
  const f = FILE.exec(body)?.[1];
  if (f) {
    const name = f.split("/").pop()!.replace(/^\d{4}-\d\d-\d\d-/, "");
    const rest = parts.map((p) => p.replace(f, "").replace(/\s+(into|in|to|as)\s*(?=[,;]|$)/i, "").replace(/^[,;\s]+|[,;\s]+$/g, "").replace(/\s+([,;])/g, "$1").trim()).filter(Boolean);
    return { t: name, line: rest.join(" · "), file: f };
  }
  return { t: parts[0] ?? body, line: parts.slice(1).join(" · ") };
}

// The trust gate (#1497): a run Sol was not to finish writes "did: draft: …" (it reaches someone: the person sends) or
// "did: ask: …" (money, a submission or a deletion: the person says yes). The engine's agent.press with `yes` runs it.
const WAIT = /^(draft|ask):\s*/i;
/** a waiting one's act, in one word, from the sticky's words and the line: what the person's press will do */
export function actOf(waits: "draft" | "ask", words: string): string {
  if (waits === "ask") return /\b(pay|payment|transfer|buy|order|fees?|top up)\b|[$€£¥]\s?\d/i.test(words) ? "Pay" : /\b(delete|remove|trash|cancel)\b/i.test(words) ? "Delete" : /\b(submit|apply|hand in|file)\b/i.test(words) ? "Submit" : "Go ahead";
  return /\b(book|reserve)\b/i.test(words) ? "Book" : /\b(post|share)\b/i.test(words) ? "Post" : "Send";
}
/** a place's made things, each did: line once, newest first */
export function madeIn<M extends One>(place: string, items: readonly M[], now = Date.now()): MadeThing[] {
  const out: MadeThing[] = [];
  for (const m of items) {
    let at: number | null = null;
    const dids = m.notes.filter((n) => /^did\b/i.test(n)), newest = dids[dids.length - 1];
    for (const n of m.notes) {
      const a = askedAt(n, now);
      if (a !== null) { at = a; continue; }
      if (!/^did\b/i.test(n)) continue;
      const w = WAIT.exec(n.replace(/^did:?\s*/i, ""))?.[1].toLowerCase() as "draft" | "ask" | undefined;
      out.push({ place, sticky: m.t, did: n, key: `${place}\n${m.t}\n${n}`, ...cardOf(n), at, open: !m.done,
        ...(w ? { waits: w, act: actOf(w, `${m.t} ${n}`) } : {}), waiting: !!w && !m.done && n === newest });
    }
  }
  return byNewest(out);
}
/** what waits on the person, from every place: Today shows these beside what is due */
export const waitingOf = (l: readonly MadeThing[]) => l.filter((x) => x.waiting);
const byNewest = (l: MadeThing[]) => l.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

/** every place's, newest first */
export const allMade = <M extends One>(lists: readonly { place: string; items: readonly M[] }[], now = Date.now()) =>
  byNewest(lists.flatMap((l) => madeIn(l.place, l.items, now)));

/** new: made within two days and not opened yet. A made thing with no time is never new (an old line read again) */
export const NEW_FOR = 2 * DAY;
export const isNew = (x: MadeThing, seen: ReadonlySet<string>, now = Date.now()) => x.at !== null && now - x.at <= NEW_FOR && !seen.has(x.key);

const dayOf = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** the made row's groups: today, yesterday, earlier (one with no time is earlier) */
export function byDay(l: readonly MadeThing[], now = Date.now()): { day: "today" | "yesterday" | "earlier"; items: MadeThing[] }[] {
  const g = { today: [] as MadeThing[], yesterday: [] as MadeThing[], earlier: [] as MadeThing[] };
  for (const x of l) { const d = x.at === null ? 2 : Math.round((dayOf(now) - dayOf(x.at)) / DAY); (d <= 0 ? g.today : d === 1 ? g.yesterday : g.earlier).push(x); }
  return (["today", "yesterday", "earlier"] as const).filter((k) => g[k].length).map((day) => ({ day, items: g[day] }));
}
/** the card's small time: 18:10 today, "yesterday", else Nov 13 */
export function madeWhen(at: number | null, now = Date.now()): string {
  if (at === null) return "";
  const d = Math.round((dayOf(now) - dayOf(at)) / DAY), x = new Date(at);
  if (d <= 0) return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
  if (d === 1) return "yesterday";
  return x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// opened ones, on this computer (a made thing is the person's to have looked at, nobody else's; nothing leaves the Mac)
const SEEN = "sol.home.made.seen";
export function readSeen(): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(SEEN) ?? "[]"); return new Set(Array.isArray(v) ? v.map(String) : []); } catch { return new Set(); }
}
export function markSeen(key: string): Set<string> {
  const s = readSeen(); s.add(key);
  try { localStorage.setItem(SEEN, JSON.stringify([...s].slice(-500))); } catch { /* private window: new again next time */ }
  return s;
}
