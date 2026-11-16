// The kinds that are programs (#699, the stage's sitting 5; the design page §6): a terminal block and a browser block.
// The engine owns the program, the block holds its id, the face draws it.
//
//   terminal  body { tid, cwd, run? }   a pty here (panes.ts openTerm, the terminal pane's own); its output goes to every
//                                       face as work.term.out, xterm draws it (kinds/Terminal.tsx). The agent runs in it
//                                       (terminal_run) and reads it (terminal_read). Closing the block kills the pty; the
//                                       shell's end is a line in the ledger.
//   browser   body { url, hand, tab? }  `hand` is the wheel: "you" (the person: a child web view in the app, thing.rs
//                                       block_view_*, with their logins) or "sol" (the agent: a tab of the engine's own
//                                       browser, browser.ts, whose frames the face shows). Never both: the agent's tools
//                                       on a block the person holds are refused. A shot lays a still in the block's stills.
//
// Off (the switch sol.stage), none of this is reached: the tools route nowhere and the browser is today's.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import * as stage from "./blocks.js";
import { openTerm, getTerm, closeTerm, allTerms } from "./panes.js";
import { setBlockRouter, closeBlockTab, shotOfBlock, tabOfBlock, type ToolResult } from "../browser.js";

type Out = (m: object) => void;
let out: Out = () => {};
/** where a terminal's output goes: every face (wire.ts gives its `everyone`) */
export const setLiveOut = (f: Out) => { out = f; };

const parse = (t?: string): Record<string, unknown> => { try { const v = JSON.parse(t ?? ""); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
const bodyJson = (project: string, id: string) => parse(stage.bodyOf(project, id)?.text);
function mustKind(project: string, id: string, kind: stage.Kind): stage.Block {
  const b = stage.getBlock(project, id);
  if (!b || b.state === "dead") throw new Error(`no ${kind} block "${id}" on the stage; read lists it`);
  if (b.kind !== kind) throw new Error(`"${b.title}" is a ${b.kind}, not a ${kind}`);
  return b;
}

// ---- the terminal ----
/** what a terminal said, as plain text: colours, cursor moves and the bell taken out, carriage returns resolved (pure) */
export function plain(s: string): string {
  const t = s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")          // OSC (a title)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")                     // CSI (colour, cursor)
    .replace(/\x1b[@-Z\\-_]/g, "")                               // the rest of ESC
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  // a line rewritten in place (a progress bar): its last state
  return t.split("\n").map((l) => { const parts = l.replace(/\r$/, "").split("\r"); return parts[parts.length - 1]; }).join("\n");
}
/** the last `n` lines of a terminal's words (pure) */
export const tail = (s: string, n: number) => plain(s).replace(/\s+$/, "").split("\n").slice(-Math.max(1, n)).join("\n");

export type TermArgs = { title?: string; cwd?: string; run?: string; slot?: stage.Slot; at?: stage.At; person?: boolean };
/** a terminal block: a pty opened in the folder (the session's, by default), and the command, if any, typed into it */
export function composeTerminal(w: stage.Who, a: TermArgs): stage.Block {
  const cwd = a.cwd || w.cwd || process.cwd();
  const t = openTerm(cwd, 100, 30, out);
  out({ type: "work.terms", terms: allTerms() });
  const run = a.run?.trim();
  let b: stage.Block;
  try {
    b = stage.compose(w, { kind: "terminal", title: a.title?.trim() || run?.slice(0, 40) || "terminal", body: JSON.stringify({ tid: t.tid, cwd, ...(run ? { run } : {}) }), format: "json", ...(a.slot ? { slot: a.slot } : {}), ...(a.at ? { at: a.at } : {}), ...(a.person ? { person: true } : {}) });
  } catch (e) { closeTerm(t.tid); throw e; }
  const id = b.id, project = w.project;
  t.pty.onExit(({ exitCode }) => { stage.remark(project, id, "the terminal", `the shell ended${exitCode ? ` (${exitCode})` : ""}`); });
  if (run) t.pty.write(run + "\r");
  return b;
}
/** the pty a terminal block holds, alive */
function ptyOf(project: string, id: string) {
  mustKind(project, id, "terminal");
  const t = getTerm(bodyJson(project, id).tid);
  if (!t) throw new Error("its shell is gone (the engine started again); compose another terminal");
  return t;
}
/** words typed into a terminal block: a line ends with Enter unless `enter` is false */
export function termWrite(w: stage.Who, id: string, text: string, enter = true) {
  const t = ptyOf(w.project, id);
  if (!t.alive) throw new Error("the shell has ended; compose another terminal");
  t.pty.write(text + (enter ? "\r" : ""));
  stage.remark(w.project, id, w.by, `ran: ${text.slice(0, 120)}`);
}
/** the last lines a terminal block said, as plain text */
export function termRead(w: stage.Who, id: string, lines = 60): string {
  const t = ptyOf(w.project, id);
  return tail(t.buf, Math.min(400, lines)) + (t.alive ? "" : `\n[the shell ended${t.code ? ` (${t.code})` : ""}]`);
}

// ---- the browser ----
export type Hand = "you" | "sol";
export type BrowserBody = { url: string; hand: Hand; tab?: string };
export const browserBody = (project: string, id: string): BrowserBody => {
  const v = bodyJson(project, id);
  return { url: String(v.url ?? ""), hand: v.hand === "you" ? "you" : "sol", ...(typeof v.tab === "string" ? { tab: v.tab } : {}) };
};
/** an address as a browser block keeps it: a bare host gets http when it is this machine's, https otherwise (pure) */
export function addressOf(raw: string): string {
  const u = String(raw ?? "").trim();
  if (!u || /^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(about|data):/i.test(u)) return u;
  return (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(u) ? "http://" : "https://") + u;
}
export function composeBrowser(w: stage.Who, a: { url?: string; title?: string; hand?: Hand; slot?: stage.Slot; at?: stage.At; person?: boolean }): stage.Block {
  const url = addressOf(a.url ?? "");
  const title = a.title?.trim() || (url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 60) : "browser");
  return stage.compose(w, { kind: "browser", title, body: JSON.stringify({ url, hand: a.hand ?? "sol" }), format: "json", ...(a.slot ? { slot: a.slot } : {}), ...(a.at ? { at: a.at } : {}), ...(a.person ? { person: true } : {}) });
}
/** the wheel changes hands: the face's press. The agent's tab stays open behind (its frames resume on the way back) */
export function wheel(w: stage.Who, id: string, hand: Hand, url?: string): stage.Block {
  mustKind(w.project, id, "browser");
  const was = browserBody(w.project, id);
  const now = { ...was, hand, ...(url ? { url: addressOf(url) } : {}) };
  const b = stage.setBody(w.project, id, JSON.stringify(now));
  if (was.hand !== hand) stage.remark(w.project, id, w.by, hand === "you" ? "you took the wheel" : "sol drives");
  return b;
}
/** the person's page moved (the child web view loaded another address): the body follows, quietly */
export function at(project: string, id: string, url: string) {
  const was = browserBody(project, id);
  if (was.url === url) return;
  stage.setBody(project, id, JSON.stringify({ ...was, url }));
}
/** the session's own browser block for the agent: the newest it can drive on this stage */
function ownBrowser(w: stage.Who): stage.Block | null {
  const on = new Set(stage.getStage(w.project, w.sessionId).blocks.map((p) => p.id));
  return stage.allBlocks(w.project).find((b) => b.kind === "browser" && on.has(b.id) && browserBody(w.project, b.id).hand === "sol") ?? null;
}

