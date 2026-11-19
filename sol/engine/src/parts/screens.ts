// One Jelly, several windows onto it (#1090, src/screens.ts): the windows' record over the socket. Every change is told
// to every face as screens.state; a refusal only to the face that asked, with its line. Behind the face's switch
// `screens.two`: a face with it off never says hello, so nothing here runs for it.
//   screens.hello { win, role?, screen? }       this socket is that window; it is live until the socket closes
//   screens.get                                 -> screens.state
//   screens.role  { win, role }                 a window takes a role (anchor, stage, wall, watch, whole)
//   screens.swap  { a, b }                      two windows trade roles
//   screens.put   { block, win | null }         a block thrown onto a window; null (or "main") pulls it home
//   screens.gather { win, blocks? }             everything brought to that window (the named blocks too)
//   screens.open  { session, from?, to? }       a session opened on a window: `to`, else the stage window not `from`
//   screens.lay   { win, session, places }      a window's own layout of a session's blocks
//   screens.carry { block, title, w, h, y, over }   a block carried toward the seam: relayed to every face with the
//                                               window it came from, kept nowhere (the other window's peek, Peek.tsx)
//   screens.talk  { to }                        the talk carried from this window to `to`: roles follow (src/screens.ts)
//   screens.where { block, title, kind, ask, here, there }   a block the session just made, from the window with the
//                                               talk: Jev picks the screen. In 300 ms and 0.7: it goes to the other window
//                                               (screens.pulse there); 0.45, or late: screens.offer (its ghost at the other
//                                               window's seam, 8 s); else it stays. Nothing that has landed moves after.
//   screens.follow { seconds, presses, blocks }  follow-me from a window without the talk -> screens.followed { pick }:
//                                               a ghost of the box (never a move by itself; on "act" the next key takes it)
//   screens.point { on: [{ id, title }] }       what a window without the talk points at, relayed (kept nowhere) as
//                                               screens.pointed { from, on }: the talk's window shows it above its box
//   screens.arrange { ask, block?, here, there }   once per message sent while two windows are live: Jev picks an
//                                               arrangement (read, review, watch); 0.7 it is done; 0.45 the map shows it
//                                               dashed (screens.arrangeOffer) and screens.arrangeTake does it
//   screens.undo                                the last crossing taken back (within 8 s), as one step
//   screens.jelly { here }                      a wall seats the jelly by a block that waits: screens.jellyAt { win }
//   screens.keep  { project, blocks }           this project's arrangement kept; screens.recall { project } puts it back
// A window whose socket closes is marked gone after GONE_MS (a reload says hello again inside it): its blocks are drawn
// at home and keep their line, so the same window coming back (the screen plugged in again) gets them back.
import type { WebSocket } from "ws";
import type { Parts, Heard } from "../parts.js";
import { whereBody, readWhere, followBody, readFollow, arrangeBody, readArrange, type WinFact } from "../screensJev.js";
import { askJev } from "../screensAsk.js";
// What the person typed to the agent is a prompt: it stays on this machine. Jev is told the block, its kind and the
// windows only; `ask` in a message is read by nobody but sayHere, here (the night of 13 Nov, the orchestrator at the join).
import { keptBody, readKept } from "../screensJevKept.js";
import { keptAnswer, winName } from "../screensKeptPlan.js";
import { sayBlocks, sayHere, sayWindows } from "../screensSayPlan.js";
import { countError } from "../errcount.js";
import { arrangePlan } from "../screens.js";
import { ScreensBook, screensFile, validWin, validRole, cleanScreen, cleanPlaces, stageWindow, HOME } from "../screens.js";

