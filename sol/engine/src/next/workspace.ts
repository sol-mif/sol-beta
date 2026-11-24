// Workspace changes (#1615, BR1): a setup Sol suggests is a reviewed change of several things at once, never a grant to
// run anything. A plan has a title, one reason, the evidence it rests on (each a piece the person has, its claim marked
// "stated-intent" when the person said it, "inference" when Sol read it in), and its operations, each with a key and a
// reason. Nothing changes until the person keeps it; they may skip any operation first.
//   next.workspace                          → { plans }  newest first
//   next.workspace.propose {spec, source?}  → { plan }   stored, nothing applied
//   next.workspace.preview {id, decisions?} → { preview } what keeping would do, nothing applied
//   next.workspace.keep {id, decisions?, revision} → { plan } the accepted operations applied, all or none
//   next.workspace.discard {id}             → { plan }   nothing touched
//   next.workspace.undo {id}                → { plan }   what the keep made taken away, what it changed put back
// Each operation lands on what the engine already keeps, never on a store of its own:
//   create_folder home     a folder under SOL_HOME, a place for stickies (agent/stickies.ts dirIn, as agent.mkdir makes)
//   create_folder build    a Build group (work/state.ts groupOp add, as work.group does)
//   create_piece note      one sticky in a Home folder: its name the title, its text what it asks (one line, 300 at most)
//   create_piece checklist one sticky per item in a Home folder (the folder is the list; the checklist's own name is kept
//                          in the plan only)
//   move_piece  {ref}      a sticky from one Home folder to another, whole, with its notes
//   update_piece {ref}     a sticky's title or text (agent/stickies.ts edit)
//   refused at keep, kept as proposal kinds: create_folder mixed, create_piece session (an empty session needs a first
//   message, and a proposal never starts one), quick-tools, automations-index, custom-tool. Preview and keep say
//   "Sol can't make this kind yet": the person skips it to keep the rest.
// The rules, one place:
//   - keep refuses a stale plan: the revision asked must be the plan's, every piece the evidence names must read as it
//     did when it was proposed, and every sticky it changes must be as it was;
//   - nothing of the person's is replaced or removed: a new folder whose name is taken is refused (made beside, never
//     over), a sticky whose title is taken in its folder is refused, an update and a move need the sticky unchanged;
//   - keep and undo check everything before they write anything; a write that fails midway is rolled back;
//   - undo takes away only what the keep made and puts back only what it changed, and refuses when the person edited,
//     moved or added to any of it since;
//   - discard touches nothing but the plan.
// One history, never edited (fits.ts's rule): each act is an event appended to SOL_HOME/next/workspace.json, and the
// plans now are a fold of the events.
// Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import { existsSync, mkdirSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";
import { realish } from "../dirs.js";
import * as St from "../agent/stickies.js";
import { groupOp, workState } from "../work/state.js";

export type Answer<T> = ({ ok: true } & T) | { ok: false; why: string };
export type Sticky = St.Sticky;
export type FolderType = "home" | "build" | "mixed";
export type PieceKind = "note" | "checklist" | "session" | "quick-tools" | "automations-index" | "custom-tool";
/** a piece the person has: a sticky in a Home folder, a Home folder, a Build group */
export type Ref = { kind: "sticky"; folder: string; key: string } | { kind: "folder"; folder: string } | { kind: "group"; id: string };
type Base = { key: string; reason: string; cant?: string };
export type Op =
  | (Base & { op: "create_folder"; name: string; type: FolderType })
  | (Base & { op: "create_piece"; name: string; kind: PieceKind; region: string; text: string; items: string[] })
  | (Base & { op: "move_piece"; ref: Ref & { kind: "sticky" }; region: string })
  | (Base & { op: "update_piece"; ref: Ref & { kind: "sticky" }; name?: string; text?: string });
export type Evidence = { ref: Ref; claim: string; type: "stated-intent" | "inference"; label: string };
export type Decision = { key: string; keep?: boolean; patch?: { name?: string; text?: string; items?: string[]; region?: string } };
/** what a keep made and changed, enough to take it back field by field */
export type Made =
  | { kind: "home-folder"; key: string; folder: string }
  | { kind: "group"; key: string; id: string; name: string }
  | { kind: "sticky"; key: string; folder: string; sticky: Sticky };
export type Changed =
  | { kind: "edit"; key: string; folder: string; before: Sticky; after: Sticky }
  | { kind: "move"; key: string; from: string; to: string; index: number; sticky: Sticky };
