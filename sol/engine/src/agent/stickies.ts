// A folder's stickies, kept by the engine (#1228): the one store is the folder's stickies.md, a file a person reads and
// edits by hand as well. Every change a face asks for (make, edit, remove and its undo, done, keep, note) and the press
// are done here, on the file as it is now, so the agent's own "did:" line written meanwhile is never lost.
//   - [ ] Outline offer and acceptance — the elements, one case each
//     - asked Nov 10 19:40 ← now
//     - did: made/2026-11-10-offer.md, one page
// `- [x]` is done. After " — ": what it asks. The indented lines: what was asked and what the folder's agent did.
// A press marks "← now" on the one pressed, puts the stickies rule into policy.md if it is missing, and runs it.
// A removed sticky is kept in .agent/removed-stickies.json for a day (the last 20), so its undo works after a restart.
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { Trust } from "./meta/when.js";
import { gateOf } from "./meta/reachRead.js";

export type Sticky = { done: boolean; t: string; s: string; notes: string[] };
export type Removed = { id: string; at: number; i: number; item: Sticky };

export const FILE = "stickies.md";
/** the Sol home's folder for what is in no place yet (#1483), made the first time a sticky goes there (#1511) */
export const LOOSE = "loose";
/** why a place's stickies could not be reached, in a Sol user's words (never a path) */
export const NO_PLACE = "this place is not in your Sol any more, so Sol could not keep it there";
export const NOW = " ← now";
export const UNDO_MS = 24 * 3600_000;
export const HEAD = (name: string) => `# ${name} · your stickies

Made by you in Home, one per line: \`- [ ]\` open, \`- [x]\` done; after " — " what it asks. Under each, what was asked
and what the folder's agent did. Home and this file are the same list: edit either.
`;
/** the rule a press runs, when a folder's policy.md has none (the one onboarding writes its own, with a rung) */
export const STICKY_RULE = `- [watch] stickies: when I press a sticky in Home, do what the sticky marked "← now" in stickies.md asks, inside this folder; then under it write one line "- did: what you made, with its file names" and take the "← now" mark off; leave its box as it is: the person ticks it done.`;
const RULE_LINE = /^\s*[-*]\s+\[[a-z, ]+\]\s+stickies\s*:/i;