let book: ScreensBook | null = null;
const GONE_MS = 1500;
const BLOCK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const nmb = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export default function (parts: Parts) {
  // every handler of this part inside one catch: a message no handler expected answers a refusal, never stops the engine
  const p = {
    atStart: parts.atStart.bind(parts),
    on: (type: string, fn: (m: any, h: Heard) => unknown) => parts.on(type, async (m: any, h: Heard) => {
      try { await fn(m, h); } catch (e) {
        countError(e, "work", typeof m?.type === "string" ? m.type : "screens.");
        // the whole state with the refusal (a bare one reads as an empty record in the face)
        try { no(h, m, "that message could not be read"); } catch { /* the socket went */ }
      }
    }),
  };
  const socks = new Map<WebSocket, string>();   // each live socket and the window it said it is
  p.atStart((e) => { book = new ScreensBook(screensFile(e.HOME)); });
  const state = () => ({ type: "screens.state", ...book!.state() });
  const told = (h: Heard) => h.everyone(state());
  const no = (h: Heard, m: any, why: string) => h.send(h.ws, { ...state(), rid: m.rid, refused: why });
  p.on("screens.hello", (m, h) => {
    if (!validWin(m.win)) return no(h, m, "which window? a short name: main, two, …");
    if (m.role !== undefined && !validRole(m.role)) return no(h, m, "no such role");
    const was = socks.get(h.ws);
    if (!book!.room(m.win)) return no(h, m, "too many windows");
    book!.hello(m.win, m.role, cleanScreen(m.screen));
    socks.set(h.ws, m.win);
    // the same socket under a new name: its old window is gone now (unless another socket still is it)
    if (was !== undefined && was !== m.win && ![...socks.values()].includes(was) && book!.gone(was)) h.everyone({ type: "screens.jellyAt", win: null });
    if (was === undefined) {
      h.ws.once("close", () => {
        const win = socks.get(h.ws);
        socks.delete(h.ws);
        if (!win) return;
        setTimeout(() => {
          if ([...socks.values()].includes(win)) return;   // it said hello again (a reload)
          if (book!.gone(win)) { h.everyone(state()); h.everyone({ type: "screens.jellyAt", win: null }); }
        }, GONE_MS);
      });
    }
    told(h);
  });
  p.on("screens.get", (m, h) => h.send(h.ws, { ...state(), rid: m.rid }));
  p.on("screens.role", (m, h) => {
    if (!validWin(m.win) || !validRole(m.role)) return no(h, m, "a window and a role");
    if (!book!.role(m.win, m.role)) return no(h, m, `no window "${m.win}"`);
    told(h);
  });
  p.on("screens.swap", (m, h) => {
    book!.by = socks.get(h.ws);
    if (!validWin(m.a) || !validWin(m.b) || !book!.swap(m.a, m.b)) return no(h, m, "two windows that are here");
    told(h);
  });
  p.on("screens.put", (m, h) => {
    book!.by = socks.get(h.ws);
    if (typeof m.block !== "string" || !BLOCK.test(m.block)) return no(h, m, "which block?");
    if (m.win !== null && m.win !== undefined && !validWin(m.win)) return no(h, m, "which window?");
    book!.put(m.block, m.win ?? null);
    told(h);
  });
  p.on("screens.gather", (m, h) => {
    book!.by = socks.get(h.ws);
    if (!validWin(m.win)) return no(h, m, "which window?");
    book!.gather(m.win, Array.isArray(m.blocks) ? m.blocks.filter((b: unknown) => typeof b === "string" && BLOCK.test(b)).slice(0, 200) : []);
    told(h);
  });
  p.on("screens.open", (m, h) => {
    if (typeof m.session !== "string" || !SESSION.test(m.session)) return no(h, m, "which session?");
    const from = validWin(m.from) ? m.from : undefined;
    const to = validWin(m.to) ? m.to : stageWindow(book!.state(), from);
    book!.open(to, m.session);
    // no stage elsewhere: the asker opens it itself (never an opened back to the window that asked: no loop)
    if (to === from) return h.send(h.ws, { type: "screens.openHere", rid: m.rid, session: m.session });
    h.everyone({ type: "screens.opened", win: to, session: m.session });
    told(h);
  });
  p.on("screens.lay", (m, h) => {
    if (!validWin(m.win) || m.win === HOME || typeof m.session !== "string" || !SESSION.test(m.session)) return no(h, m, "a window (not main) and a session");
    book!.lay(m.win, m.session, cleanPlaces(m.places));
    told(h);
  });
  p.on("screens.talk", (m, h) => {
    book!.by = socks.get(h.ws);
    const me = socks.get(h.ws);
    const holder = book!.state().windows.find((w) => w.live && (w.role === "whole" || w.role === "stage"))?.win;
    const from = me === m.to ? holder : me;   // follow-me: the window that wants the talk asks for it
    if (!from || !validWin(m.to) || !book!.talk(from, m.to)) return no(h, m, "the talk goes to a window that is here");
    told(h);
  });
  // a window as Jev reads it: its screen's size, what it holds
  const fact = (win: string, name: string, blocks: unknown, keys: boolean): WinFact => {
    const w = book!.state().windows.find((x) => x.win === win);
    const role = w?.role ?? "wall";
    return { name, w: w?.screen?.w ?? 0, h: w?.screen?.h ?? 0, side: role === "whole" || role === "anchor", talk: role === "whole" || role === "stage",
      blocks: Array.isArray(blocks) ? blocks.filter((b) => typeof b === "string").map((b: string) => b.slice(0, 60)).slice(0, 6) : [], keys };
  };
  p.on("screens.where", async (m, h) => {
    const me = socks.get(h.ws);
    const other = book!.state().windows.find((w) => w.live && w.win !== me);
    if (!me || !other || typeof m.block !== "string" || !BLOCK.test(m.block)) return;
    const t0 = Date.now();
    const answers = await askJev(whereBody({ title: str(m.title, 120), kind: str(m.kind, 16) || "page", ...(Number.isFinite(m.lines) ? { lines: m.lines } : {}) },
      "", fact(me, "this window", m.here, true), fact(other.win, "the other window", m.there, false)));
    const pick = readWhere(answers), late = Date.now() - t0 > 300;
    if (pick === "act" && !late) { book!.by = me; book!.put(m.block, other.win); told(h); h.everyone({ type: "screens.pulse", win: other.win, block: m.block }); return; }
    if (pick !== "none") h.everyone({ type: "screens.offer", block: m.block, title: str(m.title, 120), kind: str(m.kind, 16), to: other.win, until: Date.now() + 8000 });
  });
  p.on("screens.follow", async (m, h) => {
    const me = socks.get(h.ws);
    const talk = book!.state().windows.find((w) => w.live && (w.role === "whole" || w.role === "stage"));
    if (!me || !talk || talk.win === me) return h.send(h.ws, { type: "screens.followed", rid: m.rid, pick: "none" });
    const answers = await askJev(followBody(nmb(m.seconds), nmb(m.presses), fact(me, "this window", m.blocks, false), fact(talk.win, "the window with the talk", [], true)));
    h.send(h.ws, { type: "screens.followed", rid: m.rid, pick: readFollow(answers) });
  });
  p.on("screens.point", (m, h) => {
    const from = socks.get(h.ws);
    if (!from) return;
    const on = (Array.isArray(m.on) ? m.on : []).filter((x: any) => x && typeof x.id === "string" && BLOCK.test(x.id)).slice(0, 6)
      .map((x: any) => ({ id: x.id, title: typeof x.title === "string" ? x.title.slice(0, 120) : "" }));
    h.everyone({ type: "screens.pointed", from, on });
  });
  const doPlan = (plan: NonNullable<ReturnType<typeof arrangePlan>>, h: Heard) => {
    book!.by = socks.get(h.ws);
    book!.batch(() => { if (plan.put) book!.put(plan.put.block, plan.put.win); if (plan.talk) book!.talk(plan.talk.from, plan.talk.to); });
    told(h);
  };
  p.on("screens.arrange", async (m, h) => {
    const me = socks.get(h.ws);
    const other = book!.state().windows.find((w) => w.live && w.win !== me);
    if (!me || !other) return;
    const block = typeof m.block === "string" && BLOCK.test(m.block) ? m.block : undefined;
    // say where (design JEV 7), decided on this machine: the words matched against the open blocks' titles and the
    // windows' names (sayHere); no Jev, no typed word leaves. The asking window is told, so its ⌘Z takes it back
    const area = (win: string) => { const s = book!.state().windows.find((w) => w.win === win)?.screen; return s ? s.w * s.h : 0; };
    const wins = sayWindows([{ win: me, here: true, bigger: area(me) > area(other.win) }, { win: other.win, here: false, bigger: area(other.win) > area(me) }]);
    const said = sayHere(str(m.ask, 300), sayBlocks(m.open), wins, book!.state().where);
    if (said.kind === "put") {
      book!.by = me; book!.put(said.block, said.to); told(h);
      h.send(h.ws, { type: "screens.said", block: said.block, to: said.to });
      h.everyone({ type: "screens.pulse", win: said.to, block: said.block });
      return;
    }
    const answers = await askJev(arrangeBody("", [fact(me, "this window", m.here, true), fact(other.win, "the other window", m.there, false)]));
    const { to, pick } = readArrange(answers);
    const plan = pick === "none" ? null : arrangePlan(to, book!.state(), me, block);
    if (!plan) return;
    if (pick === "act") { doPlan(plan, h); h.everyone({ type: "screens.arranged", to }); return; }
    h.everyone({ type: "screens.arrangeOffer", to, roles: plan.roles, block: block ?? null, from: me, until: Date.now() + 8000 });
  });
  // the session a window shows, told by the window itself (the anchor's pearl is on the one the talk shows: design NOW
  // 06:19 #3b); only a change is told on
  p.on("screens.showing", (m, h) => {
    const me = socks.get(h.ws);
    if (!me || typeof m.session !== "string" || !SESSION.test(m.session) || book!.state().open[me] === m.session) return;
    book!.open(me, m.session);
    told(h);
  });
  p.on("screens.arrangeTake", (m, h) => {
    const me = socks.get(h.ws);
    const from = validWin(m.from) ? m.from : me;
    const plan = typeof m.to === "string" ? arrangePlan(m.to, book!.state(), from ?? "main", typeof m.block === "string" && BLOCK.test(m.block) ? m.block : undefined) : null;
    if (plan) doPlan(plan, h);
    h.everyone({ type: "screens.arrangeOffer", to: null });
  });
  p.on("screens.undo", (m, h) => { if (book!.undo(Date.now(), socks.get(h.ws))) told(h); else no(h, m, "nothing to take back"); });
  // the one jelly: on the window that draws a block waiting on the person, else home with the talk (relayed, kept nowhere)
  p.on("screens.jelly", (m, h) => { const from = socks.get(h.ws); if (from) h.everyone({ type: "screens.jellyAt", win: m.here === true ? from : null }); });
  // a block drawn on this window changed: where it stands, so the other windows pulse their seam at its height (relayed,
  // kept nowhere; design NOW 05:08 #8)
  p.on("screens.at", (m, h) => {
    const from = socks.get(h.ws);
    if (!from || typeof m.block !== "string" || !BLOCK.test(m.block) || typeof m.y !== "number" || !Number.isFinite(m.y)) return;
    h.everyone({ type: "screens.at", from, block: m.block, y: Math.max(0, Math.min(1, m.y)) });
  });
  p.on("screens.carry", (m, h) => {
    const from = socks.get(h.ws);
    if (!from || typeof m.block !== "string" || !BLOCK.test(m.block)) return;
    const n = (v: unknown, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(hi, v)) : 0);
    h.everyone({ type: "screens.carry", from, block: m.block, title: typeof m.title === "string" ? m.title.slice(0, 120) : "", ...(typeof m.kind === "string" && /^[a-z]{1,16}$/.test(m.kind) ? { kind: m.kind } : {}), w: n(m.w, 8000), h: n(m.h, 8000), y: n(m.y, 1), over: n(m.over, 1) });
  });
  p.on("screens.keep", (m, h) => {
    const project = typeof m.project === "string" ? m.project.slice(0, 200) : "";
    if (!project) return no(h, m, "which project?");
    book!.keep(project, Array.isArray(m.blocks) ? m.blocks.filter((b: unknown) => typeof b === "string" && BLOCK.test(b)) : [], Date.now(),
      { kinds: isObj(m.kinds) ? Object.fromEntries(Object.entries(m.kinds).filter(([b, k]) => BLOCK.test(b) && typeof k === "string").slice(0, 200)) as Record<string, string> : undefined,
        ...(typeof m.session === "string" && SESSION.test(m.session) ? { session: m.session } : {}) });
    told(h);
  });
  // as you left it, for another session of the same project (design JEV 3): asked once when such a session opens with
  // two windows live. The same session needs no Jev (the record already places its blocks): nothing is answered
  p.on("screens.keptAsk", async (m, h) => {
    const me = socks.get(h.ws);
    const project = typeof m.project === "string" ? m.project.slice(0, 200) : "";
    const session = typeof m.session === "string" && SESSION.test(m.session) ? m.session : "";
    const k = project ? book!.state().kept[project] : undefined;
    if (!me || !session || !k || !Object.prototype.hasOwnProperty.call(book!.state().kept, project)) return;
    const live = book!.state().windows.filter((w) => w.live);
    if (live.length < 2) return;
    const nameOfWin = (win: string) => winName(live, win);
    const answer = await keptAnswer(k, session, live, (body) => askJev(body as object), (kk) => keptBody("", { kinds: kk.kinds, talk: kk.talk, at: kk.at },
      { windows: live.map((w) => nameOfWin(w.win)), blocks: (Array.isArray(m.blocks) ? m.blocks : []).filter((b: any) => b && typeof b.title === "string" && typeof b.kind === "string").slice(0, 6).map((b: any) => ({ title: b.title.slice(0, 80), kind: b.kind.slice(0, 16) })), ask: "" }), readKept, nameOfWin);
    if (answer) h.send(h.ws, { type: "screens.kept", project, session, ...answer });
  });
  p.on("screens.recall", (m, h) => {
    book!.by = socks.get(h.ws);
    const project = typeof m.project === "string" ? m.project.slice(0, 200) : "";
    if (!project || !book!.recall(project)) return no(h, m, "nothing kept for that project");
    told(h);
  });
}