export type Applied = { made: Made[]; changed: Changed[] };
export type Status = "proposed" | "kept" | "discarded" | "undone";
export type Plan = {
  id: string; title: string; reason: string; source?: string; created: number; revision: number; status: Status;
  /** the session that suggested it, when a session did (its first turn's facts are the plan's "because") */
  session?: string;
  /** the keys of what Sol knows that the suggestion acted on (an agent's carries one, or it is refused; you-known.ts becauseFor) */
  because?: string[];
  evidence: Evidence[]; operations: Op[];
  /** each evidence piece and each sticky an operation changes, as it read when proposed */
  guards: Record<string, string>;
  decisions?: Decision[]; applied?: Applied; keptAt?: number; discardedAt?: number; undoneAt?: number;
};
/** one row of a preview: what keeping does for one operation, or why it can't */
export type Row = { key: string; op: Op["op"]; kept: boolean; says: string; reason: string; cant?: string };
export type Preview = { id: string; title: string; reason: string; revision: number; evidence: Evidence[]; rows: Row[]; ready: boolean; why?: string; says: string };

type Ev =
  | { id: string; at: number; kind: "ws.propose"; plan: Plan }
  | { id: string; at: number; kind: "ws.keep"; plan: string; decisions: Decision[]; operations: Op[]; applied: Applied }
  | { id: string; at: number; kind: "ws.discard"; plan: string }
  | { id: string; at: number; kind: "ws.undo"; plan: string };

export const CANT = "Sol can't make this kind yet";
export const NOTHING_YET = "Nothing changes until you keep it.";
const STALE = "Something this suggestion was based on changed since. Ask for a fresh one before keeping it.";
const KINDS: readonly PieceKind[] = ["note", "checklist", "session", "quick-tools", "automations-index", "custom-tool"];
const NO_HOME_KINDS: ReadonlySet<string> = new Set(["session", "quick-tools", "automations-index", "custom-tool"]);
/** a sticky's one line holds this many characters (agent/stickies.ts make) */
const LINE = 300;
const KEY = /^[a-z][a-z0-9_-]{0,39}$/i;
const clean = (v: unknown, max = 200): string => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** a sticky's words as they will stand: one line, the title never carrying the " — " that splits it */
const flat = (v: unknown, max = 100000): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const norm = (s: Sticky): Sticky => ({ done: !!s.done, t: St.keyOf(s.t), s: s.s, notes: [...s.notes] });

export const workspaceFile = (home: string) => join(nextDir(home), "workspace.json");

// ---------------------------------------------------------------- the history

