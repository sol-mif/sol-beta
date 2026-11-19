// The orchestration stage (two kinds of session, step 4; the design #1183 §3, Marco 2026-11-14: "the stage in the
// orchestration should provide all the capabilities needed so i don't have to constantly move around"). One `session`
// block per session under an orchestrator, on the orchestrator's stage, bound to that session: the engine keeps its body
// current (each work.run of the child, its stage's change, its end) without the orchestrator composing again.
//
//   body (json)  { sessionId, title, row: { running?, failed?, unread?, done? }, run?: { busy, waiting, tasks, failed? },
//                  where: { folder, branch?, pr?: { n, state } }, last, ask?: { question, actions: [{ label }] } }
//
// The face draws the state word from row and run with the sidebar's own rowState. Every press on the block is one message
// to the engine (work.stage.session, wire.ts), and this file acts on it: a steer or an answer is one turn in the child,
// stop stops it, archive archives it. Nothing here acts without a press; composing and closing follow `under` alone.
import { basename } from "node:path";
import * as stage from "./blocks.js";
import { endsAsking, isOrchestrator } from "./one.js";
import { mark, workState } from "./state.js";
import { hashOf, isPrivate, track } from "../track.js";

export type ChildItem = { id?: string; kind: string; text?: unknown; name?: unknown; input?: unknown; out?: unknown; ok?: unknown; done?: unknown; ask?: unknown; actions?: unknown };
export type ChildSession = { id: string; title?: string; cwd?: string; branch?: string; running?: boolean; failed?: boolean; unread?: boolean; done?: boolean; archived?: boolean };
export type ChildRun = { busy: boolean; waiting: number; tasks?: unknown[]; failed?: boolean; cwd?: string };
export type ChildDeps = {
  /** the one session, as the side has it (its row and the person's marks); undefined = the engine knows none */
  session: (id: string) => Promise<ChildSession | undefined>;
  run: (id: string) => ChildRun | undefined;
  items: (id: string) => Promise<ChildItem[]>;
  /** one turn in the child (the send_message path) */
  say: (id: string, text: string) => Promise<void>;
  stop: (id: string) => Promise<void> | void;
  archive: (id: string) => void;
};
let deps: ChildDeps | null = null;
export const setChildDeps = (d: ChildDeps | null) => { deps = d; };

export type Action = { label: string; message?: string };
export type ChildBody = {
  sessionId: string; title: string;
  row: { running?: boolean; failed?: boolean; unread?: boolean; done?: boolean };
  run?: { busy: boolean; waiting: number; tasks: number; failed?: boolean };
  where: { folder: string; branch?: string; pr?: { n: number; state: "open" | "draft" | "ready" | "merged" | "closed" } };
  last: string;
  ask?: { question: string; actions: { label: string }[] };
};

/** the block a child has on its orchestrator's stage: one id per child, so it is found again and never doubled */
export const blockIdOf = (child: string) => `s-${child.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`.slice(0, 64);
const LAST = 160;
const oneLine = (t: string) => t.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").replace(/\s+/g, " ").trim();
const cut = (t: string, n = LAST) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** the PR the child's own gh calls name, and where it stands as those calls left it (pure); none = the engine knows none */
export function prOf(items: ChildItem[]): ChildBody["where"]["pr"] {
  let pr: ChildBody["where"]["pr"];
  for (const i of items) {
    if (i.kind !== "tool" || String(i.name) !== "Bash" || i.ok === false) continue;
    const cmd = String((i.input as { command?: unknown } | undefined)?.command ?? "");
    const m = /\bgh\s+pr\s+(create|view|merge|ready|close|edit|checks|status)\b/.exec(cmd);
    if (!m) continue;
    const out = String(i.out ?? ""), url = /\/pull\/(\d+)/.exec(out) ?? /\/pull\/(\d+)/.exec(cmd), arg = /\bgh\s+pr\s+\w+\s+#?(\d+)\b/.exec(cmd);
    const n = Number(url?.[1] ?? arg?.[1] ?? pr?.n ?? 0);
    if (!n) continue;
    const said = /"state"\s*:\s*"(OPEN|MERGED|CLOSED)"/.exec(out)?.[1], draft = /"isDraft"\s*:\s*(true|false)/.exec(out)?.[1];
    const state = m[1] === "merge" ? "merged" : m[1] === "close" ? "closed" : m[1] === "ready" ? "ready"
      : said === "MERGED" ? "merged" : said === "CLOSED" ? "closed" : draft === "true" ? "draft" : draft === "false" ? "ready"
      : m[1] === "create" ? (/--draft\b/.test(cmd) ? "draft" : "open") : pr?.n === n ? pr.state : "open";
    pr = { n, state };
  }
  return pr;
}

