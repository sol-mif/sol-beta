// The engine the ported session view reads on the dev page and in tests (#1615, BR1 "the session view is a port"): the
// fixture never runs a real engine, so the old face's own panes (useWork, WorkTalk, Composer, the Rail) are given one
// that answers the work.* messages they send with the scenario's words. work.open answers the piece's talk as the thread
// (its "you: …" lines the person's, the rest its AI's) and its terminal as one Bash step; work.list answers every session
// piece; work.say echoes the line and says the fixture has no AI; work.diff answers the piece's files as small patches
// (the changes pane); work.term.* is a shell that echoes, its first screen the piece's terminal (the terminal pane, its
// keys counted in S.c.recv for the counts); any other ask (a message with a rid) is answered empty, so
// nothing waits. Live, the face's own link (cv/wire/near.ts engine()) is used instead and this file is never loaded.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { D, S, type Piece } from "../cv/index.ts";
import type { Engine } from "../cv/wire/types.ts";

type Msg = { type?: string; sessionId?: string; rid?: string; text?: string; [k: string]: unknown };
type Item = { id: string; kind: string; [k: string]: unknown };

/** a piece's talk and terminal as the old face's thread items (pure) */
export function itemsOf(p: Piece): Item[] {
  const out: Item[] = [];
  (p.talk || []).forEach((l, i) => {
    const at = l.indexOf(": "), who = at < 0 ? "" : l.slice(0, at), t = at < 0 ? l : l.slice(at + 2);
    // "compact: …" is the summary mark (room made), as the engine says it after it folds the talk; "tool: <command>" a
    // step that worked, "tool!: <command>" one that did not (a run of them folds to one summary line)
    if (who === "tool" || who === "tool!") { out.push({ id: `${p.id}:t${i}`, kind: "tool", name: "Bash", input: { command: t, description: t }, done: true, ok: who === "tool", out: "" }); return; }
    out.push(who === "you" ? { id: `${p.id}:t${i}`, kind: "me", text: t } : who === "compact" ? { id: `${p.id}:t${i}`, kind: "compact", text: t } : { id: `${p.id}:t${i}`, kind: "you", text: t });
  });
  const lines = (p.term?.lines ?? []).filter((l) => l && !/\$ _$/.test(l));
  if (lines.length) out.push({ id: `${p.id}:term`, kind: "tool", name: "Bash", input: { command: lines[0].replace(/^.*?\$ /, ""), description: p.term?.stateWord || "the terminal" }, done: true, ok: !lines.some((l) => /✕|fail/i.test(l)), out: lines.join("\n") });
  return out;
}

const sessions = () => Object.values(D.pieces).filter((p) => p.kind === "session" && !p.part).map((p) => ({
  id: String(p.sessionId ?? p.id), title: String(p.name ?? ""), cwd: `~/${p.copy ?? "work"}`, project: `~/${p.copy ?? "work"}`, branch: p.branch, updatedAt: Number(p.last ?? Date.now()),
  ...(p.seat === "codex" ? { seat: "codex" } : {}),
}));
const pieceOf = (sid: string) => Object.values(D.pieces).find((p) => String(p.sessionId ?? p.id) === sid);
/** the session piece whose folder (cwd, as work.open answered it) this is */
const atCwd = (cwd: string) => Object.values(D.pieces).find((p) => p.kind === "session" && !p.part && `~/${p.copy ?? "work"}` === cwd);

/** a folder's changes as work.diff answers them (pure): one small patch for each file the piece says it touched */
export function diffOf(p: Piece | undefined) {
  const n = Math.max(0, Math.min(1000, Number(p?.files ?? 0))), dir = p?.copy ?? "work";
  const files: { path: string; status: string; add: number; del: number; patch: string }[] = Array.from({ length: n }, (_, i) => ({
    path: `src/${dir}/part-${String(i + 1).padStart(2, "0")}.ts`, status: "modified", add: 2, del: 1,
    patch: `@@ -${i * 4 + 1},3 +${i * 4 + 1},4 @@ export function part${i + 1}()\n   const at = load();\n-  return at;\n+  if (!at) throw new Error("part ${i + 1}: nothing loaded, so nothing to return yet");\n+  return at;\n   // kept`,
  }));
  // a piece with bigLines: the two shapes LIVE showed (BR1 gate 2), one generated file of that many new lines and a
  // path git names twice (an untracked file beside the tracked one)
  const big = Math.max(0, Math.min(100_000, Number(p?.bigLines ?? 0)));
  if (big) {
    files.unshift({ path: `src/${dir}/generated.json`, status: "added", add: big, del: 0, patch: `@@ -0,0 +1,${big} @@\n` + Array.from({ length: big }, (_, i) => `+  "k${i}": ${i},`).join("\n") });
    if (files[1]) files.push({ ...files[1], status: "added", add: 1, del: 0, patch: "@@ -0,0 +1,1 @@\n+// the untracked twin" });
  }
  return { files, root: `~/${dir}`, base: "main", branch: p?.branch, add: files.reduce((a, f) => a + f.add, 0), del: files.reduce((a, f) => a + f.del, 0) };
}

/** a session's stage as work.stage.get answers it (pure): a piece whose talk wrote a page (a "> /….html" step) has that
 *  page and its task list as two blocks, so the stage pane shows what a session made (BR1 session UI, builder R) */