function readEvents(home: string): Ev[] {
  const { data } = readJson(workspaceFile(home));
  const raw = Array.isArray(data.events) ? data.events : [];
  return raw.filter((e): e is Ev => !!e && typeof e === "object" && typeof (e as Ev).id === "string" && typeof (e as Ev).at === "number"
    && ["ws.propose", "ws.keep", "ws.discard", "ws.undo"].includes((e as Ev).kind));
}
let seq = 0;
const newId = (p: string, at: number) => `${p}-${at.toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
type NoId<T> = T extends unknown ? Omit<T, "id"> : never;
function append(home: string, evs: Ev[], e: NoId<Ev>): void {
  writeJson(workspaceFile(home), { v: 1, events: [...evs, { id: newId("wse", e.at), ...e } as Ev] });
}
/** the plans as they stand, folded from the events in order (pure) */
function fold(evs: Ev[]): Plan[] {
  const by = new Map<string, Plan>();
  for (const e of evs) {
    if (e.kind === "ws.propose") { if (e.plan && typeof e.plan.id === "string" && !by.has(e.plan.id)) by.set(e.plan.id, structuredClone(e.plan)); continue; }
    const p = by.get(e.plan);
    if (!p) continue;
    p.revision++;
    if (e.kind === "ws.keep") Object.assign(p, { status: "kept", keptAt: e.at, decisions: e.decisions, operations: e.operations, applied: e.applied });
    else if (e.kind === "ws.discard") Object.assign(p, { status: "discarded", discardedAt: e.at });
    else Object.assign(p, { status: "undone", undoneAt: e.at });
  }
  return [...by.values()];
}
export const plansOf = (home: string): Plan[] => fold(readEvents(home));

/** next.workspace: every plan, newest first, and how many wait for the person */
export function listPlans(home: string): Answer<{ plans: Plan[]; waiting: number }> {
  const plans = plansOf(home).sort((a, b) => b.created - a.created);
  return { ok: true, plans, waiting: plans.filter((p) => p.status === "proposed").length };
}

// ---------------------------------------------------------------- the pieces the person has

/** a Home folder named by its path under SOL_HOME ("trip", "school/la245"): there, not hidden, not the engine's next/ */
function homeDir(home: string, folder: string): string | null {
  const dir = St.dirIn(home, folder);
  if (!dir) return null;
  const rel = relative(realish(home), dir).split(/[\\/]/);
  return rel.some((s) => s.startsWith(".")) || rel[0] === "next" ? null : dir;
}
const relOf = (home: string, dir: string) => relative(realish(home), dir).split("\\").join("/");
function stickyOf(home: string, folder: string, key: string): Sticky | null {
  const dir = homeDir(home, folder);
  if (!dir) return null;
  const s = St.read(dir).items.find((x) => St.keyOf(x.t) === St.keyOf(key));
  return s ? norm(s) : null;
}
const refId = (r: Ref) => (r.kind === "sticky" ? `sticky:${r.folder}\u0000${St.keyOf(r.key)}` : r.kind === "folder" ? `folder:${r.folder}` : `group:${r.id}`);
/** what a piece reads as now, for the guard (null: it is not there) */
function readRef(home: string, r: Ref): { label: string; hash: string } | null {
  if (r.kind === "sticky") { const s = stickyOf(home, r.folder, r.key); return s ? { label: s.t, hash: JSON.stringify(s) } : null; }
  if (r.kind === "folder") { const d = homeDir(home, r.folder); return d ? { label: basename(d), hash: `folder:${relOf(home, d)}` } : null; }
  const g = workState().groups.find((x) => x.id === r.id);
  return g ? { label: g.name, hash: JSON.stringify({ name: g.name }) } : null;
}
function refOf(raw: any): Ref | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind === "sticky" && typeof raw.folder === "string" && typeof raw.key === "string" && raw.key.trim()) return { kind: "sticky", folder: raw.folder.trim(), key: St.keyOf(raw.key) };
  if (raw.kind === "folder" && typeof raw.folder === "string" && raw.folder.trim()) return { kind: "folder", folder: raw.folder.trim() };
  if (raw.kind === "group" && typeof raw.id === "string" && raw.id) return { kind: "group", id: raw.id };
  return null;
}
/** a name a folder can have on the disk and in a crumb: one segment, not hidden, no control character, no › */
const folderName = (n: string) => !!n && n.length <= 80 && !n.startsWith(".") && !/[\\/›]/.test(n) && n !== "next";

// ---------------------------------------------------------------- an operation read from a proposal

function operation(raw: any): Op | { why: string } {
  if (!raw || typeof raw !== "object" || typeof raw.key !== "string" || !KEY.test(raw.key)) return { why: "each change needs its own short key" };
  const reason = clean(raw.reason, 2000);
  if (!reason) return { why: "each change needs its reason" };
  const base = { key: raw.key, reason };
  if (raw.op === "create_folder") {
    const name = clean(raw.name, 80);
    if (!name) return { why: "give each new folder a name" };
    if (!["home", "build", "mixed"].includes(raw.type)) return { why: "a folder is a Home folder or a Build folder" };
    if (raw.type !== "build" && !folderName(name)) return { why: `"${name}" can't be a folder's name` };
    return { ...base, op: "create_folder", name, type: raw.type, ...(raw.type === "mixed" ? { cant: CANT } : {}) };
  }
  if (raw.op === "create_piece") {
    const name = clean(raw.name, 160);
    if (!KINDS.includes(raw.kind)) return { why: "Sol doesn't know that kind of piece" };
    if (!name) return { why: "give each new piece a name" };
    const items = Array.isArray(raw.items) ? raw.items.slice(0, 200).map((x: unknown) => flat(x, 2000)).filter(Boolean) : [];
    return { ...base, op: "create_piece", name, kind: raw.kind, region: clean(raw.region, 500), text: flat(raw.text), items, ...(NO_HOME_KINDS.has(raw.kind) ? { cant: CANT } : {}) };
  }
  if (raw.op === "move_piece" || raw.op === "update_piece") {
    const ref = refOf(raw.ref);
    if (!ref || ref.kind !== "sticky") return { why: "Sol can move and change stickies only, named by their folder and title" };
    if (raw.op === "move_piece") return { ...base, op: "move_piece", ref, region: clean(raw.region, 500) };
    const op: Op = { ...base, op: "update_piece", ref };
    if (typeof raw.name === "string") op.name = flat(raw.name, 1000);
    if (typeof raw.text === "string") op.text = flat(raw.text, 1000);
    if (op.name === undefined && op.text === undefined) return { why: "an update needs a new title or new words" };
    return op;
  }
  return { why: "Sol doesn't make that kind of change" };
}

// ---------------------------------------------------------------- the dry run: everything keeping would do, nothing done

type Target = { dir: string | null; rel: string; items: Sticky[]; fresh?: string };
type Step =
  | { kind: "home-folder"; key: string; name: string }
  | { kind: "group"; key: string; name: string }
  | { kind: "make"; key: string; at: string; line: string; sticky: Sticky }
  | { kind: "edit"; key: string; folder: string; before: Sticky; after: Sticky }
  | { kind: "move"; key: string; from: string; to: string; sticky: Sticky };
type Dry = { rows: Row[]; steps: Step[]; why?: string };

function says(op: Op): string {
  if (op.op === "create_folder") return op.type === "build" ? `Make the Build folder “${op.name}”` : op.type === "home" ? `Make the Home folder “${op.name}”` : `Make the folder “${op.name}”`;
  if (op.op === "create_piece") {
    if (op.kind === "note") return `Add the note “${op.name}”`;
    if (op.kind === "checklist") return `Add the checklist “${op.name}” (${op.items.length || 1} ${op.items.length === 1 ? "item" : "items"})`;
    if (op.kind === "session") return `Start an empty session “${op.name}”`;
    if (op.kind === "quick-tools") return `Add quick tools “${op.name}”`;
    if (op.kind === "automations-index") return `Add a list of your automations “${op.name}”`;
    return `Add your own tool “${op.name}”`;
  }
  if (op.op === "move_piece") return `Move “${op.ref.key}” to ${op.region.startsWith("$") ? "the new folder" : `“${op.region}”`}`;
  return `Change “${op.ref.key}”${op.name !== undefined ? ` to “${op.name}”` : ""}`;
}

/** the operations the person accepted, with their corrections (a correction never changes what an operation is) */
function reviewed(p: Plan, decisions: unknown): { ops: Op[]; all: { op: Op; kept: boolean }[] } | { why: string } {
  if (decisions === undefined || decisions === null) decisions = [];
  if (!Array.isArray(decisions)) return { why: "the review's choices are a list" };
  const by = new Map<string, Decision>();
  for (const d of decisions as Decision[]) {
    if (!d || typeof d.key !== "string" || !p.operations.some((o) => o.key === d.key) || by.has(d.key)) return { why: "a choice names a change that isn't in this suggestion" };
    by.set(d.key, d);
  }
  const all: { op: Op; kept: boolean }[] = [];
  for (const o of p.operations) {
    const d = by.get(o.key), patch = d?.patch && typeof d.patch === "object" ? d.patch : {};
    const raw: any = { ...o };
    for (const k of ["name", "text", "items", "region"] as const) if (k in patch) raw[k] = (patch as any)[k];
    const op = operation(raw);
    if ("why" in op) return { why: `“${(o as { name?: string }).name ?? o.key}”: ${op.why}` };
    all.push({ op, kept: d?.keep !== false });
  }
  return { ops: all.filter((x) => x.kept).map((x) => x.op), all };
}

/** what keeping these operations would do, checked against the disk as it is now; nothing is written */
function dry(home: string, p: Plan, ops: Op[], all: { op: Op; kept: boolean }[], skipCant = false): Dry {
  const rows: Row[] = all.map(({ op, kept }) => ({ key: op.key, op: op.op, kept, says: says(op), reason: op.reason, ...(op.cant ? { cant: op.cant } : {}) }));
  const row = (key: string) => rows.find((r) => r.key === key)!;
  const fail = (key: string | null, why: string): Dry => { if (key) row(key).cant = why; return { rows, steps: [], why: key ? `${row(key).says}: ${why}` : why }; };
  // stale: what the suggestion rested on, and what it changes, must read as they did
  for (const e of p.evidence) { const now = readRef(home, e.ref); if (!now || now.hash !== p.guards[refId(e.ref)]) return fail(null, STALE); }
  for (const op of ops) if (op.op === "move_piece" || op.op === "update_piece") {
    const now = readRef(home, op.ref);
    if (!now || now.hash !== p.guards[refId(op.ref)]) return fail(op.key, "it changed since this was suggested; ask for a fresh suggestion");
  }
  const keys = new Map(ops.map((o) => [o.key, o]));
  const steps: Step[] = [], targets = new Map<string, Target>();
  const target = (region: string): Target | { why: string } => {
    if (region.startsWith("$")) {
      const f = keys.get(region.slice(1));
      if (!f) return { why: p.operations.some((o) => o.key === region.slice(1)) ? "the folder it goes in was skipped" : "the folder it goes in isn't in this suggestion" };
      if (f.op !== "create_folder" || f.type !== "home") return { why: "a note or a checklist goes in a Home folder" };
      return targets.get(region) ?? (targets.set(region, { dir: null, rel: f.name, items: [], fresh: f.key }), targets.get(region)!);
    }
    const dir = homeDir(home, region);
    if (!dir) return { why: `the folder “${region}” isn't in your Sol` };
    const k = `dir:${dir}`;
    return targets.get(k) ?? (targets.set(k, { dir, rel: relOf(home, dir), items: St.read(dir).items.map(norm) }), targets.get(k)!);
  };
  const madeNames = new Set<string>();
  for (const op of ops) {
    if (op.cant) { if (skipCant) continue; return fail(op.key, `${op.cant}. Skip it to keep the rest.`); }
    if (op.op === "create_folder") {
      if (op.type === "build") { steps.push({ kind: "group", key: op.key, name: op.name }); continue; }
      const low = op.name.toLowerCase();
      if (madeNames.has(low)) return fail(op.key, "two new folders can't share a name");
      madeNames.add(low);
      if (existsSync(join(realish(home), op.name))) return fail(op.key, `you already have a folder named “${op.name}”; Sol makes new ones beside yours, never over them`);
      steps.push({ kind: "home-folder", key: op.key, name: op.name });
    } else if (op.op === "create_piece") {
      const t = target(op.region);
      if ("why" in t) return fail(op.key, t.why);
      const lines = op.kind === "note" ? [{ t: op.name, s: op.text }] : (op.items.length ? op.items : [op.name]).map((x) => ({ t: x, s: "" }));
      for (const l of lines) {
        const title = l.t.replace(/ — /g, " - "), line = l.s ? `${title} — ${l.s}` : title;
        if (line.length > LINE) return fail(op.key, op.kind === "note" ? `a note holds ${LINE} characters for now; make it shorter` : `an item holds ${LINE} characters for now`);
        const m = St.make(t.items, line);
        if ("why" in m) return fail(op.key, m.why);
        t.items = m.items;
        const sticky = norm(m.items[m.items.length - 1]);
        steps.push({ kind: "make", key: op.key, at: t.fresh ? `$${t.fresh}` : t.rel, line, sticky });
      }
    } else if (op.op === "move_piece") {
      const from = target(op.ref.folder), to = target(op.region);
      if ("why" in from) return fail(op.key, from.why);
      if ("why" in to) return fail(op.key, to.why);
      if (from === to) return fail(op.key, "it is in that folder already");
      const i = from.items.findIndex((x) => St.keyOf(x.t) === op.ref.key);
      if (i < 0) return fail(op.key, "that sticky isn't there any more");
      const s = from.items[i];
      if (s.notes.some((n) => n.endsWith(St.NOW))) return fail(op.key, "its agent is working on it; move it when the run ends");
      if (to.items.some((x) => St.keyOf(x.t) === St.keyOf(s.t))) return fail(op.key, `there is already a sticky “${s.t}” there`);
      from.items = from.items.filter((_, k) => k !== i);
      to.items = [...to.items, s];
      steps.push({ kind: "move", key: op.key, from: from.rel, to: to.fresh ? `$${to.fresh}` : to.rel, sticky: s });
    } else {
      const t = target(op.ref.folder);
      if ("why" in t) return fail(op.key, t.why);
      const before = t.items.find((x) => St.keyOf(x.t) === op.ref.key);
      if (!before) return fail(op.key, "that sticky isn't there any more");
      if (before.notes.some((n) => n.endsWith(St.NOW))) return fail(op.key, "its agent is working on it; change it when the run ends");
      const nt = (op.name ?? before.t).replace(/ — /g, " - "), ns = op.text ?? before.s;
      if (nt.length > LINE || ns.length > LINE) return fail(op.key, `a sticky holds ${LINE} characters for now`);
      const e = St.edit(t.items, op.ref.key, nt, ns);
      if ("why" in e) return fail(op.key, e.why);
      t.items = e.items;
      const after = norm(e.items.find((x) => St.keyOf(x.t) === St.keyOf(nt))!);
      steps.push({ kind: "edit", key: op.key, folder: t.rel, before, after });
    }
  }
  return { rows, steps };
}