/** a child's block body from what the engine holds of it (pure): its row, its run, its items */
export function bodyOf(s: ChildSession, r: ChildRun | undefined, items: ChildItem[]): ChildBody {
  const said = items.filter((i) => i.kind === "you" && String(i.text ?? "").trim());
  const words = String(said[said.length - 1]?.text ?? "");
  const lines = oneLine(words);
  let me = items.length - 1; while (me >= 0 && items[me].kind !== "me") me--;
  const wrap = items.slice(me + 1).reverse().find((i) => i.kind === "wrap");
  const actions = Array.isArray(wrap?.actions) ? (wrap!.actions as Action[]).filter((a) => a && typeof a.label === "string" && a.label.trim()) : [];
  const asking = !r?.busy && (endsAsking(words) || (typeof wrap?.ask === "string" && !!wrap.ask.trim()));
  const question = typeof wrap?.ask === "string" && wrap.ask.trim() ? wrap.ask.trim() : (lines.match(/[^.!?]*\?\s*$/)?.[0] ?? lines).trim();
  const pr = prOf(items), folder = r?.cwd || s.cwd || "";
  return {
    sessionId: s.id, title: s.title || "untitled",
    row: { ...(s.running ? { running: true } : {}), ...(s.failed ? { failed: true } : {}), ...(s.unread ? { unread: true } : {}), ...(s.done ? { done: true } : {}) },
    ...(r ? { run: { busy: r.busy, waiting: r.waiting, tasks: r.tasks?.length ?? 0, ...(r.failed ? { failed: true } : {}) } } : {}),
    where: { folder: folder ? basename(folder) : "", ...(s.branch ? { branch: s.branch } : {}), ...(pr ? { pr } : {}) },
    last: cut(lines),
    ...(asking ? { ask: { question: cut(question, 300), actions: actions.map((a) => ({ label: a.label.trim().slice(0, 40) })) } } : {}),
  };
}
/** the block's frame state: it waits while the child needs the person, works while the child works, else is live */
export const stateOf = (b: ChildBody): stage.State => (b.run?.waiting || b.ask ? "waits" : b.run?.busy || b.run?.tasks ? "working" : "live");
const word = (b: ChildBody) => (b.run?.waiting ? "needs you" : b.run?.busy || b.run?.tasks || b.row.running ? "working" : (b.run ? b.run.failed : b.row.failed) ? "failed" : b.row.unread || b.row.done ? "done" : "idle");

async function factsOf(child: string): Promise<ChildBody | null> {
  if (!deps) return null;
  const s = await deps.session(child).catch(() => undefined);   // the one session, never a scan of them all per refresh
  const items = await deps.items(child).catch(() => [] as ChildItem[]);
  const mk = workState().marks[child] ?? {};   // the person's marks (unread, done) are the row's, as the side reads them
  return bodyOf({ ...(s ?? { id: child }), ...(mk.unread ? { unread: true } : {}), ...(mk.done ? { done: true } : {}) }, deps.run(child), items);
}

const live = (b: stage.Block | null): b is stage.Block => !!b && b.state !== "dead";
/** a child's block on its orchestrator's stage: composed in the next free cell the first time, put back when it was
 *  closed, kept current from then on. Signed by the engine, never the orchestrator's own compose */