/** the stills block a browser block's shots go to (one each, made the first time, open again if closed) */
const STILLS = (id: string) => `stills-${id}`.slice(0, 64);
/** a still laid in the browser block's stills: the picture kept beside the stills block's body, the body's list grows */
export function keepShot(w: stage.Who, id: string, data: Buffer, ext: "png" | "jpg" = "png"): stage.Block {
  const b = mustKind(w.project, id, "browser");
  const sid = STILLS(id);
  let s = stage.getBlock(w.project, sid);
  const old = s && s.state !== "dead" ? stage.bodyOf(w.project, sid)?.text : undefined;
  let list: { name: string; path: string; pick?: string }[] = [];
  try { const v = JSON.parse(old ?? "[]"); list = Array.isArray(v) ? v : Array.isArray(v?.stills) ? v.stills : []; } catch { list = []; }
  const dir = join(stage.blockPath(w.project, sid), "stills");
  mkdirSync(dir, { recursive: true });
  const name = `${(browserBody(w.project, id).url.replace(/^https?:\/\//, "") || b.title).slice(0, 40)} · ${new Date().toTimeString().slice(0, 5)}`;
  const path = join(dir, `${Date.now()}.${ext}`);
  writeFileSync(path, data);
  list.push({ name, path });
  s = stage.keepOne(w, sid, { kind: "shots", title: `stills · ${b.title}`.slice(0, 80), body: JSON.stringify(list), format: "json", parent: id });
  if (s.state !== "waits") s = stage.update(w, { id: sid, waits: true });
  stage.remark(w.project, id, w.by, `a shot, to ${s.title}`);
  return s;
}
/** a shot of a browser block: the picture the face took (the child web view's), else the engine's own of its page */
export async function shoot(w: stage.Who, id: string, png?: string): Promise<stage.Block> {
  mustKind(w.project, id, "browser");
  if (png) return keepShot(w, id, Buffer.from(png.replace(/^data:image\/png;base64,/, ""), "base64"));
  return keepShot(w, id, await shotOfBlock(id, browserBody(w.project, id).url || undefined, w.sessionId));
}