// ---------------------------------------------------------------- propose, preview, keep, discard, undo

/** a suggestion stored for review: its shape checked, every piece it names read now, nothing applied */
export function propose(home: string, spec: any, source?: unknown, now = Date.now(), session?: unknown): Answer<{ plan: Plan }> {
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.operations) || !spec.operations.length || spec.operations.length > 40) return { ok: false, why: "a suggestion has 1 to 40 changes" };
  const ops: Op[] = [];
  for (const raw of spec.operations) { const op = operation(raw); if ("why" in op) return { ok: false, why: op.why }; ops.push(op); }
  if (new Set(ops.map((o) => o.key)).size !== ops.length) return { ok: false, why: "each change needs its own key" };
  const guards: Record<string, string> = {}, evidence: Evidence[] = [];
  for (const e of (Array.isArray(spec.evidence) ? spec.evidence : []).slice(0, 40)) {
    const ref = refOf(e?.ref), now = ref && readRef(home, ref);
    if (!ref || !now) return { ok: false, why: "a piece this suggestion rests on isn't in your Sol" };
    guards[refId(ref)] = now.hash;
    evidence.push({ ref, claim: clean(e.claim, 2000), type: e.type === "stated-intent" ? "stated-intent" : "inference", label: now.label });
  }
  for (const op of ops) if (op.op === "move_piece" || op.op === "update_piece") {
    const r = readRef(home, op.ref);
    if (!r) return { ok: false, why: `“${op.ref.key}” isn't in your Sol` };
    guards[refId(op.ref)] = r.hash;
  }
  const src = clean(source, 200), sid = clean(session, 120);
  const plan: Plan = {
    id: newId("ws", now), title: clean(spec.title, 160) || "A different setup", reason: clean(spec.reason, 4000), ...(src ? { source: src } : {}), ...(sid ? { session: sid } : {}),
    ...(Array.isArray(spec.because) && spec.because.length ? { because: spec.because.filter((k: unknown): k is string => typeof k === "string").slice(0, 40) } : {}),
    created: now, revision: 1, status: "proposed", evidence, operations: ops, guards,
  };
  // every dependency checked on the dry run now, the kinds Sol can't make yet aside (they stay, refused at keep)
  const d = dry(home, plan, ops, ops.map((op) => ({ op, kept: true })), true);
  if (d.why) return { ok: false, why: d.why };
  append(home, readEvents(home), { at: now, kind: "ws.propose", plan });
  return { ok: true, plan };
}

