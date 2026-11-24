// owned by slice R9 (why your AI used that, links, the done fold, Far at 500), docs/port/slices.md
// Round 9's moves (#1615; merge/scope.js, as it is), each named after its function and merged into M by moves/index.ts.
// Live, their engine rows (harmony S18, S19, S29; #1617) are not there yet, so each answers { ok: false, why: "not yet" }
// and the views draw nothing for them; the fixture runs them all.
//   why(result) · close_why()          the brief, one press down, beside the page at Near
//   dont_use_here(result, key)         a hold: no AI uses that thing in this folder again
//   show_links(thing)                  the thing's links drawn from it at Middle
//   cut_link(a, b) · allow_again(hold) a cut is a hold: Sol never links the pair again; allow_again takes a hold back
//   open_done(place) · fold_done()     a folder's Done list; Sol's fold pass
//   quiet_places(zone)                 the places counted in a zone's line at Far, in a list
// Each load reads the canvas's links (Sol's, each told in the Diary) and folds what was done long enough ago; run_sticky
// and talk relink, never a pair a cut holds apart. The AI's side (agent.js round 9): all are the person's but fold_done.
// Signed: marcocyl04-ux's agent, port slice R9 (#1615).
import { D, M, MODE, S, go, hooks, notYet, piecesShown, render, sessions, type Done, type Moves } from "../core.ts";
import { MOVE_FN, PERSON_ONLY } from "../../agent/calls.ts";
import { book, byId, note } from "../../diary/book.ts";
import { lifeThing } from "../../plane/layout.ts";
import { GROW, MIN, VERB, brief, fold, linkCanvas, nameOf, pk, relink, resultOf, sayLink, st, type Hold, type Link } from "../../scope/rules.ts";
import { closeAll, ui } from "../../scope/state.ts";

const no = (why: string): Done => ({ ok: false, why, undo: () => {} });
const ok = (id: string | undefined, undo: () => void): Done => ({ ok: true, id, undo });
const links = (): Link[] => ((D as { links?: Link[] }).links ||= []);
const removeLine = (id: string | null) => { const l = id ? byId(id) : null; if (l) l.removed = true; };
/** the toast's words (the shell's toast has no undo yet: requests/scope.md) */
const toast = (w: string) => { if (hooks.flash) hooks.flash(w); };

const own: Moves = {
  why(rid: string): Done {
    const r = resultOf(rid);
    if (!r) return no("No such result.");
    const was = ui.open;
    if (S.dist !== "near" || S.piece !== r.piece) { S.part = null; M.goto(r.piece); }
    ui.open = rid; render();
    return ok(rid, () => { ui.open = was; render(); });
  },
  close_why(): Done {
    const was = ui.open;
    if (!was) return no("");
    ui.open = null; render();
    return ok(undefined, () => { ui.open = was; render(); });
  },
  dont_use_here(rid: string, key: string): Done {
    const b = brief(rid);
    if (!b) return no("No such result.");
    const u = b.used.find((x) => x.key === key);
    if (!u) return no("Not used here.");
    const s = st(), h: Hold = { id: "sh" + ++s.seq, k: "use", place: b.region, key, name: u.name, from: b.label, day: 0 };
    s.holds.push(h);
    const line = note({ who: "person", kind: "decided", key: "hold:" + h.id, region: b.region, what: `You said don’t use “${u.name}” in ${b.place}. A hold: no AI uses it there again.` });
    render(); toast("Held: not used here again");
    return ok(h.id, () => { const i = s.holds.indexOf(h); if (i >= 0) s.holds.splice(i, 1); removeLine(line); render(); });
  },
  show_links(id: string): Done {
    const p = D.pieces[id];
    if (!p) return no("No such thing.");
    const was = ui.focus;
    ui.focus = id; ui.moreL = 0;
    if (S.dist !== "middle" || S.region !== p.region) M.goto(p.region);
    // the focus in the middle of the view, the links' card beside it: a big place may hold it off screen
    const q = D.pos?.[id];
    if (q && !lifeThing(p) && S.dist === "middle") {
      const z = S.cam.z, w = document.getElementById("view")?.getBoundingClientRect().width ?? 1200;
      go({ dist: "middle", region: p.region, piece: null, beside: null, cam: { ...S.cam, x: q.x + q.w / 2 + Math.min(180, w / 4) / z, y: q.y + q.h / 2 } }, "links of " + id, false);
    }
    const shown = piecesShown().map((s) => String(s.id).split(":")[0]), i = shown.indexOf(id);
    if (i >= 0) S.sel = i;
    render();
    return ok(id, () => { ui.focus = was; render(); });
  },
  cut_link(a: string, b: string): Done {
    const ls = links(), i = ls.findIndex((l) => pk(l.a, l.b) === pk(a, b));
    if (i < 0) return no("No such link.");
    const l = ls.splice(i, 1)[0], s = st();
    const h: Hold = { id: "sh" + ++s.seq, k: "link", pair: pk(a, b), a: l.a, b: l.b, an: nameOf(D.pieces[l.a]), bn: nameOf(D.pieces[l.b]), kind: l.kind, by: l.by, place: D.pieces[l.a].region, day: 0 };
    s.holds.push(h);
    const line = note({ who: "person", kind: "decided", key: "cut:" + h.id, region: h.place, embed: { id: l.a },
      what: `You cut a link: ${sayLink(l).replace(` ${VERB[l.kind]} `, ` no longer ${l.kind === "uses" ? "uses" : VERB[l.kind]} `)}. A hold: Sol won’t link them again.` });
    render(); toast("Link cut · a hold");
    return ok(h.id, () => { ls.splice(i, 0, l); const j = s.holds.indexOf(h); if (j >= 0) s.holds.splice(j, 1); removeLine(line); render(); });
  },
  allow_again(id: string): Done {
    const s = st(), i = s.holds.findIndex((h) => h.id === id);
    if (i < 0) return no("No such hold.");
    const h = s.holds.splice(i, 1)[0];
    render();
    return ok(id, () => { s.holds.splice(i, 0, h); render(); });
  },
  open_done(rid: string): Done {
    const was = { ...ui.done };
    ui.done.rid = ui.done.rid === rid ? null : rid; ui.done.page = 0;
    if (ui.done.rid && (S.dist !== "middle" || S.region !== rid)) M.goto(rid);
    render();
    return ok(rid, () => { Object.assign(ui.done, was); render(); });
  },
  fold_done(): Done & { folded?: number } {
    const got = fold(D);
    render();
    return { ...ok(undefined, () => { for (const ids of Object.values(got)) for (const id of ids) delete D.pieces[id].inside; render(); }), folded: Object.values(got).flat().length };
  },
  quiet_places(z: string): Done {
    const was = ui.quiet;
    ui.quiet = ui.quiet === z ? null : z; ui.qpage = 0;
    render();
    return ok(z, () => { ui.quiet = was; render(); });
  },
};