// the agent's browser tools, routed to a block on the session's stage (browser.ts setBlockRouter)
setBlockRouter({
  async route(sessionId, tool, a) {
    if (!sessionId) return null;
    const w = await stage.whoFor(sessionId);
    const named = typeof a?.block === "string" && a.block ? a.block : null;
    let b = named ? stage.getBlock(w.project, named) : ownBrowser(w);
    if (named && (!b || b.state === "dead" || b.kind !== "browser")) return { refuse: `no browser block "${named}" on this stage; read lists the stage` };
    if (!b) {
      if (tool !== "browser_open") return null;   // no block yet and not opening one: today's tab
      b = composeBrowser(w, { url: String(a?.url ?? "") });
    }
    const body = browserBody(w.project, b.id);
    if (body.hand === "you") return { refuse: `the person holds the wheel of "${b.title}": ask them to hand it to you (the wheel in its head), or compose another browser block` };
    return { block: b.id, url: body.url || undefined };
  },
  async after(id, url, tool, a, r, sessionId) {
    if (!sessionId) return r;
    const w = await stage.whoFor(sessionId);
    if (!stage.getBlock(w.project, id)) return r;
    const body = browserBody(w.project, id);
    const tab = tabOfBlock(id);
    if (url && url !== "about:blank" && (url !== body.url || tab !== body.tab)) {
      // the agent moved the page: the block is working a moment (the jelly travels to it), its address follows
      stage.update(w, { id, body: JSON.stringify({ ...body, url, ...(tab ? { tab } : {}) }), format: "json" });
    }
    if (tool === "browser_screenshot" && a?.keep === true) {
      const img = r.content.find((c) => c.type === "image") as { data: string } | undefined;
      if (img) {
        const s = keepShot(w, id, Buffer.from(img.data, "base64"), "jpg");
        return { content: [...r.content, { type: "text", text: `Laid in ${s.title} (${s.id}); it waits on the person's keep or cut.` }] };
      }
    }
    return r;
  },
});

// a block's program ends with it
stage.onClose((_p, b) => {
  if (b.kind === "terminal") { const tid = bodyJson(_p, b.id).tid; if (closeTerm(tid)) out({ type: "work.terms", terms: allTerms() }); }
  if (b.kind === "browser") void closeBlockTab(b.id);
});

// ---- the agent's two terminal tools, offered with the stage's six ----
export const LIVE_TOOLS = [{
  name: "terminal_run",
  description: "Run a command in a terminal block on the stage, where the person sees it run (a real shell). With `id` it is typed into " +
    "that terminal block; without, a terminal block is composed in this session's folder (or `cwd`) and the command runs in it. " +
    "Read what it said with terminal_read. Not for your own quick checks: those stay in your own shell tool.",
  shape: { command: z.string().max(4000), id: z.string().optional(), title: z.string().max(80).optional(), cwd: z.string().optional(), slot: z.enum(stage.SLOTS).optional() },
} as const, {
  name: "terminal_read",
  description: "Read the last lines a terminal block said (plain text, colours taken out). `lines` how many, 60 by default.",
  shape: { id: z.string(), lines: z.number().int().min(1).max(400).optional() },
} as const] as const;
export const LIVE_NAMES = new Set<string>(LIVE_TOOLS.map((t) => t.name));

export async function runLiveTool(name: string, a: any, self: string): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
  try {
    const w = await stage.whoFor(self);
    if (name === "terminal_run") {
      const cmd = String(a?.command ?? "");
      if (!cmd.trim()) throw new Error("terminal_run needs a command");
      if (typeof a?.id === "string" && a.id) { termWrite(w, a.id, cmd); return ok(`typed into ${a.id}: ${cmd.slice(0, 80)}. terminal_read shows what it said.`); }
      const b = composeTerminal(w, { run: cmd, ...(typeof a?.title === "string" ? { title: a.title } : {}), ...(typeof a?.cwd === "string" && a.cwd ? { cwd: a.cwd } : {}), ...(a?.slot ? { slot: a.slot } : {}) });
      return ok(`composed ${b.id} · ${b.title} · terminal, running: ${cmd.slice(0, 80)}. terminal_read with id ${b.id} shows what it said.`);
    }
    if (name === "terminal_read") return ok(termRead(w, String(a?.id ?? ""), Number(a?.lines) || 60) || "(nothing yet)");
  } catch (e) { return { ...ok(e instanceof Error ? e.message : String(e)), isError: true }; }
  return { ...ok(`unknown tool ${name}`), isError: true };
}
export type { ToolResult };
