// The runs at Near (#1615, slice 3; the mockup's merge/runs.js, its logic as it is): the starter card's data and guess,
// a split job's parts, what a run is in words, the asks a face shows. Pure on the store's D and S (read at the moment);
// the moves that change them are cv/moves/near.ts. The AIs' own settings (AI_SET) are the fixture's panel only: live,
// the cost guess and reach are "not yet" (map.md #11), and a starter shows no guess.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { D, S, open, piecesIn, regionOf, type Ask, type Data, type Piece } from "../cv/core.ts";

// ---------------------------------------------------------------- the AIs' own settings (person-only to change)
const AI_SET: Record<string, { reach: string; limit: number; spent?: number }> = {
  Ada: { reach: "asks first", limit: 20 }, Rex: { reach: "goes ahead", limit: 20 }, Kai: { reach: "goes ahead", limit: 10 }, Lu: { reach: "asks first", limit: 10 },
  Mo: { reach: "asks first", limit: 10, spent: 10 }, Ned: { reach: "asks first", limit: 10 }, Oz: { reach: "goes ahead", limit: 10 }, Pia: { reach: "goes ahead", limit: 10 },
  Bo: { reach: "asks first", limit: 5 }, June: { reach: "asks first", limit: 5 }, Sy: { reach: "asks first", limit: 10 },
};
export const setOf = (ai: string): { reach: string; limit: number; spent: number } =>
  Object.assign({ reach: "asks first", limit: 10, spent: 0 }, AI_SET[ai] || {}, ((D.aiSet as Record<string, object>) || {})[ai] || {});

// ---------------------------------------------------------------- where a run happens
export function machineOf(p: Partial<Piece>, d: Data = D): string {
  if (p.machine) return p.machine as string;
  const r = d.regions.find((x) => x.id === p.region);
  if (!r || r.kind === "life") return "this Mac";
  const code = d.regions.filter((x) => x.kind !== "life");
  return code.indexOf(r) % 2 ? "the second box" : "the build server";
}
export function reachOf(p: Piece): { up: boolean; since: string } | null {
  const m = ((D.machines as Record<string, { up: boolean; since: string }>) || {})[machineOf(p)];
  return m && m.up === false ? m : null;
}

// ---------------------------------------------------------------- finding a run: a piece, or a part inside a split job
export function find(id: string | null | undefined): { p: Piece; parent: Piece | null } | null {
  if (!id) return null;
  if (D.pieces[id]) return { p: D.pieces[id], parent: null };
  for (const q of Object.values(D.pieces)) for (const x of q.parts || []) if (x.id === id) return { p: x, parent: q };
  return null;
}
export const aiNames = (): string[] => [...new Set([...D.ais.map((a) => a.name), ...((D.crew as { name: string }[]) || []).map((c) => c.name)])];
export function aiNamed(w: unknown): string | null { const s = String(w || "").toLowerCase(); return aiNames().find((n) => n.toLowerCase() === s) || null; }
export function usualAI(region: string): string {
  const s = piecesIn(region).find((p) => p.kind === "session");
  if (s?.ai) return s.ai;
  const c = ((D.crew as { name: string; region: string }[]) || []).find((x) => x.region === region);
  return c ? c.name : aiNames()[0] || "Ada";
}
export function here(): string | null { if (S.region) return S.region; const p = S.piece ? D.pieces[S.piece] : undefined; return p ? p.region : null; }
/** what the person points at: the piece open at Near, or the one chosen at Middle */
export function current(): string | undefined {
  if (S.dist === "near") return S.piece ?? undefined;
  if (S.dist === "middle") { const ps = piecesIn(S.region); return ps[S.sel % Math.max(ps.length, 1)]?.id; }
  return undefined;
}

// ---------------------------------------------------------------- words → a copy name, a cost guess, what it touches
const STOP = new Set(["the", "a", "an", "in", "on", "of", "to", "for", "and", "with", "please", "our", "my", "this", "that", "it"]);
export function slug(w: unknown): string {
  return String(w || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x && !STOP.has(x)).slice(0, 3).join("-") || "task";
}
export function copyName(w: unknown): string {
  const base = slug(w), used = new Set(Object.values(D.pieces).map((p) => p.copy).filter(Boolean));
  let c = base, i = 2;
  while (used.has(c)) c = base + "-" + i++;
  return c;
}
const TOUCH: [RegExp, string[]][] = [[/login|session|auth|sign/, ["src/auth/session.ts", "src/auth/login.ts"]], [/db|migrat|database/, ["src/db/migrate.ts"]], [/nav|menu/, ["src/ui/nav.tsx"]],
  [/doc|readme|link/, ["docs/"]], [/test|check/, ["tests/"]], [/flag|json|cli/, ["src/cli/flags.ts"]], [/deploy|infra|terraform|tf/, ["deploy/"]]];