/** live: the engine has none of these yet (harmony S18, S19, S29; #1617) */
const moves: Moves = {};
for (const [name, f] of Object.entries(own)) moves[name] = (...a: unknown[]) => (MODE === "live" ? notYet() : f(...a));
export default moves;

/** an act on a thing (run_sticky, talk): Sol links what the run leaned on (told in the Diary), never a pair a cut holds
 *  apart (merge/scope.js wraps M.run_sticky and M.talk). Called once by moves/index.ts on the slices' own moves */
export function relinks(slices: Record<string, Moves>): void {
  for (const ms of Object.values(slices)) for (const k of ["run_sticky", "talk"]) {
    const f = ms[k];
    if (typeof f !== "function" || (f as { scoped?: boolean }).scoped) continue;
    const g = function (this: unknown, ...a: unknown[]) {
      const r = f.apply(this, a) as Done & { id?: string };
      if (MODE !== "live") try { const pid = k === "talk" ? (a[0] as string) : (r && r.id) || (a[0] as string); if (r && r.ok !== false && pid) relink(pid); } catch (e) { console.error(e); }
      return r;
    };
    (g as { scoped?: boolean }).scoped = true;
    ms[k] = g;
  }
}

// each load starts closed; a scenario's own step (dev-500 grows to 500), the canvas's links, and what was done long enough
// ago folds (after the life seeds and the diary's book: this file is imported last)
hooks.onLoad.push((d, name) => {
  closeAll();
  GROW[name]?.(d);
  const b = book(d);
  linkCanvas(d);
  fold(d, { t: b ? b.start - 40 * MIN : undefined });
});
// round 9 (desk.js working()): a done session is not working
hooks.working = () => sessions().filter((s) => s.state !== "done" && s.state !== "idle" && !s.term?.waiting).length;   // idle: listed, not running (live)

// the AI's side (agent.js round 9): opening a brief, links, a done line or the quiet places is the camera; "Don't use this
// here", a cut and letting either go are the person's settings; Sol's fold is a placing
for (const n of ["why", "close_why", "show_links", "open_done", "quiet_places"]) PERSON_ONLY[n] = "camera";
for (const n of ["dont_use_here", "cut_link", "allow_again"]) PERSON_ONLY[n] = "setting";
Object.assign(MOVE_FN, { why: "read", close_why: "read", show_links: "look", open_done: "look", quiet_places: "look", dont_use_here: "offer", cut_link: "offer", allow_again: "offer", fold_done: "place" });
