// owned by slice R7 (one lead per piece), docs/port/slices.md
// The lead's moves (round 7, #1615; merge/lead.js, as it is), each named after its function, merged into M by
// moves/index.ts. Live, their engine rows (harmony S13, S14, S22; #1617) are not there yet, so each answers
// { ok: false, why: "not yet" } and the views draw nothing for them; the fixture runs them all.
//   join_piece(pid, ai, words)       a second AI joins; the first one on it leads, said in one line (one Diary line)
//   change_lead(pid, ai)             the person names another lead (one Diary line)
//   hand_part(pid, id, who)          a part to a teammate: on their wait, never on your Needs you (one Diary line)
//   take_part_back(pid, id)          it comes back off their wait
//   part_returns(pid, id, what, text) it comes back signed by them (one Diary line, in their name)
//   see_seat(id)                     "Open sign-in": Settings at Seats, the row ringed (slice 6b draws the row)
//   sign_in(id, to)                  the seat's state (lapsed → wait → done): Seats' own move when slice 6b is joined; here
//                                    until then. After it, the runs it held pick up again, one Diary line (resume:<id>)
// The AI's refusal (agent.js): a hand-off, taking one back, or one coming back is the person's.
// Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import { D, MODE, S, done, notYet, render, type Done, type Moves, type Piece } from "../core.ts";
import { note, hm, now } from "../../diary/book.ts";
import { MOVE_FN, PERSON_ONLY, REFUSE } from "../../agent/calls.ts";
import { CAUSE, aisOn, findPart, lapsed, leadOf, partsOf, withs, type Lapse, type Said } from "../../lead/rules.ts";
import "../../lead/extra.ts";

/** the diary's clock, so a hand-off and its line say the same time */
const hhmm = () => hm(now());
const lapses = () => (D.lapsed as Record<string, Lapse> | undefined) ?? {};