export function touchesOf(words: unknown, region: string): string[] {
  const r = regionOf(region), w = String(words || "").toLowerCase();
  if (r && r.kind === "life") return [`${r.name}`];
  const t = TOUCH.filter(([re]) => re.test(w)).flatMap(([, f]) => f);
  return t.length ? t : [`${r ? r.name.replace(/ \(repo\)$/, "") : "the"} folder`];
}
const OUTSIDE = /deploy|publish|send|email|post|push to prod|release/;
export type Guess = { lo: number; hi: number; cost: string; touches: string[]; leaves: string; over: boolean; limit: number; left: number };
export function guess(card: Piece): Guess {
  const n = String(card.words || "").split(/\s+/).filter(Boolean).length, g = ((card.given as string[]) || []).length;
  const lo = Math.round((0.2 + 0.05 * Math.min(n, 12) + 0.1 * g) * 20) / 20, hi = Math.round(lo * 3 * 20) / 20;
  const out = OUTSIDE.test(String(card.words || "").toLowerCase()), st = setOf(card.ai || "");
  return { lo, hi, cost: `about $${lo.toFixed(2)}–${hi.toFixed(2)}`, touches: touchesOf(card.words, card.region),
    leaves: out ? "reaches outside this machine: it deploys" : `stays on ${machineOf(card)}`, over: st.spent + hi > st.limit, limit: st.limit, left: Math.max(0, st.limit - st.spent) };
}

// ---------------------------------------------------------------- the data's shapes
export function sessionOf(base: Piece, ai: string, words: string, region: string): Piece {
  const copy = copyName(words);
  return Object.assign(base, { kind: "session", region, ai, name: `${ai} in ${copy}`, copy, branch: "ai/" + copy, files: 0, state: "working", words,
    term: { lines: [`~/${copy} $ _`], waiting: null, stateWord: "just started" }, talk: [`you: ${words}`, `${ai}: on it.`], cost: 0,
    touch: touchesOf(words, region), machine: machineOf({ region }) });
}
export function partOf(parent: Piece, i: number, ai: string, words: string, d: Data = D): Piece {
  const id = `${parent.id}.p${i + 1}`, copy = `${parent.copy}-${slug(words).split("-")[0]}`;
  return { id, kind: "session", part: true, region: parent.region, ai, name: words, words, copy, branch: "ai/" + copy, files: 0, state: "working",
    term: { lines: [`~/${copy} $ _`], waiting: null, stateWord: "just started" }, talk: [`${parent.ai}: ${ai}, take “${words}”.`, `${ai}: on it.`], cost: 0, machine: machineOf(parent, d) };
}
export const nextId = (pre: string) => { let i = 1; while (find(pre + i)) i++; return pre + i; };
export function nextRank(): number { const r = Object.values(D.asks).map((a) => a.rank).filter((x) => x < 100); return (r.length ? Math.max(...r) : 0) + 1; }
export function raise(piece: string, text: string, source: string, x: Partial<Ask> = {}): string {
  let i = 1; while (D.asks["rn" + i]) i++;
  const id = "rn" + i;
  D.asks[id] = { id, rank: nextRank(), piece, kind: "code", source, text, how: "inplace", answered: false, ...x };
  return id;
}