const ITEM = /^- \[( |x|X)\]\s+(.*)$/, NOTE = /^\s{2,}- (.*)$/;
/** stickies.md read (pure): the head as written, then each sticky with its notes */
export function parse(text: string): { head: string; items: Sticky[] } {
  const head: string[] = [], items: Sticky[] = [];
  for (const line of text.split("\n")) {
    const m = ITEM.exec(line), n = NOTE.exec(line);
    if (m) { const [t, ...s] = m[2].split(" — "); items.push({ done: m[1] !== " ", t: t.trim(), s: s.join(" — ").trim(), notes: [] }); }
    else if (n && items.length) items[items.length - 1].notes.push(n[1].trim());
    else if (!items.length) head.push(line);
  }
  return { head: head.join("\n").replace(/\n+$/, "\n"), items };
}
/** stickies.md written (pure): the head kept, one line per sticky, its notes under it */
export function serialize(head: string, items: Sticky[]): string {
  const body = items.map((i) => [`- [${i.done ? "x" : " "}] ${i.t}${i.s ? ` — ${i.s}` : ""}`, ...i.notes.map((n) => `  - ${n}`)].join("\n")).join("\n");
  return `${head.replace(/\n+$/, "")}\n\n${body}${body ? "\n" : ""}`;
}
export const stamp = (d = new Date()) => `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toTimeString().slice(0, 5)}`;
/** the title as a key: the "← now" a hand or an older Home left on it does not count */
export const keyOf = (t: string) => t.replace(/\s*← now\s*$/, "").trim();
const at = (l: Sticky[], key: string) => l.findIndex((m) => keyOf(m.t) === keyOf(key));
const oneLine = (x: unknown, max = 300) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ---- the pure changes (each returns the new list, or a reason in words) ----
export type Change = { items: Sticky[] } | { why: string };
// When one is due (Today, #1487): a note "due: 2026-11-20 18:00" under it, the person's own clock; a hand or an agent
// writes the same line. The face reads the words ("by Friday", "tonight") and sends the time; the engine only keeps it.
export const DUE = /^due:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*$/i;
const dueLine = (due: string) => `due: ${due}`;
export function make(l: Sticky[], line: string, due?: string | null): Change & { key?: string } {
  const [t0, ...s] = oneLine(line).split(" — "), t = keyOf(t0), sx = s.join(" — ").trim();
  if (!t) return { why: "a sticky needs a few words" };
  if (at(l, t) >= 0) return { why: `there is already a sticky "${t}" here` };
  if (due && !DUE.test(dueLine(due))) return { why: "a due is a day and a time, 2026-11-20 18:00" };
  return { items: [...l, { done: false, t, s: sx, notes: due ? [dueLine(due)] : [] }], key: t };
}
/** its due set (a day and a time) or taken off (null); any due line it had is replaced */
export function withDue(l: Sticky[], key: string, due: string | null): Change {
  const i = at(l, key);
  if (i < 0) return { why: "that sticky is not there any more" };
  if (due && !DUE.test(dueLine(due))) return { why: "a due is a day and a time, 2026-11-20 18:00" };
  return { items: l.map((m, k) => (k === i ? { ...m, notes: [...(due ? [dueLine(due)] : []), ...m.notes.filter((n) => !DUE.test(n))] } : m)) };
}
export function edit(l: Sticky[], key: string, t: string, s: string): Change {
  const i = at(l, key), nt = keyOf(oneLine(t));
  if (i < 0) return { why: "that sticky is not there any more" };
  if (!nt) return { why: "a sticky needs a few words" };
  if (keyOf(nt) !== keyOf(key) && at(l, nt) >= 0) return { why: `there is already a sticky "${nt}" here` };
  return { items: l.map((m, k) => (k === i ? { ...m, t: nt, s: oneLine(s) } : m)) };
}
export function done(l: Sticky[], key: string, d: boolean): Change {
  const i = at(l, key);
  return i < 0 ? { why: "that sticky is not there any more" } : { items: l.map((m, k) => (k === i ? { ...m, done: d } : m)) };
}
// The trust gate (#1497): how far a press goes is read from the sticky's words (reachOfAsk, Agents' own rule, with the
// person's cheapest Claude reading them in any language: meta/reachRead.ts) and written into its asked line, so every folder's run reads it whatever its policy.md says. What comes back from a draft or an
// ask is a "did: draft: …" or "did: ask: …" line: Home shows it whole and waits for the person's act (Send, Pay), and
// that act is a press with `yes`: the one step, after which the engine ticks the sticky done.
export type Reach = Exclude<Trust, "looks">;
/** the words the gate reads: its title and what it asks */
export const wordsOf = (m: Pick<Sticky, "t" | "s">) => `${keyOf(m.t)} ${m.s}`.trim();
/** its reach: `read` a model's reading of wordsOf (null: none, and then words the rules cannot read ask) */
export const reachOfSticky = (m: Pick<Sticky, "t" | "s">, read: Reach | null = null) => gateOf(wordsOf(m), read);
/** a made thing that waits on the person: a did: draft: or did: ask: line */
export const WAITS = /^did:\s*(draft|ask):/i;
/** what the asked line adds for a press: nothing for the person's own, the gate's words for the rest; a yes names its step */
export function gateWords(reach: Reach, yes?: string): string {
  if (yes) return ` · yes: do this one step now and nothing more, "${oneLine(yes.replace(/^did:\s*(draft|ask):\s*/i, ""), 200)}"; then write "did: …" for what you did`;
  if (reach === "drafts") return ` · drafts: make it ready to send and never send it; write "did: draft: …" with its file`;
  if (reach === "asks") return ` · asks: make it ready and stop before any payment, submission or deletion; write "did: ask: what you would do, with its file"`;
  return "";
}
/** the pressed one marked "asked <when>[ · the gate] ← now", the mark taken off every other (and off any title) */
export function mark(l: Sticky[], key: string, when = stamp(), gate = ""): Change {
  if (at(l, key) < 0) return { why: "that sticky is not there any more" };
  return { items: l.map((m) => ({ ...m, t: keyOf(m.t), notes: [...m.notes.map((n) => n.replace(NOW, "")), ...(keyOf(m.t) === keyOf(key) ? [`asked ${when}${gate}${NOW}`] : [])] })) };
}
/** may a yes be pressed on this sticky: the line must be one of its did: draft: or did: ask: lines, as written */
export function yesFits(l: Sticky[], key: string, yes: string): boolean {
  const m = l[at(l, key)];
  return !!m && !m.done && WAITS.test(yes) && m.notes.includes(yes.trim());
}
/** after a run: the mark off where the agent left it; a "did:" line written for it when the agent wrote none */
export function settle(l: Sticky[], key: string, did?: string): Sticky[] {
  return l.map((m) => {
    if (keyOf(m.t) !== keyOf(key)) return { ...m, notes: m.notes.map((n) => n.replace(NOW, "")) };
    const notes = m.notes.map((n) => n.replace(NOW, ""));
    const asked = notes.map((n) => /^asked\b/i.test(n)).lastIndexOf(true);
    const hasDid = notes.slice(asked + 1).some((n) => /^did\b/i.test(n));
    return { ...m, t: keyOf(m.t), notes: hasDid || !did ? notes : [...notes, `did: ${oneLine(did, 200)}`] };
  });
}
/** a whole sticky with its notes (a shown one, showOnce): one of the same title is replaced in its place */
export function keep(l: Sticky[], m: Sticky): Sticky[] {
  const i = at(l, m.t), x = { done: !!m.done, t: keyOf(oneLine(m.t)), s: oneLine(m.s), notes: (m.notes ?? []).map((n) => oneLine(n)) };
  return i < 0 ? [...l, x] : l.map((y, k) => (k === i ? x : y));
}

