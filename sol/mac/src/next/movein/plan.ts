// The migration's plan (BR1, #1615; mine/look/br1/migration.html C): the moves Sol made, each shown on its own screen as a
// picture and one sentence, the folders it could not place (asked after the moves), and what the canvas holds after.
// Pure: read from the engine's judge (movein-place.ts judge, sent with next.movein as `judged`) and the read's rows, never
// from a name, a kind or a list. Each move is one call of the judge, said once for all the folders it touched:
//   group    two or more folders read the same rules file above them: they go into the folder that holds it (a new
//            folder on the canvas when the read did not list it)
//   inside   a folder that sits inside another the read listed, on disk
//   shelf    used on one day only, tied to nothing, older and quieter than most of the home (nothing is deleted)
// and C-2's (engine movein-group.ts), each a group Sol suggests, new until the person moves in:
//   group    (shape) two or more folders one word of the person's names that hold the same shape, named by that word
//   tries    two or more quick tries the person's AIs made and nothing of theirs uses, gathered into Experiments
// Every folder says who made it (Judged.made): the ones an AI made are drawn apart (Plan.ai, the drawing's key).
// An ask is a folder on its own with nothing tying it to the person (no history, rules, sessions, stickies, things, an
// agent, nothing they said), not on the Shelf: Sol leaves it to them, at most ASKS of them. A folder no move touches and
// no ask names stays as it was and needs no step.
// The person's own words (read 2, Row.said) go with a move as "you said", apart from what Sol saw.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import type { Choices, Person, Row } from "./data.ts";

/** the judge's answer for one folder, as next.movein sends it (engine movein-place.ts Judged) */
export type Judged = {
  folder: string; name: string; path?: string; shelf: boolean; why: string | null; reading: string | null;
  parent: { folder: string; name: string; path?: string; reading: "inside" | "rules" | "tries" | "shape"; file?: string; fresh?: boolean; said?: string; shape?: string[] } | null;
  lived?: { belongs?: string[] };
  /** who made the folder (C-2): an AI when none of its files is older than its first session */
  made?: "you" | "ai";
};
export type Fold = { folder: string; name: string };
/** a folder a move touched; `into` the folder it goes inside (none for the Shelf) */
export type Moved = Fold & { into?: string };
/** `ai` how many of its folders an AI made; `suggest` a new group Sol suggests ("new · a group I suggest") */
export type Move = { id: string; kind: "group" | "inside" | "tries" | "shelf"; folders: Moved[]; to: (Fold & { fresh: boolean })[]; saw: string; said: string[]; ai: number; suggest?: true };
export type Ask = Fold & { line: string };
/** `ai` the folders an AI made, drawn apart */
export type Plan = { moves: Move[]; asks: Ask[]; folders: Fold[]; ai: string[] };

export const ASKS = 3;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** the moves and asks of a read: only its folders the person sees as rows (a Sol-home folder's sub-folder is inside it
 *  already, never a step) */
export function planOf(judged: readonly Judged[] | undefined, rows: readonly Row[]): Plan {
  const tops = rows.filter((r) => r.k === "place"), byId = new Map(tops.map((r) => [r.id, r]));
  const folders = tops.map((r) => ({ folder: r.id, name: r.n }));
  const js = (judged ?? []).filter((j) => byId.has(j.folder));
  const saidOf = (fs: Fold[]) => uniq(fs.flatMap((f) => byId.get(f.folder)?.said ?? []));
  const fold = (j: Judged, into?: string): Moved => ({ folder: j.folder, name: byId.get(j.folder)?.n ?? j.name, ...(into ? { into } : {}) });
  const target = (folder: string, name: string) => ({ folder, name: byId.get(folder)?.n ?? name, fresh: !byId.has(folder) });
  const ai = js.filter((j) => j.made === "ai").map((j) => j.folder), aiN = (fs: Fold[]) => fs.filter((f) => ai.includes(f.folder)).length;
  const moves: Move[] = [];
  // group: one move per folder whose rules file two or more read, or that one word of the person's names with one shape
  const groups = new Map<string, Judged[]>();
  for (const j of js) if (j.parent?.reading === "rules" || j.parent?.reading === "shape") groups.set(j.parent.folder, [...(groups.get(j.parent.folder) ?? []), j]);
  for (const [to, g] of groups) {
    const p = g[0].parent!, fs = g.map((j) => fold(j, to)), t = target(to, p.name);
    moves.push({ id: `group:${to}`, kind: "group", folders: fs, to: [t], said: saidOf(fs), ai: aiN(fs), ...(p.reading === "shape" && t.fresh ? { suggest: true as const } : {}),
      saw: p.reading === "shape" ? `the same shape${p.shape?.length ? `: ${p.shape.join(", ")}` : ""}` : `they all follow the ${p.file ?? "rules file"} in ${p.name}` });
  }
  // inside: one move for every folder that sits inside another on disk
  const ins = js.filter((j) => j.parent?.reading === "inside");
  if (ins.length) {
    const fs = ins.map((j) => fold(j, j.parent!.folder));
    const to = uniq(ins.map((j) => j.parent!.folder)).map((f) => target(f, ins.find((j) => j.parent!.folder === f)!.parent!.name));
    moves.push({ id: "inside", kind: "inside", folders: fs, to, said: saidOf([...fs, ...to]), ai: aiN(fs),
      saw: ins.length === 1 ? `on your disk it already sits inside ${to[0].name}` : to.length === 1 ? `on your disk they already sit inside ${to[0].name}` : "on your disk each already sits inside that folder" });
  }
  // tries: one move for the quick tries the person's AIs made, gathered into Experiments
  const tr = js.filter((j) => j.parent?.reading === "tries");
  if (tr.length) {
    const p = tr[0].parent!, fs = tr.map((j) => fold(j, p.folder)), t = target(p.folder, p.name);
    moves.push({ id: `tries:${p.folder}`, kind: "tries", folders: fs, to: [t], said: saidOf(fs), ai: aiN(fs), ...(t.fresh ? { suggest: true as const } : {}),
      saw: "your AIs made them in a quick try, and nothing else of yours uses them" });
  }
  // shelf: one move for all
  const sh = js.filter((j) => j.shelf && !j.parent);
  if (sh.length) {
    const fs = sh.map((j) => fold(j));
    moves.push({ id: "shelf", kind: "shelf", folders: fs, to: [], said: saidOf(fs), ai: aiN(fs),
      saw: sh.length === 1 ? (sh[0].why ?? "it was changed on one day only") : "each was changed on one day only, and three in four of your folders were used more" });
  }
  // asks: on their own, tied to nothing the person did or said
  const moved = new Set(moves.flatMap((m) => [...m.folders.map((f) => f.folder), ...m.to.map((t) => t.folder)]));
  const asks = js.filter((j) => !j.parent && !j.shelf && !moved.has(j.folder) && !j.lived?.belongs?.length && !byId.get(j.folder)?.said?.length)
    .slice(0, ASKS).map((j) => ({ ...fold(j), line: byId.get(j.folder)?.small ?? "" }));
  return { moves, asks, folders, ai };
}