// ---------------------------------------------------------------- what a run is, in words (faces, the sidebar, the agent)
/** the asks a face shows: its own, and one it shares (a collision, a group) */
export function asksFor(p: Piece): Ask[] {
  return open().filter((a) => {
    if (a.part) return a.part === p.id;
    if (a.piece === p.id) return true;
    if (((a.also as string[]) || []).includes(p.id)) return true;
    const m = /collision: (\w+) and (\w+)/i.exec(a.text);
    return !!(m && p.ai && m[2] === p.ai && D.pieces[a.piece] && D.pieces[a.piece].region === p.region);
  });
}
export type Change = { file: string; a: number; r: number; st: string };
export function changesOf(p: Piece): Change[] {
  if (!p.changes) p.changes = Array.from({ length: Math.min(p.files || 0, 40) }, (_, i) => ({ file: `src/${["auth", "api", "ui", "db"][i % 4]}/file${i + 1}.ts`, a: (i * 7) % 23 + 1, r: (i * 3) % 9, st: "waits" }));
  return p.changes as Change[];
}
export function partsSummary(p: Piece): string {
  const n: Record<string, number> = { working: 0, asks: 0, done: 0, stopped: 0, paused: 0, "taken back": 0 };
  (p.parts || []).forEach((x) => { const st = open().some((a) => a.part === x.id) ? "asks" : x.state || "working"; n[st] = (n[st] || 0) + 1; });
  const bits = ["working", "asks", "paused", "done", "stopped", "taken back"].filter((k) => n[k]).map((k) => `${n[k]} ${k}`);
  return `${(p.parts || []).length} parts: ${bits.join(", ")}`;
}
export function stateOf(p: Piece): string {
  if (p.kind === "starter") return "starting";
  const out = reachOf(p);
  if (out && !/stopped|taken back/.test(p.state || "") && p.state !== "done") return "out of reach";
  if (p.term && p.term.waiting) return "waiting";
  if (/paused|stopped|done|taken back/.test(p.state || "")) return p.state as string;
  if (asksFor(p).length || (p.parts || []).some((x) => open().some((a) => a.part === x.id))) return "asks you";
  return "working";
}
const tests = (w: unknown) => String(w || "").replace(/^tests: /, "tests ");
export function sentence(p: Piece): string {
  const st = stateOf(p), out = reachOf(p), n = p.files || 0, did = p.words ? `“${p.words}”` : `${p.copy}`;
  if (st === "out of reach") return `Out of reach since ${out?.since}: its machine stopped answering.`;
  if (p.parts && p.parts.length && !/stopped|taken back/.test(p.state || "")) return `Split into ${partsSummary(p)}.`;
  if (st === "waiting") return "Waiting for you at its terminal.";
  if (st === "paused") return p.waits ? "Waits for the other session to finish." : "Paused. Nothing runs until you resume it.";
  if (st === "stopped") return "Stopped. Its changes stay as they are.";
  if (st === "taken back") return "Taken back: every change it made is undone.";
  if (st === "done") {
    const w = changesOf(p).filter((c) => c.st === "waits").length, ac = changesOf(p).filter((c) => c.st === "accepted").length;
    return w ? `Done: ${w} change${w === 1 ? "" : "s"} wait for your word${ac ? `, ${ac} accepted` : ""}.` : `Done: all ${ac} changes accepted.`;
  }
  if (st === "asks you") return `Asks you one thing about ${did}.`;
  if (!n) return `Starting on ${did}.`;
  return `Working on ${did}: ${n} file${n === 1 ? "" : "s"} so far, ${tests(p.term && p.term.stateWord)}.`;
}

// ---------------------------------------------------------------- the open starter that takes the keys
let focus: { id: string; d: Data } | null = null;
/** the open starter card, if one takes the keys now (runs.js focused) */
export function focused(): Piece | null {
  return focus && focus.d === D && D.pieces[focus.id] && D.pieces[focus.id].kind === "starter" ? D.pieces[focus.id] : null;
}
export const setFocus = (id: string | null) => { focus = id ? { id, d: D } : null; };
export const focusId = () => focused()?.id ?? null;
export function cycleAI(c: Piece, dir = 1): void {
  const ns = aiNames();
  if (!ns.length) return;
  c.ai = ns[(ns.indexOf(c.ai || "") + dir + ns.length) % ns.length];
  c.reach = setOf(c.ai).reach;
}
/** the open part of a split job at Near, if one is open */
export function openPartOf(): Piece | null {
  const p = S.piece ? D.pieces[S.piece] : undefined;
  return S.part && p && p.parts ? p.parts.find((x) => x.id === S.part) || null : null;
}
/** the part columns at a width (runs.js / views/near.js split) */
export const partCols = (w: number) => (w >= 1500 ? 4 : w >= 1000 ? 2 : 1);
/** a session's word for the sidebar, the face and the Near head (views/near.js stateWords) */
export function stateWords(p: Piece): { lead: string; more: string } {
  const a = p.part ? asksFor(p) : open().filter((x) => x.piece === p.id);
  if (p.term && p.term.waiting) return { lead: "Waiting for you at its terminal", more: p.term.stateWord };
  if (a.length) return { lead: a.length === 1 ? "Has a question" : `Has ${a.length} questions`, more: p.term ? p.term.stateWord : "" };
  return { lead: p.state === "working" ? "Working" : p.state || "Working", more: p.term ? p.term.stateWord : "" };
}