const own: Moves = {
  /** a second AI joins a piece: its run becomes a part; the first one on it leads, and that is said in one line */
  join_piece(pid: string, ai: string, words?: string): Done {
    const p = D.pieces[pid];
    if (!p || !ai) return { ...done(false), why: "no such piece" };
    const before = aisOn(p).length;
    p.parts = p.parts || [];
    const i = p.parts.length, w = words || "a part", copy = `${p.copy || p.id}-${String(w).split(" ").slice(-1)[0]}`;
    p.parts.push({ id: `${pid}.p${i + 1}`, kind: "session", part: true, region: p.region, ai, name: w, words: w, copy, branch: "ai/" + copy, files: 4, state: "working",
      term: { lines: [`~/${copy} $ npm test`, "  ✓ 18 passed", `~/${copy} $ _`], waiting: null, stateWord: "tests: all passing" }, talk: [`${ai}: I’ll take ${w}.`], cost: 0 } as Piece);
    if (before === 1 && aisOn(p).length === 2) {
      p.leadSaid = { first: p.ai, joined: ai } as Said;
      note({ who: p.ai, kind: "ai", region: p.region, key: `lead:${pid}:${ai}`, what: `${ai} joined ${p.name} with ${w}; ${p.ai} leads it, as the first one on it.` });
    }
    render();
    return done(true, p.parts[i].id, () => { p.parts!.splice(i, 1); if (before === 1) delete p.leadSaid; render(); });
  },
  /** the person names another lead: one press, said once */
  change_lead(pid: string, ai: string): Done {
    const p = D.pieces[pid];
    if (!p || !aisOn(p).includes(ai)) return { ...done(false), why: "that AI is not on this piece" };
    const was = leadOf(p);
    if (was === ai) return done(true, pid);
    p.lead = ai; p.leadSaid = { ...((p.leadSaid as Said) || { first: was, joined: ai }), changed: true };
    note({ who: "person", kind: "decided", region: p.region, key: `lead-set:${pid}:${ai}`, what: `You made ${ai} lead ${p.name}, instead of ${was}.` });
    render();
    return done(true, pid, () => { p.lead = was === p.ai ? null : was; (p.leadSaid as Said).changed = false; render(); });
  },
  /** a part to a teammate: on their wait in Cowork, never on your Needs you; it comes back signed */
  hand_part(pid: string, id: string, who: string): Done {
    const p = D.pieces[pid], x = findPart(pid, id);
    if (!p || !x || !who) return { ...done(false), why: "no such part" };
    if (x.with) return done(true, id);
    x.with = { who, at: hhmm() }; delete x.back; withs().push({ pid, id, who });
    note({ who: "person", kind: "did", region: p.region, key: `hand:${pid}:${id}`, what: `You handed ${x.name} to ${who}; it waits on ${who} in Cowork, and comes back into ${p.name}.` });
    render();
    return done(true, id, () => { delete x.with; const w = withs(), k = w.findIndex((h) => h.id === id); if (k >= 0) w.splice(k, 1); render(); });
  },
  /** the teammate's change comes back, signed by them; one Diary line in their name */
  part_returns(pid: string, id: string, what?: string, text?: string): Done {
    const p = D.pieces[pid], x = findPart(pid, id);
    if (!p || !x || !x.with) return { ...done(false), why: "that part is not with anyone" };
    const who = x.with.who, was = { with: x.with, state: x.state };
    x.back = { by: who, at: hhmm(), what: what || "made changes", text: text || String(x.text ?? "") }; x.state = "done"; delete x.with;
    const w = withs(), k = w.findIndex((h) => h.id === id), h = k >= 0 ? w.splice(k, 1)[0] : null;
    note({ who, kind: "ai", region: p.region, key: `back:${pid}:${id}`, what: `${who} sent back ${x.name}, signed: ${what || "made changes"}.`, why: `You handed it to ${who}` });
    render();
    return done(true, id, () => { delete x.back; x.with = was.with; x.state = was.state; if (h) w.push(h); render(); });
  },
  take_part_back(pid: string, id: string): Done {
    const x = findPart(pid, id);
    if (!x || !x.with) return done(false);
    const was = x.with;
    delete x.with;
    const w = withs(), k = w.findIndex((h) => h.id === id), h = k >= 0 ? w.splice(k, 1)[0] : null;
    render();
    return done(true, id, () => { x.with = was; if (h) w.push(h); render(); });
  },
  /** "Open sign-in": Settings at Seats, the seat's row ringed; signing in is the person's own, on the provider's page */
  see_seat(id: string): Done {
    const was = { page: S.page, seat: S.seat };
    S.page = "settings"; S.seat = { page: "seats", ring: id === "gh" ? "github" : id, id };
    render();
    return done(true, id, () => { S.page = was.page; S.seat = was.seat; render(); });
  },
  /** the seat's state (Seats' own move once slice 6b is joined): 'wait' while the provider's page is open, then 'done'.
   *  Once the sign-in is good, the runs it held pick up again: one Diary line */
  sign_in(id: string, to?: string): Done {
    const l = lapses()[id];
    if (!l) return done(false);
    const was = l.st;
    l.st = to === "wait" ? "wait" : to === "done" || to === "in" ? "in" : "lapsed";
    if (!lapsed(id) && (to === "done" || to === "in")) {
      let n = 0;
      for (const p of Object.values(D.pieces)) for (const x of partsOf(p)) if (x.blocked === id) { n++; delete x.blocked; }
      if (n) note({ who: "Sol", kind: "ai", key: `resume:${id}`, what: `${n} part${n === 1 ? "" : "s"} picked up again after your ${CAUSE[id] || id} sign-in.` });
    }
    render();
    return done(true, id, () => { l.st = was; render(); });
  },
};

/** live: the engine has none of these yet (harmony S13, S14, S22; #1617) */
const moves: Moves = {};
for (const [name, f] of Object.entries(own)) moves[name] = (...a: unknown[]) => (MODE === "live" ? notYet() : f(...a));
export default moves;

// the AI's side (agent.js): each move meets a function; a hand-off is the person's, and so is the lead's change
REFUSE.people = "Handing work to a person, or taking it back, is yours; I can propose it.";
PERSON_ONLY.change_lead = "setting"; PERSON_ONLY.hand_part = PERSON_ONLY.take_part_back = PERSON_ONLY.part_returns = "people";
PERSON_ONLY.see_seat = "camera"; PERSON_ONLY.sign_in = "setting";
Object.assign(MOVE_FN, { join_piece: "pass", change_lead: "offer", hand_part: "offer", take_part_back: "offer", part_returns: "check", see_seat: "point", sign_in: "offer" });
