// owned by slice 12 (Your own pieces), docs/port/slices.md
// Your own pieces' moves (round 6 · M3, #1615; merge/pieces.js, named after their functions, as agent.js maps them):
//   see_pieces(row?)        Settings › Your own pieces, ringed at a row ("all": the set-aside press); false: back to Settings
//   propose_piece(words)    what was said becomes a proposal on the canvas, under the headline: nothing changes until used
//   use_piece(how)          use it (only when every check passes) · "alt": the way that passes · "drop": leave it
//   piece_state(id, to)     one piece: in · sols (back to Sol's) · last (your last version) · remade
//   set_pieces_aside(undo?) every piece of yours aside at once; undo restores each exactly as it was
// Each change is one Diary line. Live, a proposal, an update and set-aside have no engine rows (map.md), so every move
// but see_pieces answers { ok: false, why: "not yet" }. Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import { M, MODE, S, done, hooks, notYet, render, subscribe, type Done, type Moves } from "../core.ts";
import { note } from "../../diary/book.ts";
import { PEOPLE, asideAll, asideOf, canUse, clear, drawn, forShort, hits, list, me, pcSt, remadeOf, st, ui, undoAll, type PcState, type St } from "../../pieces/model.ts";

const diary = (what: string) => { note({ who: "person", kind: "decided", key: `piece:${Date.now()}:${Math.random()}`, what, why: "Your own pieces" }); };
/** a word on screen for a moment, when Settings is not open (the mockup's toast) */
const tell = (t: string) => { if (S.page !== "settings") hooks.flash?.(t); };
/** the person's state as it is now, and its undo (the whole state put back) */
function keep(): () => void {
  const s = st(), was: St = JSON.parse(JSON.stringify(s));
  return () => { Object.assign(s, JSON.parse(JSON.stringify(was))); render(); };
}
const live = () => MODE !== "fixture";

const moves: Moves = {
  see_pieces(row?: string | false | null): Done {
    if (row === false) { ui.open = false; ui.hl = null; render(); return done(true, "settings"); }
    ui.open = true; ui.hl = row ? String(row) : null;
    const was = S.page;
    if (S.page !== "settings") M.stOpen(); else render();
    return done(true, "pieces", () => { ui.open = false; ui.hl = null; if (was !== "settings") M.page(was); else render(); });
  },
  propose_piece(words?: string): Done {
    if (live()) return notYet();
    const p = me();
    if (!p || !p.ask.re.test(String(words || ""))) return done(false);
    const u = keep();
    st().prop = { state: "proposed", alt: false };
    if (S.dist !== "far") M.map();
    render();
    return done(true, p.ask.add.id, u);
  },
  use_piece(how?: string): Done {
    if (live()) return notYet();
    const p = me(), s = st();
    if (!p || !s.prop) return done(false);
    const a = p.ask, u = keep();
    if (how === "alt") { if (!a.alt) return done(false); s.prop.alt = true; }
    else if (how === "drop") s.prop.state = "dropped";
    else {
      if (!canUse(a, s.prop.alt)) return done(false);   // a failing piece is never added
      if (!s.added.some((x) => x.id === a.add.id)) s.added.push({ ...a.add, for: a.for, st: "in" });
      s.pc[a.add.id] = "in"; s.prop.state = "used";
      diary(`You added ${a.add.n}, for Sol’s ${a.for}.`);
    }
    render();
    return done(true, a.add.id, u);
  },
  piece_state(id?: string, to?: PcState): Done {
    if (live()) return notYet();
    const x = list().find((x) => x.id === id);
    if (!x || !to) return done(false);
    const s = st(), u = keep();
    s.pc[x.id] = to;
    if (s.all && to !== "sols") delete s.all[x.id];
    diary(to === "sols" ? `You put Sol’s ${forShort(x)} back in place of ${x.n}; yours is kept.` : to === "in" ? `You brought ${x.n} back.` : to === "last" ? `You went back to your last version of ${x.n}.` : `You took the remade ${x.n}.`);
    tell(to === "sols" ? `Sol’s ${forShort(x)} is back. ${x.n} is kept.` : `${x.n}: done.`);
    render();
    return done(true, x.id, u);
  },
  set_pieces_aside(undo?: boolean): Done {
    if (live()) return notYet();
    const s = st();
    if (undo) {
      if (!undoAll(s)) return done(false);
      diary("You brought all your pieces back, each as it was.");
      render();
      return done(true, "all");
    }
    const xs = list(), u = keep();
    if (!asideAll(xs, s)) return done(false);
    diary(`You set all ${xs.length} of your pieces aside, to see Sol as it comes.`);
    tell("All of Sol’s, for now. Your pieces are kept.");
    render();
    return done(true, "all", () => { u(); });
  },
};

/** Sol's version line on the page (2.3 back as a whole, after a confirm): the page's own state, not a move (the mockup's
 *  data-cuver presses had none); it changes the version line only */
export function version(to: "2.3" | "go" | "stay" | "2.4"): void {
  const s = st();
  if (to === "2.3") s.verConf = true; else if (to === "go") { s.ver = "2.3"; s.verConf = false; } else if (to === "stay") s.verConf = false; else s.ver = "2.4";
  render();
}
// the counts' handle (dev page: CV.hooks.pieces, as the mockup's CV.pieces), and Find's rows with their press (its stFind)
(hooks as unknown as { pieces: unknown }).pieces = {
  PEOPLE, list, pcSt, drawn, st, asideOf, remadeOf, clear, hits,
  stFind: (q: string) => hits(q).map((h) => ({ ...h, go: () => M.see_pieces(h.row || null) })),
};

// Settings closed: the page closes with it
subscribe(() => { if (S.page !== "settings" && ui.open) { ui.open = false; ui.hl = null; } });

export default moves;