function waiting(home: string, id: unknown): Plan | { why: string } {
  const p = plansOf(home).find((x) => x.id === id);
  if (!p) return { why: "that suggestion isn't here" };
  return p;
}

/** next.workspace.preview: what keeping would do now, row by row; nothing is written */
export function preview(home: string, id: unknown, decisions?: unknown): Answer<{ preview: Preview }> {
  const p = waiting(home, id);
  if ("why" in p) return { ok: false, why: p.why };
  if (p.status !== "proposed") return { ok: false, why: "this suggestion was answered already" };
  const r = reviewed(p, decisions);
  if ("why" in r) return { ok: false, why: r.why };
  const d = dry(home, p, r.ops, r.all);
  const ready = !d.why && r.ops.length > 0;
  return { ok: true, preview: { id: p.id, title: p.title, reason: p.reason, revision: p.revision, evidence: p.evidence, rows: d.rows, ready, ...(d.why ? { why: d.why } : !r.ops.length ? { why: "every change is skipped" } : {}), says: NOTHING_YET } };
}

/** the steps written, each recorded as it lands; a failure midway takes back what landed and says why */
function apply(home: string, steps: Step[]): Applied | { why: string } {
  const applied: Applied = { made: [], changed: [] }, fresh = new Map<string, string>();
  const at = (where: string) => (where.startsWith("$") ? fresh.get(where.slice(1))! : where);
  try {
    for (const s of steps) {
      if (s.kind === "home-folder") {
        const dir = join(realish(home), s.name);
        if (existsSync(dir)) throw new Error(`you already have a folder named “${s.name}”`);
        // its parent is SOL_HOME, there already; a folder made alone, never with parents, so it can't land elsewhere
        mkdirSync(dir);
        fresh.set(s.key, s.name);
        applied.made.push({ kind: "home-folder", key: s.key, folder: s.name });
      } else if (s.kind === "group") {
        const id = groupOp("add", { name: s.name });
        if (!id) throw new Error("the Build folder wasn't made");
        const g = workState().groups.find((x) => x.id === id)!;
        applied.made.push({ kind: "group", key: s.key, id, name: g.name });
      } else if (s.kind === "make") {
        const dir = homeDir(home, at(s.at));
        if (!dir) throw new Error("its folder isn't there");
        const r = St.change(dir, (l) => St.make(l, s.line));
        if ("why" in r) throw new Error(r.why);
        applied.made.push({ kind: "sticky", key: s.key, folder: relOf(home, dir), sticky: norm(r.items.find((x) => St.keyOf(x.t) === s.sticky.t)!) });
      } else if (s.kind === "edit") {
        const dir = homeDir(home, s.folder);
        if (!dir) throw new Error("its folder isn't there");
        const r = St.change(dir, (l) => (same(norm(l.find((x) => St.keyOf(x.t) === s.before.t) ?? { done: false, t: "", s: "", notes: [] }), s.before) ? St.edit(l, s.before.t, s.after.t, s.after.s) : { why: "it changed meanwhile" }));
        if ("why" in r) throw new Error(r.why);
        applied.changed.push({ kind: "edit", key: s.key, folder: s.folder, before: s.before, after: s.after });
      } else {
        const from = homeDir(home, s.from), to = homeDir(home, at(s.to));
        if (!from || !to) throw new Error("its folder isn't there");
        let index = -1;
        const r = St.change(from, (l) => { index = l.findIndex((x) => same(norm(x), s.sticky)); return index < 0 ? { why: "it changed meanwhile" } : { items: l.filter((_, k) => k !== index) }; });
        if ("why" in r) throw new Error(r.why);
        const put = St.change(to, (l) => (l.some((x) => St.keyOf(x.t) === s.sticky.t) ? { why: `there is already a sticky “${s.sticky.t}” there` } : { items: [...l, s.sticky] }));
        if ("why" in put) { St.change(from, (l) => ({ items: [...l.slice(0, index), s.sticky, ...l.slice(index)] })); throw new Error(put.why); }
        applied.changed.push({ kind: "move", key: s.key, from: s.from, to: relOf(home, to), index, sticky: s.sticky });
      }
    }
    return applied;
  } catch (err) {
    takeBack(home, applied);
    return { why: err instanceof Error ? err.message : String(err) };
  }
}
/** next.workspace.keep: the revision the person reviewed, the accepted operations, all applied or none */
export function keep(home: string, id: unknown, a: { decisions?: unknown; revision?: unknown } = {}, now = Date.now()): Answer<{ plan: Plan }> {
  const p = waiting(home, id);
  if ("why" in p) return { ok: false, why: p.why };
  if (p.status !== "proposed") return { ok: false, why: "this suggestion was answered already" };
  if (a.revision !== p.revision) return { ok: false, why: "this suggestion changed since you looked; look at it again before keeping it" };
  const r = reviewed(p, a.decisions);
  if ("why" in r) return { ok: false, why: r.why };
  if (!r.ops.length) return { ok: false, why: "every change is skipped; discard it instead" };
  const d = dry(home, p, r.ops, r.all);
  if (d.why) return { ok: false, why: d.why };
  const applied = apply(home, d.steps);
  if ("why" in applied) return { ok: false, why: applied.why };
  const decisions = r.all.filter((x) => !x.kept).map((x) => ({ key: x.op.key, keep: false }) as Decision)
    .concat(((a.decisions as Decision[]) ?? []).filter((x) => x.keep !== false && x.patch).map((x) => ({ key: x.key, patch: x.patch })));
  append(home, readEvents(home), { at: now, kind: "ws.keep", plan: p.id, decisions, operations: r.ops, applied });
  return { ok: true, plan: plansOf(home).find((x) => x.id === p.id)! };
}