/** the migration shows on a first move-in whose read the engine judged; a move-in kept before keeps the list page */
export const migrates = (p: Person) => !!p.plan && !p.moved && p.plan.folders.length > 0;
/** nothing to sort: no move and no ask (migration.html D) */
export const calm = (p: Plan) => !p.moves.length && !p.asks.length;

/** the person's answers on the migration (Choices.mig): `no` the moves they changed back (left as they were), `ans` an
 *  ask's answer ("keep", "shelf", "into:<folder>"), `at` the screen they are on (each move, then each ask, then the
 *  overview at moves + asks), `skip` the step Skip to the overview was pressed on (the steps from there on taken as Sol
 *  made them, unseen) */
export type Mig = { at: number; no: Record<string, 1>; ans: Record<string, string>; skip?: number };
export const migOf = (c: Choices): Mig => (c.mig ??= { at: 0, no: {}, ans: {} });
export const steps = (p: Plan) => p.moves.length + p.asks.length;

export type Top = Fold & { fresh: boolean; holds: number; pins: number[] };
/** the canvas after the answers: the folders it draws on top (a new group first), each with how many went inside it and
 *  the numbers of the steps that touched it; the Shelf; the folders no step touched */
export function after(plan: Plan, m: Mig): { tops: Top[]; shelf: Fold[]; shelfPins: number[]; same: Fold[] } {
  const into = new Map<string, string>(), out = new Map<string, Fold>(), shelfPins: number[] = [], pins = new Map<string, number[]>();
  const touched = new Set<string>(), fresh = new Map<string, Fold>();
  const pin = (f: string, n: number) => pins.set(f, uniq([...(pins.get(f) ?? []), n]));
  plan.moves.forEach((mv, i) => {
    const n = i + 1;
    for (const f of mv.folders) touched.add(f.folder);
    for (const t of mv.to) touched.add(t.folder);
    if (m.no[mv.id]) return;
    if (mv.kind === "shelf") { for (const f of mv.folders) out.set(f.folder, f); shelfPins.push(n); return; }
    for (const t of mv.to) { if (t.fresh) fresh.set(t.folder, t); pin(t.folder, n); }
    for (const f of mv.folders) if (f.into) into.set(f.folder, f.into);
  });
  plan.asks.forEach((a, i) => {
    const n = plan.moves.length + i + 1, x = m.ans[a.folder];
    touched.add(a.folder);
    if (x === "shelf") { out.set(a.folder, a); shelfPins.push(n); }
    else if (x?.startsWith("into:")) { into.set(a.folder, x.slice(5)); pin(x.slice(5), n); }
    else pin(a.folder, n);
  });
  const holds = (f: string) => [...into.values()].filter((to) => to === f).length;
  const tops = [...[...fresh.values()].map((f) => ({ ...f, fresh: true })), ...plan.folders.filter((f) => !into.has(f.folder) && !out.has(f.folder)).map((f) => ({ ...f, fresh: false }))]
    .map((f) => ({ ...f, holds: holds(f.folder), pins: pins.get(f.folder) ?? [] }));
  return { tops, shelf: [...out.values()], shelfPins, same: plan.folders.filter((f) => !touched.has(f.folder)) };
}

/** the answers as next.movein.keep says them, beside keep/fix/drop: the folders of a move changed back stay where they
 *  are (`apart`), an ask folded into another (`into`), an ask put on the Shelf is a drop */
export function migKeep(plan: Plan | undefined, c: Choices): { apart: string[]; into: Record<string, string>; drop: string[] } {
  const m = c.mig, apart: string[] = [], into: Record<string, string> = {}, drop: string[] = [];
  if (!plan || !m) return { apart, into, drop };
  for (const mv of plan.moves) if (m.no[mv.id]) apart.push(...mv.folders.map((f) => f.folder));
  for (const a of plan.asks) {
    const x = m.ans[a.folder];
    if (x === "shelf") drop.push(a.folder);
    else if (x?.startsWith("into:")) into[a.folder] = x.slice(5);
  }
  return { apart, into, drop };
}