export async function bind(orch: string, child: string): Promise<stage.Block | null> {
  if (orch === child) return null;
  const w = { ...(await stage.whoFor(orch)), by: "the engine" };
  const id = blockIdOf(child), had = stage.getBlock(w.project, id);
  const body = await factsOf(child) ?? bodyOf({ id: child }, undefined, []);
  if (!had) {
    stage.compose(w, { kind: "session", id, title: body.title, body: JSON.stringify(body), format: "json", slot: "cell", person: true });
  } else {
    if (had.state === "dead" || !stage.getStage(w.project, orch).blocks.some((p) => p.id === id)) stage.reopen(w, { id });
    if (!had.sessions.includes(orch)) stage.place(w, { id, slot: "cell" });
  }
  return take(w.project, id, body);
}
/** a child let go (released, put under another, its orchestrator demoted): its block closes */
export async function unbind(orch: string, child: string): Promise<void> {
  const w = { ...(await stage.whoFor(orch)), by: "the engine" };
  const b = stage.getBlock(w.project, blockIdOf(child));
  if (live(b)) stage.place(w, { id: b.id, close: true });
}
/** a body written when it changed, its title and frame state with it; the state word's move is one ledger line */
function take(project: string, id: string, body: ChildBody): stage.Block | null {
  const b = stage.getBlock(project, id);
  if (!live(b) || b.kind !== "session") return b;
  const was = (() => { try { return JSON.parse(stage.bodyOf(project, id)?.text ?? "") as ChildBody; } catch { return null; } })();
  const text = JSON.stringify(body), state = stateOf(body);
  if (was && JSON.stringify(was) === text && b.state === state && b.title === body.title) return b;
  if (b.title !== body.title) stage.retitle(project, id, body.title);
  stage.setBody(project, id, text, "json");
  if (b.state !== state) stage.setState(project, id, state);
  if (was && word(was) !== word(body)) stage.remark(project, id, "the engine", `${word(was)} → ${word(body)}`, state === "waits" ? "waits" : "ran");
  return stage.getBlock(project, id);
}
/** the child's block read afresh (pure but for the store): found on its orchestrator's project, never composed here */
export async function refresh(child: string): Promise<stage.Block | null> {
  const orch = workState().marks[child]?.under;
  if (!orch || !isOrchestrator(orch)) return null;
  if (workState().marks[child]?.archived) { await archived(child); return null; }   // archived anywhere: its block goes
  const w = await stage.whoFor(orch);
  if (!live(stage.getBlock(w.project, blockIdOf(child)))) return null;
  const body = await factsOf(child);
  return body ? take(w.project, blockIdOf(child), body) : null;
}

// ---- what the engine hears (wire.ts's bus): the child's run, its stage, its end refresh its block, a burst once
const soon = new Map<string, NodeJS.Timeout>();
export const QUIET_MS = 250;
export function hears(m: { type?: string; sessionId?: string; block?: { kind?: string } }) {
  const id = m.sessionId;
  if (!id || (m.type !== "work.run" && m.type !== "work.closed" && m.type !== "work.stage.changed")) return;
  if (m.type === "work.stage.changed" && m.block?.kind === "session") return;   // our own write: never a loop
  if (!workState().marks[id]?.under) return;
  clearTimeout(soon.get(id));
  soon.set(id, setTimeout(() => { soon.delete(id); void refresh(id).catch(() => {}); }, QUIET_MS));
}

// ---- where `under` changes, each counted (docs/analytics/tracking.md, "build"): a sub session started, a session folded
// under an orchestration session or let loose, by how; both sessions as salted hashes, never a title
const counted = (name: string, orch: string, child: string, how: string) => {
  if (!isPrivate(child) && !isPrivate(orch)) track(name, { orch: hashOf(orch), sess: hashOf(child), how }, { mode: "work" });
};
/** a session archived anywhere (the side, the sweep, an agent's archive tool, a press here): its block closes and it is
 *  under nothing from then on. Its parent stays: where it came from is history, who runs it is not */
export async function archived(child: string): Promise<void> {
  const orch = workState().marks[child]?.under;
  if (!orch) return;
  mark(child, { under: null });
  counted("build.session.unfold", orch, child, "archived");
  if (isOrchestrator(orch)) await unbind(orch, child).catch(() => {});
}
/** work.under: the old orchestrator's block closes, the new one's is composed */
export async function moved(child: string, to: string | null, was: string | undefined, how = "hand") {
  if (was && was !== to) counted("build.session.unfold", was, child, how);
  if (to && to !== was) counted("build.session.fold", to, child, how);
  if (was && was !== to && isOrchestrator(was)) await unbind(was, child).catch(() => {});
  if (to && isOrchestrator(to)) await bind(to, child).catch(() => {});
}
/** an orchestration session's start_session (wire.ts startFrom with `under`): it runs what it starts, so the child is
 *  marked under it as well as parent, and its block is composed. A normal session's start is never under anything */
