// The move-in's seams (round 6 · M1, #1615; merge/movein.js): what it adds to the other slices' views, each from here.
//   the Needs-you provider   (joined at the first move-in) an unsure row left for later is one ask, mv:<scn>:<uid>, at the top of Needs you, counted
//                            once by above() (people/extra.ts register); answered there it writes one Diary line and,
//                            when the answer drops or merges a row, the canvas is loaded again without it
//   hooks.seen               the "Moved in · Change any of it" card under the Diary's headline (diary/index.tsx draws it)
//   hooks.stRows             "Add your files and AI chats" in Settings › How your AIs work (settings/index.tsx draws it): live it
//                            asks the engine to read Claude Code, Codex and Sol's folders again, and opens the screen
//   hooks.stRows             "What you see first" in Settings › How it looks and reads (Lead.tsx LeadRow, BR1)
//   the AI's maps            the five moves, each mapped to the function an AI uses for the same end, and person-only
//                            (agent.js round 6: MOVE_FN and PERSON_ONLY, so count 13 holds)
// Signed: marcocyl04-ux's agent, port slice 11 (#1615).
import { createElement, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { MODE, hooks, load, render } from "../cv/core.ts";
import { show } from "./mount.ts";
import { register, type ExtOpen, type Provider } from "../people/extra.ts";
import { MOVE_FN, PERSON_ONLY } from "../agent/calls.ts";
import { DATA, answerTo, blank, gone, tally, type Unsure } from "./data.ts";
import { DONE, EDIT, clear, ed, here, personOf, st } from "./state.ts";
import { applyLive } from "./live.ts";

/** the parts are views (parts.tsx, with their CSS): loaded when first drawn, so the store stays plain modules */
const part = <P,>(k: "AskRow" | "Seen" | "Again") => lazy(async () => ({ default: (await import("./parts.tsx"))[k] as unknown as ComponentType<P> }));
const AskRow = part<{ u: Unsure; focus: boolean }>("AskRow"), Seen = part<{ band: string }>("Seen"), Again = part<object>("Again");
const LeadRow = lazy(async () => ({ default: (await import("./Lead.tsx")).LeadRow as ComponentType<object> }));
const draw = <P extends object>(C: ComponentType<P>, props: P, key: string) => createElement(Suspense, { key, fallback: null }, createElement(C, props));

// ---------------------------------------------------------------- an unsure row left for later: one Needs-you ask

export type MvItem = { id: string; type: "movein"; u: Unsure };
const unsureOf = (t: ExtOpen) => (t as unknown as MvItem).u;

const asker: Provider = {
  items() {
    const c = DONE[here()], p = personOf(here());
    if (!c || !p) return [];
    return p.unsure.filter((u) => c.later[u.id]).map((u) => ({ id: `mv:${here()}:${u.id}`, type: "movein", u }));
  },
  line: (t, said) => ({ what: `You said “${said}”: ${unsureOf(t).q.replace(/\?$/, "")}.`, why: "Moving in" }),
  first: () => "is from your move-in",
  done(t, said) {
    const name = here(), c = DONE[name], u = unsureOf(t), o = u.opts.find(([l]) => l === said);
    if (!c) return;
    delete c.later[u.id];
    if (o) { answerTo(c, u, o[1], said); if (/^(drop|merge):/.test(o[1])) { if (MODE === "fixture") load(name); else applyLive(); } }
  },
  row: (t, focus) => draw(AskRow, { u: unsureOf(t), focus }, t.id),
};
let joined = false;
/** the move-in joins the queue the first time a canvas is moved in (These are mine, or Skip): before that it has nothing
 *  to ask, and the other askers' queue stays as it was */
export function joinQueue(): void { if (!joined) { joined = true; register(asker); } }

// ---------------------------------------------------------------- the seams the Diary and Settings draw

type Seams = { seen?: ((band: string) => ReactNode)[]; stRows?: ((group: string) => ReactNode)[] };
const h = hooks as unknown as Seams;
(h.seen ??= []).push((band) => (personOf(here()) ? draw(Seen, { band }, "movein") : null));
(h.stRows ??= []).push((g) => (g === "How it looks and reads" ? draw(LeadRow, {}, "lead") : null));   // BR1: what you see first
(h.stRows ??= []).push((g) => (g === "How your AIs work" && (MODE === "live" || personOf(here())) ? draw(Again, {}, "movein") : null));

// ---------------------------------------------------------------- the AI's maps (agent.js round 6)

Object.assign(MOVE_FN, { move_in: "look", move_in_close: "look", move_in_row: "offer", move_in_answer: "check", move_in_skip: "needs", these_are_mine: "offer", move_in_mig: "check" });
PERSON_ONLY.move_in = PERSON_ONLY.move_in_close = "camera";
PERSON_ONLY.move_in_row = PERSON_ONLY.these_are_mine = "setting";
PERSON_ONLY.move_in_answer = PERSON_ONLY.move_in_skip = PERSON_ONLY.move_in_mig = "answer";   // the migration's answers are the person's (migration.html C)

// ---------------------------------------------------------------- the counts' handle (window.CV.hooks.movein on the dev page)

(hooks as unknown as { movein: unknown }).movein = { DATA, DONE, EDIT, tally, gone, blank, ed, clear() { clear(); show(false); render(); }, get open() { return st.open; } };