export function stageOf(p: Piece | undefined) {
  const page = (p?.talk || []).map((l) => /> (\/\S+\.html?)\b/.exec(l)?.[1]).find(Boolean);
  if (!p || !page) return { stage: { lens: "app", tiled: true, blocks: [] }, blocks: [] };
  const at = Number(p.last ?? 0) || 1, sessions = [String(p.sessionId ?? p.id)], name = page.split("/").pop() ?? page;
  const steps = (p.talk || []).filter((l) => /^tool!?: /.test(l)).map((l) => ({ t: l.replace(/^tool!?: /, ""), st: l.startsWith("tool: ") ? "done" : "half" }));
  return {
    stage: { lens: "app", tiled: false, blocks: [{ id: "b-page", x: 12, y: 12, w: 460, h: 280, z: 1 }, { id: "b-list", x: 12, y: 304, w: 460, h: 220, z: 2 }] },
    blocks: [
      { id: "b-page", kind: "page", title: name, state: "live", versions: [{ n: 1, at, by: "ai" }], sessions,
        body: { format: "html", text: `<h1>${p.name ?? "Report"}</h1><p>What changed, why, and what to try.</p><ul><li>The token moved to the store.</li><li>The old key is read once, then deleted.</li></ul>` } },
      { id: "b-list", kind: "list", title: "its steps", state: "live", versions: [{ n: 1, at, by: "ai" }], sessions, body: { format: "json", text: JSON.stringify(steps) } },
    ],
  };
}

/** a new fixture engine: up, answering as above; its flash goes to the frame's line through `flash` */
export function fixtureEngine(flash: (t: string) => void = () => {}): Engine {
  const subs = new Set<(m: unknown) => void>();
  const emit = (m: object) => queueMicrotask(() => { for (const f of [...subs]) f(m); });
  let terms: { tid: string; cwd: string; title: string; alive: boolean; at: number }[] = [], tn = 0, seq = 0;
  const send = (m: Msg): boolean => {
    const sid = String(m.sessionId ?? "");
    // the engine refuses an id that names no session (engine work/wire.ts sid()), as a new session's "new:" one: here too,
    // so the dev page shows it as LIVE did (BR1 gate 1b)
    if (sid.startsWith("new:")) { emit(m.rid ? { type: m.type, rid: m.rid, error: "bad session id" } : { type: "work.error", sessionId: sid, message: "bad session id" }); return true; }
    if (m.type === "work.open" && sid) {
      const p = pieceOf(sid);
      emit({ type: "work.thread", sessionId: sid, items: p ? itemsOf(p) : [], cwd: `~/${p?.copy ?? "work"}`, branch: p?.branch, title: p?.name });
    } else if (m.type === "work.list") emit({ type: "work.sessions", sessions: sessions(), projects: [], groups: [], order: [], runs: [] });
    else if (m.type === "work.say" && sid) {
      const id = String(m.id ?? `say:${Date.now()}`);
      emit({ type: "work.item", sessionId: sid, item: { id, kind: "me", text: String(m.text ?? "") } });
      emit({ type: "work.item", sessionId: sid, item: { id: `${id}:a`, kind: "you", text: "This is the dev page: no AI answers here." } });
    } else if (m.type === "work.diff" && m.rid) emit({ type: m.type, rid: m.rid, ...diffOf(atCwd(String(m.cwd ?? ""))) });
    else if (m.type === "work.stage.get" && m.rid) emit({ type: m.type, rid: m.rid, ...stageOf(pieceOf(sid)) });
    // the terminal pane: a shell that echoes, its first screen the piece's terminal lines; what it is typed counts as
    // keys that reached the terminal (S.c.recv, the counts' "keys stolen")
    else if (m.type === "work.term.open" && m.rid) {
      const t = { tid: `term-${++tn}`, cwd: String(m.cwd ?? "~"), title: "zsh", alive: true, at: Date.now() };
      terms.push(t);
      emit({ type: m.type, rid: m.rid, ...t }); emit({ type: "work.terms", terms: [...terms] });
    } else if (m.type === "work.term.attach" && m.rid) {
      const t = terms.find((x) => x.tid === m.tid), lines = (atCwd(t?.cwd ?? "")?.term?.lines ?? []).filter((l) => l && !/\$ _$/.test(l));
      emit({ type: m.type, rid: m.rid, buf: [...lines, `${t?.cwd ?? "~"} $ `].join("\r\n"), seq: 0, alive: !!t });
    } else if (m.type === "work.term.in") {
      S.c.recv++;
      const data = String(m.data ?? "");
      emit({ type: "work.term.out", tid: m.tid, seq: ++seq, data: data === "\r" ? "\r\n$ " : data.replace(/[\x00-\x08\x0b-\x1f]/g, "") });
    } else if (m.type === "work.term.close") { terms = terms.filter((x) => x.tid !== m.tid); emit({ type: "work.terms", terms: [...terms] }); }
    else if (m.type === "work.term.list") emit({ type: "work.terms", terms: [...terms] });
    else if (m.rid) emit({ type: m.type, rid: m.rid });
    return true;
  };
  const noop = () => {};
  const e = {
    up: true, send, subscribe: (f: (m: unknown) => void) => { subs.add(f); return () => { subs.delete(f); }; },
    flash, settings: { defaults: {} }, setSettings: noop,
    models: { seats: [{ seat: "claude", models: ["claude-opus-5-5"], default: "claude-opus-5-5", efforts: ["high"] }] }, efforts: ["high"],
    health: null, notice: "", arrangement: null, arrange: noop, undoNote: null, refused: null, undo: noop,
    hear: noop, heardCb: { current: noop }, partialCb: { current: noop },
    threads: [], msgs: [], seat: "claude", sessionId: null, open: noop, fresh: noop,
  };
  return e as unknown as Engine;
}