// ---- the file ----
function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
export function read(folder: string): { head: string; items: Sticky[] } {
  let text: string | null = null;
  try { text = readFileSync(join(folder, FILE), "utf8"); } catch { /* none yet */ }
  return text === null ? { head: HEAD(basename(folder)), items: [] } : parse(text);
}
/** one change over the file as it is now (read, changed, written at once: the engine is the one writer in-process) */
export function change(folder: string, f: (l: Sticky[]) => Change): Change {
  const { head, items } = read(folder);
  const r = f(items);
  if ("items" in r) writeAtomic(join(folder, FILE), serialize(head, r.items));
  return r;
}

const removedFile = (folder: string) => join(folder, ".agent", "removed-stickies.json");
export function removedOf(folder: string, now = Date.now()): Removed[] {
  try { return (JSON.parse(readFileSync(removedFile(folder), "utf8")) as Removed[]).filter((r) => now - r.at < UNDO_MS); } catch { return []; }
}
/** removed, and kept for its undo: the id to undo it by */
export function remove(folder: string, key: string, now = Date.now()): { id: string; items: Sticky[] } | { why: string } {
  let gone: Removed | null = null;
  const r = change(folder, (l) => {
    const i = at(l, key);
    if (i < 0) return { why: "that sticky is not there any more" };
    if (l[i].notes.some((n) => n.endsWith(NOW))) return { why: "its agent is working on it; remove it when the run ends" };
    gone = { id: `r-${now}-${randomBytes(2).toString("hex")}`, at: now, i, item: l[i] };
    return { items: l.filter((_, k) => k !== i) };
  });
  if ("why" in r || !gone) return "why" in r ? r : { why: "not removed" };
  mkdirSync(join(folder, ".agent"), { recursive: true });
  writeAtomic(removedFile(folder), JSON.stringify([...removedOf(folder, now), gone].slice(-20)));
  return { id: (gone as Removed).id, items: r.items };
}
/** a removed sticky back where it was (or at the end); refused when one of its title was made meanwhile */
export function undo(folder: string, id: string, now = Date.now()): Change {
  const kept = removedOf(folder, now), g = kept.find((r) => r.id === id);
  if (!g) return { why: "that one is too old to bring back" };
  const r = change(folder, (l) => (at(l, g.item.t) >= 0 ? { why: `there is already a sticky "${g.item.t}" here` } : { items: [...l.slice(0, g.i), g.item, ...l.slice(g.i)] }));
  if ("items" in r) writeAtomic(removedFile(folder), JSON.stringify(kept.filter((x) => x.id !== id)));
  return r;
}

/** policy.md has a stickies rule: the one there is kept as written (its rung is the person's level); one added if none.
 *  null: no policy.md, so no agent in this folder */
export function ensureRule(folder: string): boolean | null {
  const p = join(folder, "policy.md");
  let text: string;
  try { text = readFileSync(p, "utf8"); } catch { return null; }
  if (text.split("\n").some((l) => RULE_LINE.test(l))) return true;
  writeAtomic(p, `${text.replace(/\n+$/, "")}\n\n${STICKY_RULE}\n`);
  return true;
}

/** a folder named by a face: its path under the home (school/la245, ./work), or an absolute path inside the home; the
 *  folder must exist. Never a path outside the home */
export function dirIn(home: string, name: string): string | null {
  const n = String(name ?? "").trim();
  if (!n) return null;
  // real paths on both sides: the face names the home as the shell has it ($SOL_HOME), the engine by its real path
  const real = (x: string) => { try { return realpathSync(x); } catch { return null; } };
  const h = real(home) ?? resolve(home), p = real(n.startsWith("/") ? n : resolve(h, n.replace(/^\.\//, "")));
  if (!p) return null;
  const rel = relative(h, p);
  if (!rel || rel.startsWith("..") || rel.startsWith("/")) return null;
  try { return statSync(p).isDirectory() ? p : null; } catch { return null; }
}
export const hasAgent = (folder: string) => existsSync(join(folder, "policy.md"));
