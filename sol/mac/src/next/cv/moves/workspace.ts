// Workspace changes' moves (#1615 BR1; engine next/workspace.ts, protocol next/protocol/WS.md): a setup Sol suggests is
// looked at (wsPreview), its changes skipped or not (wsSkip), kept (wsKeep), discarded (wsDiscard), and a kept one
// undone (wsUndo). Each sends one next.workspace.* message and answers Done; the engine's answer lands through the wire
// (cv/wire/workspace.ts) in D.workspace. Live only: on the dev page and in tests nothing is sent and each answers
// { ok: false, why: "not yet" }. Named ws* so none meets a shared move. The panel is workspace/Workspace.tsx.
// Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import { D, MODE, change, done, notYet, type Done, type Moves, type Piece } from "../core.ts";
import type { Engine } from "../wire/types.ts";

// ---------------------------------------------------------------- what the engine says (WS.md), as the face keeps it

export type Ref = { kind: "sticky"; folder: string; key: string } | { kind: "folder"; folder: string } | { kind: "group"; id: string };
export type Op = { key: string; op: "create_folder" | "create_piece" | "move_piece" | "update_piece"; reason: string; cant?: string; name?: string; kind?: string; type?: string; region?: string; text?: string; items?: string[]; ref?: Ref };
export type Evidence = { ref: Ref; claim: string; type: "stated-intent" | "inference"; label: string };
export type Plan = {
  id: string; title: string; reason: string; source?: string; created: number; revision: number;
  status: "proposed" | "kept" | "discarded" | "undone"; evidence: Evidence[]; operations: Op[];
  keptAt?: number; undoneAt?: number; discardedAt?: number; applied?: { made?: Made[] };
};
/** what a kept change made (the engine's Applied.made): a folder of Home's by its name under Home, a sticky by its folder and title */
export type Made = { kind: "home-folder"; folder: string } | { kind: "sticky"; folder: string; sticky: { t: string } } | { kind: "group"; id: string };
export type Row = { key: string; op: string; kept: boolean; says: string; reason: string; cant?: string };
export type Preview = { id: string; title: string; revision: number; rows: Row[]; ready: boolean; why?: string; says: string };
/** D.workspace: the plans, the skips the person chose per plan, the last preview, and the last refusal in words */
export type WS = {
  plans: Plan[]; waiting: number; skips: Record<string, string[]>;
  preview: (Preview & { skips: string }) | null; busy: string | null; why: Record<string, string>;
};

/** the engine the moves send to: set by the wire in a real Sol, null on the dev page and in tests */
export const wsLink: { e: Engine | null } = { e: null };
const send = (o: object): boolean => (wsLink.e ? wsLink.e.send(o) : false);

/** the store's workspace state, made when first read */
export function WSof(): WS {
  let w = D.workspace as WS | undefined;
  if (!w) { w = { plans: [], waiting: 0, skips: {}, preview: null, busy: null, why: {} }; D.workspace = w; }
  return w;
}
/** how many suggestions wait for the person (the Settings row's count) */
export const workspaceCount = (): number => (D.workspace as WS | undefined)?.waiting ?? 0;

const planOf = (id: string) => WSof().plans.find((p) => p.id === id);
/** the person's choices as the engine reads them: a skipped change is { key, keep: false } */
const decisionsOf = (id: string) => (WSof().skips[id] ?? []).map((key) => ({ key, keep: false }));
const skipsKey = (id: string) => [...(WSof().skips[id] ?? [])].sort().join(",");
/** does the preview standing show this plan with these choices at this revision (Keep stays off until it does) */
export const previewed = (id: string): boolean => {
  const w = WSof(), p = planOf(id);
  return !!p && !!w.preview && w.preview.id === id && w.preview.revision === p.revision && w.preview.skips === skipsKey(id) && w.preview.ready;
};

function ask(type: string, id: string, extra: object = {}): Done {
  if (MODE !== "live") return notYet();
  if (!planOf(id)) return { ok: false, why: "that suggestion isn't here", undo: () => {} };
  if (!send({ type, rid: `${type}:${id}`, id, ...extra })) return { ok: false, why: "Sol isn't connected", undo: () => {} };
  change(() => { const w = WSof(); w.busy = id; delete w.why[id]; });
  return done(true, id);
}

