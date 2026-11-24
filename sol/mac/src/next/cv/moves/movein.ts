// owned by slice 11 (the move-in), docs/port/slices.md "Night 2, outlined"
// The move-in's moves (round 6 · M1, #1615; merge/movein.js, named after their functions), merged into M by
// moves/index.ts:
//   move_in(name)               open the screen for this canvas, with the choices as they stand ("Add your files and AI chats")
//   move_in_row(id, what, val)  keep (Bring back), fix (a new name) or drop one row
//   move_in_answer(uid, a, l)   answer an unsure row ("reopen" takes the answer back)
//   move_in_skip(uid)           "Ask me later": kept as it is, one Needs-you ask once the person goes on
//   move_in_close()             Back: the screen closes keeping nothing of it (Esc too)
//   these_are_mine(skip)        the canvas loaded again holding exactly the kept rows, on Far, with the Moved-in card
// Each answers { ok, id, undo }. Live they answer { ok: false, why: "not yet" } until the engine's next.movein.read has
// answered (BR1: carry.ts with Claude Code and Codex); live, These are mine sends next.movein.keep and applies the choices
// to the folders drawn (movein/live.ts keepLive). On the fixture the choices are applied at every load (hooks.onLoad),
// with one Diary line for the move and one per change. Signed: marcocyl04-ux's agent, port slice 11 (#1615).
import { D, M, MODE, S, done, hooks, load, notYet, render, type Done, type Moves } from "../core.ts";
import { DATA, answerTo, apply as applyTo, blank, copy, linesOf, rowMove, skipAll, unanswer, type Choices } from "../../movein/data.ts";
import { DONE, EDIT, can, ed, here, personOf, st } from "../../movein/state.ts";
import { applyLive, backLive, keepLive } from "../../movein/live.ts";
import { show } from "../../movein/mount.ts";
import { note } from "../../people/diary.ts";
import { joinQueue } from "../../movein/extra.ts";   // the Needs-you provider, the seen card, the Settings row
import { migOf, steps } from "../../movein/plan.ts";   // the migration (migration.html C)
import { endCard } from "../../learn/learn-state.ts";   // BR1 learn.html part 1: the end card, once the canvas holds the folders

/** the choices of the open canvas, put back as they were (a move's undo) */
const keep = (name: string) => { const was = copy(ed(name)); return () => { EDIT[name] = was; render(); }; };
/** Seats does the renewing (slice 6b's sign_in, when it is there) */
const seat = (id: string) => { if (typeof M.sign_in === "function") M.sign_in(id, "wait"); };