export async function started(from: string, child: string): Promise<boolean> {
  if (!isOrchestrator(from) || from === child) return false;
  mark(child, { under: from });
  counted("build.session.start", from, child, "start");
  await bind(from, child).catch(() => {});
  return true;
}
/** work.kind promote: one block per session already under it; the live ones it had started before (one.ts promote's
 *  `adopted`) are counted as folded by the promote */
export async function promoted(orch: string, adopted: string[] = []) {
  for (const id of adopted) counted("build.session.fold", orch, id, "promote");
  for (const [id, m] of Object.entries(workState().marks)) if ((m as { under?: string }).under === orch && id !== orch) await bind(orch, id).catch(() => {});
}
/** work.kind demote: the blocks of the sessions let loose close */
export async function demoted(orch: string, loose: string[]) { for (const id of loose) { counted("build.session.unfold", orch, id, "demote"); await unbind(orch, id).catch(() => {}); } }

// ---- the presses (work.stage.session): one message each, from the orchestrator's stage
export const PRESSES = ["steer", "answer", "stop", "archive"] as const;
export type Press = (typeof PRESSES)[number];
export async function press(orch: string, a: { id: string; press: string; text?: string; i?: number; label?: string }): Promise<string> {
  if (!deps) throw new Error("the stage's sessions are not wired yet");
  if (!(PRESSES as readonly string[]).includes(a.press)) throw new Error(`a press is one of ${PRESSES.join(", ")}`);
  const w = { ...(await stage.whoFor(orch)) };
  const b = stage.getBlock(w.project, String(a.id));
  if (!live(b) || b.kind !== "session") throw new Error(`no session block "${a.id}"`);
  if (!b.sessions.includes(orch)) throw new Error(`the block "${a.id}" is not on this session's stage`);
  const body = (() => { try { return JSON.parse(stage.bodyOf(w.project, b.id)?.text ?? "") as ChildBody; } catch { return null; } })();
  const child = body?.sessionId;
  if (!child) throw new Error("the block names no session");
  const by = w.by.replace(/'s agent/, "");
  if (a.press === "steer") {
    const text = String(a.text ?? "").trim().slice(0, 8000);
    if (!text) throw new Error("nothing to send");
    await deps.say(child, text);
    stage.remark(w.project, b.id, by, `sent: ${cut(oneLine(text), 80)}`);
    return "sent; it runs as a turn there";
  }
  if (a.press === "answer") {
    // the button's words are the child's own wrap-up, read again here: the face names the button, never the text
    const items = await deps.items(child).catch(() => [] as ChildItem[]);
    let me = items.length - 1; while (me >= 0 && items[me].kind !== "me") me--;
    const wrap = items.slice(me + 1).reverse().find((i) => i.kind === "wrap");
    const acts = Array.isArray(wrap?.actions) ? (wrap!.actions as Action[]).filter((x) => x && typeof x.label === "string" && x.label.trim()) : [];
    // the button the face showed, by its place and its words both: a wrap-up that changed since is another button
    const act = Number.isInteger(a.i) ? acts[a.i!] : undefined;
    if (!act || typeof a.label !== "string" || act.label.trim() !== a.label.trim()) {
      await refresh(child).catch(() => null);   // the face redraws the buttons there are now
      throw new Error("that button is gone: the session has moved on");
    }
    const text = (act.message ?? "").trim() || act.label.trim();
    await deps.say(child, text);
    stage.remark(w.project, b.id, by, `pressed "${act.label.trim()}"`);
    return "sent; it runs as a turn there";
  }
  if (a.press === "stop") { await deps.stop(child); stage.remark(w.project, b.id, by, "stopped it"); return "stopped"; }
  deps.archive(child);
  stage.remark(w.project, b.id, by, "archived it");
  stage.place({ ...w, by }, { id: b.id, close: true });   // archived: off the side and off this stage, its ledger kept
  await archived(child);   // and under nothing
  return "archived";
}