const moves: Moves = {
  /** what keeping would do with the changes not skipped; nothing changes */
  wsPreview: (id: string) => ask("next.workspace.preview", id, { decisions: decisionsOf(id) }),
  /** one change skipped, or taken in again; the preview standing no longer counts */
  wsSkip: (id: string, key: string) => {
    if (!planOf(id)) return { ok: false, why: "that suggestion isn't here", undo: () => {} };
    const flip = () => change(() => {
      const w = WSof(), s = new Set(w.skips[id] ?? []);
      if (s.has(key)) s.delete(key); else s.add(key);
      w.skips[id] = [...s];
    });
    flip();
    return done(true, id, flip);
  },
  /** the reviewed revision kept, only the changes not skipped; its undo is the engine's */
  wsKeep: (id: string) => {
    const p = planOf(id);
    if (!p) return { ok: false, why: "that suggestion isn't here", undo: () => {} };
    if (!previewed(id)) return { ok: false, why: "look at the preview first", undo: () => {} };
    const r = ask("next.workspace.keep", id, { decisions: decisionsOf(id), revision: p.revision });
    return r.ok ? done(true, id, () => { moves.wsUndo(id); }) : r;
  },
  /** closed without touching anything */
  wsDiscard: (id: string) => ask("next.workspace.discard", id),
  /** a kept change taken back; the engine refuses when it would undo over the person's work */
  wsUndo: (id: string) => ask("next.workspace.undo", id),
};
export default moves;

// ---------------------------------------------------------------- "from <name>": what a friend's setup made (social/setup.ts take)

const fold = (s: string) => s.replace(/\s*← now\s*$/, "").trim().toLowerCase();
const FROM = /^from (.+)$/;
/** who each kept change "from <name>" made what for: its stickies by folder and title, its folders by name; a change
 *  undone or discarded gives nothing, and a later one wins (pure over the plans) */
export function madeFrom(plans: readonly Plan[]): { stickies: Map<string, string>; folders: Map<string, string> } {
  const stickies = new Map<string, string>(), folders = new Map<string, string>();
  for (const p of [...plans].filter((x) => x.status === "kept").sort((a, b) => (a.keptAt ?? 0) - (b.keptAt ?? 0))) {
    const who = FROM.exec(p.source ?? "")?.[1]?.trim();
    if (!who) continue;
    for (const m of p.applied?.made ?? []) {
      if (m.kind === "home-folder") folders.set(fold(m.folder), who);
      if (m.kind === "sticky") stickies.set(`${fold(m.folder)}\0${fold(m.sticky.t)}`, who);
    }
  }
  return { stickies, folders };
}
/** each sticky a friend's setup made carries `from` (their name), matched by its Life folder's name and its title;
 *  the rest carry none. Called inside a change: after the plans come and after a folder's stickies are read again */
export function stampFrom(d: { regions: { id: string; name: string }[]; pieces: Record<string, Piece>; workspace?: unknown }): void {
  const { stickies } = madeFrom((d.workspace as WS | undefined)?.plans ?? []);
  const names = new Map(d.regions.map((r) => [r.id, fold(r.name)]));
  for (const p of Object.values(d.pieces)) {
    if (p.kind !== "sticky") continue;
    const who = stickies.get(`${names.get(p.region) ?? ""}\0${fold(String(p.key ?? p.name))}`);
    if (who) p.from = who; else delete p.from;
  }
}

/** the engine's answer to one of the moves, folded in (the wire calls it) */
export function heard(m: { type?: string; ok?: boolean; why?: string; rid?: unknown; plans?: Plan[]; waiting?: number; preview?: Preview; plan?: Plan }): void {
  if (typeof m?.type !== "string" || !m.type.startsWith("next.workspace")) return;
  const id = typeof m.rid === "string" ? m.rid.slice(m.rid.indexOf(":") + 1) : m.plan?.id ?? m.preview?.id ?? "";
  if (m.type === "next.workspace") {
    if (m.ok && Array.isArray(m.plans)) {
      const plans = m.plans;
      change((d) => { const w = WSof(); w.plans = plans; w.waiting = m.waiting ?? plans.filter((p) => p.status === "proposed").length; stampFrom(d); });
    }
    return;
  }
  change(() => {
    const w = WSof();
    if (w.busy === id) w.busy = null;
    if (!m.ok) { if (id) w.why[id] = m.why ?? "Sol couldn't do that"; return; }
    if (m.type === "next.workspace.preview" && m.preview) w.preview = { ...m.preview, skips: skipsKey(m.preview.id) };
    if (m.plan) {
      const at = w.plans.findIndex((p) => p.id === m.plan!.id);
      if (at >= 0) w.plans[at] = m.plan; else w.plans.unshift(m.plan);
      w.waiting = w.plans.filter((p) => p.status === "proposed").length;
      if (m.plan.status !== "proposed") { delete w.skips[m.plan.id]; if (w.preview?.id === m.plan.id) w.preview = null; }
    }
  });
  if (m.type !== "next.workspace.preview" && m.ok) send({ type: "next.workspace" });
}