const own = {
  move_in(name: string = here()): Done {
    if (!personOf(name)) return done(false);
    if (!EDIT[name] || !st.open && DONE[name]) EDIT[name] = copy(DONE[name] || blank());
    const was = st.open;
    st.open = name; show(true); render();
    return done(true, name, () => { st.open = was; show(!!was); render(); });
  },
  move_in_row(id: string, what: "keep" | "fix" | "drop", val?: unknown): Done {
    const name = st.open, p = personOf(name);
    if (!name || !p) return done(false);
    const undo = keep(name);
    if (!rowMove(p, ed(name), id, what, val)) return done(false);
    render();
    return done(true, id, undo);
  },
  move_in_answer(uid: string, a: string, label?: string): Done {
    const name = st.open, p = personOf(name), u = p?.unsure.find((x) => x.id === uid);
    if (!name || !u) return done(false);
    const undo = keep(name), c = ed(name);
    if (a === "reopen") { unanswer(c, u); delete c.later[uid]; } else answerTo(c, u, a, label ?? a, seat);
    render();
    return done(true, uid, undo);
  },
  move_in_skip(uid: string): Done {
    const name = st.open, p = personOf(name);
    if (!name || !p) return done(false);
    const undo = keep(name), c = ed(name);
    unanswer(c, p.unsure.find((x) => x.id === uid) || { id: uid, opts: [] });
    c.later[uid] = 1;
    render();
    return done(true, uid, undo);
  },
  /** the migration (migration.html C, movein/plan.ts): "ok" Looks right, "no" a move left as it was, "ans" an ask's
   *  answer (a the folder, b "keep" | "shelf" | "into:<folder>"), "skip" to the overview, "to" a step (a its number from
   *  0), "again" from the first move. An ask put on the Shelf is a drop, as Remove is */
  move_in_mig(what: "ok" | "no" | "ans" | "skip" | "to" | "again", a?: string | number, b?: string): Done {
    const name = st.open, p = personOf(name), plan = p?.plan;
    if (!name || !plan) return done(false);
    const undo = keep(name), c = ed(name), m = migOf(c), n = steps(plan), mv = plan.moves[m.at];
    if (what === "ok" || what === "no") {
      if (m.at >= plan.moves.length) return done(false);
      if (what === "no") m.no[mv.id] = 1; else delete m.no[mv.id];
      m.at++;
    } else if (what === "ans") {
      const ask = plan.asks.find((x) => x.folder === a);
      if (!ask || typeof b !== "string" || !/^(keep|shelf|into:.+)$/.test(b)) return done(false);
      m.ans[ask.folder] = b;
      if (b === "shelf") c.drop[ask.folder] = 1; else delete c.drop[ask.folder];
      m.at = Math.max(m.at, plan.moves.length + plan.asks.indexOf(ask)) + 1;
    } else if (what === "skip") { if (m.at < n) m.skip = Math.min(m.skip ?? n, m.at); m.at = n; }
    else if (what === "to" && typeof a === "number" && a >= 0 && a <= n) m.at = a;
    else if (what === "again") { m.at = 0; delete m.skip; }
    else return done(false);
    m.at = Math.min(m.at, n);
    render();
    return done(true, String(m.at), undo);
  },
  /** Back (BR1 first-timer P 1): the screen closes and nothing of it is kept, the canvas as it was before it opened;
   *  its Undo opens it again with the changes made there */
  move_in_close(): Done {
    const name = st.open;
    if (!name) return done(false);
    const was = EDIT[name] ? copy(EDIT[name]) : null;
    delete EDIT[name];
    st.open = null; show(false); render();
    return done(true, name, () => { if (was) EDIT[name] = was; st.open = name; show(true); render(); });
  },
  these_are_mine(skip?: boolean): Done {
    const name = st.open, p = personOf(name);
    if (!name || !p) return done(false);
    const c = ed(name), before = DONE[name] ? copy(DONE[name]) : null;
    if (skip) skipAll(p, c);
    // the apps' page has no "Later" (BR1 card check): a question left open is the same as Later, one Needs-you ask
    else if (p.apps) for (const u of p.unsure) if (!c.done[u.id]) c.later[u.id] = 1;
    DONE[name] = copy(c); DONE[name].seen = 1; delete EDIT[name];
    joinQueue();
    st.open = null; show(false);
    // opened from Settings (it stays under the screen, so Back returns there): kept, the canvas is what comes next
    if (S.page === "settings") M.page(null);
    const settle = () => (MODE === "fixture" ? load(name) : keepLive(DONE[name] || blank()));
    settle();
    if (S.dist !== "far") M.map();
    render();
    // the move-in's end (learn.html part 1): "You're in. Want a quick look around?", once, when the canvas holds folders
    if (D.regions.length) endCard();
    // its Undo is the move-in's one Back: live, the engine takes the whole batch out and puts its answers back as they
    // were (next.movein.back), never a keep again; refused once the person changed things, the read opens again (keptHeard)
    return done(true, name, () => {
      if (before) DONE[name] = before; else delete DONE[name];
      if (MODE === "fixture" || !backLive()) settle(); else applyLive();
      render();
    });
  },
};

/** live, every move-in move waits for the engine's read; the fixture runs them all */
const moves: Moves = {};
for (const [k, f] of Object.entries(own)) moves[k] = (...a: unknown[]) => (can() ? (f as (...x: unknown[]) => Done)(...a) : notYet());
export default moves;

// ---------------------------------------------------------------- at every load: the choices made, and their Diary lines

hooks.onLoad.push((D, name) => {
  const p = DATA[name], c: Choices | undefined = DONE[name];
  if (!p || !c) return;
  applyTo(D, p, c);
  for (const l of linesOf(name, p, c)) note({ who: "person", kind: "decided", key: l.key, what: l.what, why: l.why });
});

// ---------------------------------------------------------------- the dev page: ?movein=1 (the screen before the first draw), #movein

let booted = false;
hooks.onLoad.push((_D, name) => {
  if (booted || typeof location === "undefined") return;
  booted = true;
  const U = new URLSearchParams(location.search);
  if (!U.get("movein") || !DATA[name]) return;
  st.open = name; EDIT[name] = blank(); show(true);
  /* steps for stills: &mv=drop:money,fix:web:web app,later:u1,ans:u2|keep|Remind me Thursday,mine (run once the store is whole) */
  const steps = (U.get("mv") || "").split(",").filter(Boolean);
  if (steps.length) queueMicrotask(() => {
    for (const s of steps) {
      const k = s.split(":")[0], [a, b, l] = k === "ans" ? s.slice(4).split("|") : s.split(":").slice(1);
      if (k === "drop") M.move_in_row(a, "drop"); else if (k === "fix") M.move_in_row(a, "fix", b); else if (k === "later") M.move_in_skip(a);
      else if (k === "ans") M.move_in_answer(a, b, l); else if (k === "mine") M.these_are_mine();
    }
  });
});
if (typeof window !== "undefined") window.addEventListener("hashchange", () => {
  if (location.hash !== "#movein") return;
  history.replaceState(null, "", location.pathname + location.search);
  if (S.page === "settings") M.page(null);
  M.move_in();
});
