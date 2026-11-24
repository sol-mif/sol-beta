// owned by slice R8 (fits you can see and take back), docs/port/slices.md
// The fits' moves (round 8, #1615; merge/fits.js, as it is), each named after its function and merged into M by
// moves/index.ts. Live, their engine row (harmony S15, fits.ts; #1617) is not there yet, so each answers
// { ok: false, why: "not yet" } and the views draw nothing for them; the fixture runs them all.
//   keep_fit(id) · not_now_fit(id)   the person's answer to an offer (a mode's waits for the weekly summary)
//   back_fit(id)                      takes it off and holds kind@thing: Sol never makes or offers it there again
//   let_go_hold(id)                   "Let Sol suggest it again"
//   set_reach('ask'|'small'|'off')    "When I see a better fit for you, may I make it?"
//   remove_fact(id)                   a line of What I've learned goes; undo puts it back
//   land_on_fit(id)                   to the knob in its folder at Middle, ringed, its why open (no folder: Who set what)
// The AI's side (agent.js): every one is the person's.
// Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import { MODE, hooks, notYet, type Done, type Moves } from "../core.ts";
import { MOVE_FN, PERSON_ONLY } from "../../agent/calls.ts";
import { change, fitOf, land, onLoad, ui } from "../../fits/state.ts";
import { TUNE, hk, type Reach } from "../../fits/rules.ts";

const no = (): Done => ({ ok: false, why: "no such fit", undo: () => {} });
const own: Moves = {
  keep_fit(id: string): Done { const f = fitOf(id); return f ? change((s) => { s.decided[id] = { v: "keep", day: 0 }; }, `Kept: ${f.value}`, id) : no(); },
  not_now_fit(id: string): Done { const f = fitOf(id); return f ? change((s) => { s.decided[id] = { v: "notnow", day: 0 }; }, "Not now. Asked again in four weeks at most.", id) : no(); },
  back_fit(id: string): Done { const f = fitOf(id); return f ? change((s) => { s.backs[id] = 0; }, `Taken back: ${f.value}. A hold now: I won’t do it again.`, id) : no(); },
  let_go_hold(id: string): Done { const f = fitOf(id); return f ? change((s) => { s.released[hk(f)] = 1; }, `I may suggest it again: ${f.value}`, id) : no(); },
  set_reach(v: Reach): Done {
    const t = TUNE.find((x) => x.id === v);
    return t ? change((s) => { s.reach = v; s.asked = true; }, `When I see a better fit: ${t.n}`, v) : { ...no(), why: "no such reach" };
  },
  remove_fact(id: string): Done {
    const k = String(id), r = change((s) => { s.gone[k] = 1; }, "Removed. I stop using it now.", k);
    if (r.ok) ui.removed = { t: k, undo: () => { r.undo(); ui.removed = null; } };
    return r;
  },
  land_on_fit(id: string): Done { return land(id); },
};

// the month's Diary lines, after the diary's own seed (life.ts, earlier in the moves' order)
hooks.onLoad.push(onLoad);

/** live: the engine has none of these yet (harmony S15; #1617) */
const moves: Moves = {};
for (const [name, f] of Object.entries(own)) moves[name] = (...a: unknown[]) => (MODE === "live" ? notYet() : f(...a));
export default moves;

// the AI's side (agent.js round 8): each move meets a function; all of them are the person's
for (const n of ["keep_fit", "not_now_fit", "back_fit", "let_go_hold", "set_reach", "remove_fact"]) PERSON_ONLY[n] = "setting";
PERSON_ONLY.land_on_fit = "camera";
Object.assign(MOVE_FN, { keep_fit: "offer", not_now_fit: "offer", back_fit: "take_back", let_go_hold: "offer", set_reach: "offer", remove_fact: "offer", land_on_fit: "find" });