/** next.workspace.discard: the plan closed; no folder, sticky or group is read or written */
export function discard(home: string, id: unknown, now = Date.now()): Answer<{ plan: Plan }> {
  const p = waiting(home, id);
  if ("why" in p) return { ok: false, why: p.why };
  if (p.status !== "proposed") return { ok: false, why: "this suggestion was answered already" };
  append(home, readEvents(home), { at: now, kind: "ws.discard", plan: p.id });
  return { ok: true, plan: plansOf(home).find((x) => x.id === p.id)! };
}

/** why the person's work since the keep forbids taking it back, or null when it may be (pure but for reads) */
function undoBarred(home: string, ap: Applied): string | null {
  const EDITED = "something this change made was edited or moved since; Sol won't undo over your work";
  for (const c of ap.changed) {
    if (c.kind === "edit") { if (!same(stickyOf(home, c.folder, c.after.t), c.after)) return "a sticky this change edited was changed again since; Sol won't undo over it"; }
    else {
      if (!same(stickyOf(home, c.to, c.sticky.t), c.sticky)) return EDITED;
      if (!homeDir(home, c.from)) return "the folder a sticky came from isn't there any more";
      if (stickyOf(home, c.from, c.sticky.t)) return `there is a new sticky “${c.sticky.t}” where it came from`;
    }
  }
  for (const m of ap.made) if (m.kind === "sticky" && !same(stickyOf(home, m.folder, m.sticky.t), m.sticky)) return EDITED;
  for (const m of ap.made) {
    if (m.kind === "home-folder") {
      const dir = homeDir(home, m.folder);
      if (!dir) return "a folder this change made isn't there any more";
      const names = readdirSync(dir);
      const ours = new Set(ap.made.filter((x): x is Made & { kind: "sticky" } => x.kind === "sticky" && x.folder === m.folder).map((x) => x.sticky.t));
      const moved = new Set(ap.changed.filter((x) => x.kind === "move" && x.to === m.folder).map((x) => (x as { sticky: Sticky }).sticky.t));
      if (names.some((n) => n !== St.FILE)) return `the folder “${m.folder}” now holds other work; undo would strand it`;
      if (names.includes(St.FILE)) {
        const { head, items } = St.read(dir);
        if (items.some((x) => !ours.has(St.keyOf(x.t)) && !moved.has(St.keyOf(x.t)))) return `the folder “${m.folder}” now holds other stickies; undo would strand them`;
        if (head.trim() !== St.HEAD(basename(dir)).trim()) return `the folder “${m.folder}” was written in since`;
      }
    } else if (m.kind === "group") {
      const s = workState(), g = s.groups.find((x) => x.id === m.id);
      if (!g) return "a Build folder this change made isn't there any more";
      if (g.name !== m.name || g.in || g.folders?.length || Object.values(s.marks).some((x) => x.group === m.id)) return `the Build folder “${m.name}” was used since; undo would strand what's in it`;
    }
  }
  return null;
}
/** what a keep applied, taken back in reverse (also a failed keep's rollback: each part only if it is as it was made) */
function takeBack(home: string, ap: Applied): void {
  for (const c of [...ap.changed].reverse()) {
    if (c.kind === "edit") { const dir = homeDir(home, c.folder); if (dir) St.change(dir, (l) => St.edit(l, c.after.t, c.before.t, c.before.s)); }
    else {
      const to = homeDir(home, c.to), from = homeDir(home, c.from);
      if (!to || !from) continue;
      const r = St.change(to, (l) => ({ items: l.filter((x) => !same(norm(x), c.sticky)) }));
      if ("items" in r) St.change(from, (l) => ({ items: [...l.slice(0, c.index), c.sticky, ...l.slice(c.index)] }));
    }
  }
  for (const m of [...ap.made].reverse()) {
    if (m.kind === "sticky") { const dir = homeDir(home, m.folder); if (dir) St.change(dir, (l) => ({ items: l.filter((x) => !same(norm(x), m.sticky)) })); }
  }
  for (const m of [...ap.made].reverse()) {
    if (m.kind === "home-folder") {
      const dir = homeDir(home, m.folder);
      if (!dir) continue;
      const names = readdirSync(dir);
      if (names.length === 1 && names[0] === St.FILE && !St.read(dir).items.length) rmSync(join(dir, St.FILE));
      try { rmdirSync(dir); } catch { /* not empty: left as it is */ }
    } else if (m.kind === "group") {
      if (!Object.values(workState().marks).some((x) => x.group === m.id)) groupOp("delete", { id: m.id });
    }
  }
}

/** next.workspace.undo: a kept change taken back, refused whole when the person's work since would be lost */
export function undo(home: string, id: unknown, now = Date.now()): Answer<{ plan: Plan }> {
  const p = waiting(home, id);
  if ("why" in p) return { ok: false, why: p.why };
  if (p.status !== "kept" || !p.applied) return { ok: false, why: "only a kept change can be undone" };
  const barred = undoBarred(home, p.applied);
  if (barred) return { ok: false, why: barred };
  takeBack(home, p.applied);
  append(home, readEvents(home), { at: now, kind: "ws.undo", plan: p.id });
  return { ok: true, plan: plansOf(home).find((x) => x.id === p.id)! };
}

/** the Home folders a plan's keep or undo touched, for the faces' agent.changed */
export function foldersOf(p: Plan): string[] {
  const ap = p.applied;
  if (!ap) return [];
  return [...new Set([...ap.made.flatMap((m) => (m.kind === "group" ? [] : [m.folder])), ...ap.changed.flatMap((c) => (c.kind === "edit" ? [c.folder] : [c.from, c.to]))])];
}
export const touchesBuild = (p: Plan) => !!p.applied?.made.some((m) => m.kind === "group");
