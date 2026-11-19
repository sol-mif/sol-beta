// The clock (#1177): everything coming in, each with its ETA, checked by itself. Marco, 2026-11-14: "a clock with
// everything coming in and the ETAs; when the clock reaches an ETA an autocheck runs so everything stays on schedule";
// and at 15:00: "not an html but plugins or tools dedicated to the stage". So: a record the engine keeps, a stage kind
// that draws it (sol/mac/src/stage/kinds/Clock.tsx), a part that checks it (parts/clock.ts), and three tools a session
// changes it with. It replaces the sketch on marco/mine (mine/look/cowork/clock.html + clock-check.sh).
//
//   the record   <STATE_DIR>/clock.json  { items: [Item] }   the person's own, beside work.json (never in a checkout:
//                                                           a write there dirtied one nobody touched, #1156)
//   an item      { id, title, owner, machine, eta (ms), kind: pr|unit|release|yes, ref, detail,
//                  state: building|ci|green|red|done|waiting, late, checked?, moves: [{ at, from, to, why }] }
//   the switch   off unless SOL_CLOCK_ON=on, or the person already keeps a clock (its record is there); SOL_CLOCK_ON=off
//                wins (#1274). Off: no check, no timer, the three tools not given, compose refuses a clock
//   the check    every 10 minutes while an item is not done, and at once when an ETA passes (parts/clock.ts): a pr reads the PR's state and its
//                branch's latest full `ci` run (gh); a unit reads systemctl --user on its machine (ssh when not this one;
//                "unreachable" when that fails, its state kept); a release reads the words every Sol said (/runs): done
//                once one runs ref or newer; a yes waits for clock_done. late = past its ETA and not done.
//   the face     told over the link, `clock.items` to every face whenever the record or a check changes it; a block
//                asks once with `clock.get`. The face never polls.
// The checks are injected (Probe), so the state rules below are pure and tested (test/clock.test.ts).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export const KINDS = ["pr", "unit", "release", "yes"] as const;
export type ItemKind = (typeof KINDS)[number];
export const STATES = ["building", "ci", "green", "red", "done", "waiting"] as const;
export type ItemState = (typeof STATES)[number];
export type Move = { at: number; from: number; to: number; why: string };
export type Item = {
  id: string; title: string; owner: string; machine: string; eta: number; kind: ItemKind; ref: string; detail: string;
  state: ItemState; late: boolean; checked?: number; moves: Move[]; url?: string;
};
export type Clock = { items: Item[]; checked?: number };

/** every 10 minutes (#1274; the sketch's 2 asked gh and ssh 30 times an hour on every engine), and at each ETA */
export const CHECK_MS = 10 * 60_000;

// ---- the record ----
let FILE = "";
let ME = "";   // the person whose clock it is (team.json's GitHub login): an item's owner when none is said
let current: Clock | null = null;
const listeners = new Set<(c: Clock) => void>();

/** where the record lives; parts/clock.ts sets it at start (a test sets its own) */
export function clockAt(file: string, me = "") { FILE = file; ME = me; current = null; }
export function clockFile() { return FILE; }
export function readClock(): Clock {
  if (current) return current;
  try { const j = JSON.parse(readFileSync(FILE, "utf8")); current = { items: Array.isArray(j?.items) ? j.items.map(itemOf).filter(Boolean) as Item[] : [], checked: j?.checked }; }
  catch { current = { items: [] }; }
  return current;
}
export function saveClock(c: Clock) {
  current = { ...c, items: [...c.items].sort((a, b) => a.eta - b.eta) };
  if (FILE) {
    mkdirSync(dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(current, null, 1));
    renameSync(tmp, FILE);
  }
  for (const f of listeners) { try { f(current); } catch { /* a listener is never the record's problem */ } }
}
export function onClock(f: (c: Clock) => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export const clockExists = () => !!FILE && existsSync(FILE);
/** the switch (#1274): off unless SOL_CLOCK_ON=on or a record is there already; SOL_CLOCK_ON=off wins over the file */
export const clockOn = () => { const e = (process.env.SOL_CLOCK_ON ?? "").trim().toLowerCase(); return e === "off" ? false : e === "on" || clockExists(); };
export const CLOCK_OFF = "the clock is off in this Sol (SOL_CLOCK_ON=on turns it on)";
/** something on the clock still to be checked (pure) */
export const pending = (c: Clock) => c.items.some((i) => i.state !== "done");

/** an item as read from disk: anything malformed is dropped (pure) */
export function itemOf(v: unknown): Item | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string" || typeof o.eta !== "number") return null;
  const kind = KINDS.includes(o.kind as ItemKind) ? o.kind as ItemKind : "yes";
  const state = STATES.includes(o.state as ItemState) ? o.state as ItemState : "waiting";
  return {
    id: o.id, title: o.title, owner: String(o.owner ?? ""), machine: String(o.machine ?? ""), eta: o.eta, kind, ref: String(o.ref ?? ""),
    detail: String(o.detail ?? ""), state, late: !!o.late, ...(typeof o.checked === "number" ? { checked: o.checked } : {}),
    moves: Array.isArray(o.moves) ? o.moves as Move[] : [], ...(typeof o.url === "string" ? { url: o.url } : {}),
  };
}

/** late: past its ETA and not done (pure) */
export const lateOf = (i: Pick<Item, "eta" | "state">, now: number) => i.eta < now && i.state !== "done";

/** an ETA as a person or an agent says it: "16:45" (today, or tomorrow when that has passed more than 12 h ago),
 *  "tomorrow 09:15", an ISO time, or epoch ms. null when it is none of those (pure) */
export function etaOf(v: unknown, now = Date.now()): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  const hm = /^(tomorrow\s+)?(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) {
    const d = new Date(now); d.setHours(Number(hm[2]), Number(hm[3]), 0, 0);
    if (Number(hm[2]) > 23 || Number(hm[3]) > 59) return null;
    if (hm[1]) d.setDate(d.getDate() + 1);
    else if (d.getTime() < now - 12 * 3600_000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (/^\d{10,13}$/.test(s)) return etaOf(Number(s), now);
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "item";

// ---- the three verbs ----
export type Add = { id?: string; title: string; owner?: string; machine?: string; eta: unknown; kind: ItemKind; ref?: string; detail?: string };
export function addItem(a: Add, by: string, now = Date.now()): Item {
  const title = String(a.title ?? "").trim().slice(0, 140);
  if (!title) throw new Error("an item needs a title");
  if (!KINDS.includes(a.kind)) throw new Error(`kind is one of ${KINDS.join(", ")}`);
  const eta = etaOf(a.eta, now);
  if (eta === null) throw new Error(`eta "${a.eta}" is not a time: say "16:45", "tomorrow 09:15" or an ISO time`);
  const ref = String(a.ref ?? "").trim().replace(/^#/, "");
  if (a.kind === "pr" && !/^\d+$/.test(ref)) throw new Error("a pr item's ref is its PR number");
  if (a.kind === "unit" && !/^[A-Za-z0-9@._:-]{1,120}$/.test(ref)) throw new Error("a unit item's ref is the systemd unit's name (letters, digits, @ . _ : -)");
  const machine = String(a.machine ?? "").trim();
  if (!/^[A-Za-z0-9.-]{0,80}$/.test(machine)) throw new Error("machine is a host name (letters, digits, dots, dashes): it is given to ssh");
  if (a.kind === "release" && !ref) throw new Error("a release item's ref is the release tag it waits for");
  const c = readClock();
  let id = a.id ? slug(a.id) : slug(title);
  if (c.items.some((i) => i.id === id)) { if (a.id) throw new Error(`an item "${id}" is there already`); let n = 2; while (c.items.some((i) => i.id === `${id}-${n}`)) n++; id = `${id}-${n}`; }
  const state: ItemState = a.kind === "yes" || a.kind === "release" ? "waiting" : "building";
  const item: Item = {
    id, title, owner: String(a.owner ?? by).trim() || by, machine, eta, kind: a.kind, ref,
    detail: String(a.detail ?? "").trim().slice(0, 240), state, late: false, moves: [],
  };
  item.late = lateOf(item, now);
  saveClock({ ...c, items: [...c.items, item] });
  return item;
}
/** a new ETA, never silent: the reason is kept with the move and shown on the row */
export function moveItem(id: string, eta: unknown, why: string, now = Date.now()): Item {
  const c = readClock(), i = c.items.find((x) => x.id === id);
  if (!i) throw new Error(`no item "${id}" on the clock`);
  const reason = String(why ?? "").trim();
  if (!reason) throw new Error("a move says why");
  const to = etaOf(eta, now);
  if (to === null) throw new Error(`eta "${eta}" is not a time`);
  const next: Item = { ...i, eta: to, moves: [...i.moves, { at: now, from: i.eta, to, why: reason.slice(0, 200) }] };
  next.late = lateOf(next, now);
  saveClock({ ...c, items: c.items.map((x) => x.id === id ? next : x) });
  return next;
}
export function doneItem(id: string, note?: string, now = Date.now()): Item {
  const c = readClock(), i = c.items.find((x) => x.id === id);
  if (!i) throw new Error(`no item "${id}" on the clock`);
  const next: Item = { ...i, state: "done", late: false, detail: (note ?? "").trim() || i.detail, checked: now };
  saveClock({ ...c, items: c.items.map((x) => x.id === id ? next : x) });
  return next;
}

// ---- the check ----
export type Pr = { state: string; branch: string; url?: string };
export type Run = { status: string; conclusion: string; id: number; url?: string } | null;
/** what the check reads from the world; null = could not be read */
export type Probe = {
  pr: (n: string) => Promise<Pr | null>;
  ci: (branch: string) => Promise<Run>;
  unit: (machine: string, unit: string) => Promise<string | null>;   // systemctl is-active's word, or null: unreachable
  tags: () => string[];                                               // the release tags every Sol said on the relay (/runs)
};

/** a PR and its latest full ci run → the item's state and detail (pure; the sketch's rules) */
export function prState(pr: Pr | null, run: Run, was: ItemState = "building"): { state: ItemState; detail: string; url?: string } {
  // gh failed (offline, rate limit, no gh here): the state stays as it was, the detail says so
  if (!pr) return { state: was, detail: "the PR could not be read" };
  if (pr.state === "MERGED") return { state: "done", detail: "merged", url: pr.url };
  if (pr.state === "CLOSED") return { state: "red", detail: "closed without merging", url: pr.url };
  if (!run) return { state: "building", detail: "PR open, no full CI yet", url: pr.url };
  const u = run.url ?? pr.url;
  if (run.status === "completed") {
    if (run.conclusion === "success") return { state: "green", detail: "full CI green, waits for the read and the merge", url: u };
    if (run.conclusion === "cancelled" || run.conclusion === "skipped") return { state: "building", detail: "PR open, full CI not run yet", url: pr.url };
    return { state: "red", detail: `full CI ${run.conclusion || "failed"} (run ${run.id})`, url: u };
  }
  return { state: "ci", detail: `full CI running (run ${run.id})`, url: u };
}
/** a unit's is-active word → state (pure); null: unreachable, the state stays */
export function unitState(word: string | null, was: ItemState): { state: ItemState; detail: string } {
  if (word === null) return { state: was, detail: "unreachable" };
  if (word === "active" || word === "activating" || word === "reloading") return { state: "building", detail: `builder ${word}` };
  if (word === "failed") return { state: "red", detail: "builder failed" };
  return { state: "done", detail: `builder ${word || "inactive"}` };
}
/** a release: done once some Sol runs the tag or a newer one (dev-YYYYMMDD-HHMM sorts as text) (pure) */
export function releaseState(ref: string, tags: string[]): { state: ItemState; detail: string } {
  const latest = [...tags].sort().pop() ?? "";
  const has = tags.some((t) => t >= ref);
  return { state: has ? "done" : "waiting", detail: latest ? `latest a Sol runs: ${latest}` : "no Sol said its release yet" };
}

/** one item checked; a done item is never checked again (pure but for the probe) */
export async function checkItem(i: Item, p: Probe, now = Date.now()): Promise<Item> {
  if (i.state === "done") return { ...i, late: false };
  let r: { state: ItemState; detail: string; url?: string } = { state: i.state, detail: i.detail };
  try {
    if (i.kind === "pr") { const pr = await p.pr(i.ref); r = prState(pr, pr ? await p.ci(pr.branch) : null, i.state); }
    else if (i.kind === "unit") r = unitState(await p.unit(i.machine, i.ref), i.state);
    else if (i.kind === "release") r = releaseState(i.ref, p.tags());
  } catch (e) { r = { state: i.state, detail: `not read: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` }; }
  const next: Item = { ...i, state: r.state, detail: r.detail, checked: now, ...(r.url ? { url: r.url } : {}) };
  next.late = lateOf(next, now);
  return next;
}
/** every item checked at once; the record saved and told only when something it shows changed */
let checking: Promise<Clock> | null = null;
export function checkAll(p: Probe, now = Date.now()): Promise<Clock> {
  if (checking) return checking;
  checking = (async () => {
    const c = readClock();
    if (!pending(c)) return c;   // nothing on it, or all done: nothing asked, no file written
    const items = await Promise.all(c.items.map((i) => checkItem(i, p, now)));
    // the record may have changed while the checks ran: keep what a verb did meanwhile (its eta, a done)
    const fresh = readClock();
    const merged = fresh.items.map((f) => { const n = items.find((x) => x.id === f.id); if (!n) return f; const was = c.items.find((x) => x.id === f.id);
      return was && (was.eta !== f.eta || f.state === "done" && n.state !== "done") ? { ...f, late: lateOf(f, now) } : n; });
    const next = { items: merged, checked: now };
    saveClock(next);
    return next;
  })().finally(() => { checking = null; });
  return checking;
}
/** the next ETA still to pass of an item not done, after now; the part checks at once when it comes (pure) */
export function nextEta(c: Clock, now: number): number | null {
  const e = c.items.filter((i) => i.state !== "done" && i.eta > now).map((i) => i.eta);
  return e.length ? Math.min(...e) : null;
}

/** whose clock it is, once team.json knows the login: an item's owner when none is said */
export function meIs(login: string) { if (login) ME = login; }

// ---- the tools a session changes it with (on the sol server; tools.ts gives them) ----
const eta = z.string().max(40);
export const CLOCK_TOOLS = [{
  name: "clock_add",
  description: "Put something coming in on your person's clock, with its ETA (compose kind `clock`, body {}, shows the clock " +
    "full width; the engine feeds it). kind: pr (ref: the PR " +
    "number; the clock reads its state and its full CI), unit (ref: a builder's systemd user unit, on `machine`), release (ref: the " +
    "release tag it waits for, e.g. dev-20261114-1700; done once a Sol runs it), yes (a person's word; done by clock_done). " +
    "eta: \"16:45\", \"tomorrow 09:15\" or an ISO time. The clock checks it every 10 minutes and at once when its ETA passes.",
  shape: { title: z.string().max(140), kind: z.enum(KINDS), eta, ref: z.string().max(120).optional(), owner: z.string().max(60).optional(), machine: z.string().max(60).optional(), detail: z.string().max(240).optional(), id: z.string().max(32).optional() },
} as const, {
  name: "clock_move",
  description: "Move an item's ETA on the clock. Never silent: `why` says what moved it, and the row shows it.",
  shape: { id: z.string().max(40), eta, why: z.string().min(1).max(200) },
} as const, {
  name: "clock_done",
  description: "Mark an item on the clock done (a yes given, or anything the check cannot see), with an optional note.",
  shape: { id: z.string().max(40), note: z.string().max(240).optional() },
} as const] as const;
export const CLOCK_NAMES = new Set<string>(CLOCK_TOOLS.map((t) => t.name));
const hm = (t: number) => new Date(t).toTimeString().slice(0, 5);
/** a clock tool's call → its answer in words; a refusal throws (tools.ts says it) */
export function runClockTool(name: string, a: any, by = ME || "me"): string {
  if (!clockOn()) throw new Error(CLOCK_OFF);
  if (name === "clock_add") { const i = addItem(a ?? {}, by); return `on the clock: ${i.id}, ETA ${hm(i.eta)} (${i.state}). It is checked every 10 minutes and at its ETA.`; }
  if (name === "clock_move") { const i = moveItem(String(a?.id ?? ""), a?.eta, String(a?.why ?? "")); return `moved: ${i.id} now ETA ${hm(i.eta)}, because ${i.moves.at(-1)!.why}`; }
  if (name === "clock_done") { const i = doneItem(String(a?.id ?? ""), a?.note); return `done: ${i.id}`; }
  throw new Error(`no clock tool ${name}`);
}
/** the record's file, beside work.json (pure) */
export const clockFileIn = (stateDir: string) => join(stateDir, "clock.json");
