// owned by slice 6b (Seats and sign-ins), docs/port/slices.md
// Seats' moves (round 6 · M2, #1615; the mockup's merge/seats.js, named after their functions): see_seats opens
// Settings › Seats and sign-ins, at a row when one is named (that row ringed, in the middle of the panel); sign_in is a
// sign-in or a renewal, always the person's: its own page opens ("Waiting for its page"), then "It says I'm in" marks it
// done, and that is one Diary line; remind_later snoozes a week-ahead line until the day before. On load, each item of
// Coming up is one Diary line, written ahead of time. Sign-in, renew and the snooze are drawn, not real: live they answer
// { ok: false, why: "not yet" }. The state lives per canvas (a load starts clean). Signed: marcocyl04-ux's agent, slice 6b (#1615).
import { D, MODE, M, S, SCEN, SCN, done, hooks, notYet, render, type Data, type Done, type Moves } from "../core.ts";
import { note } from "../../diary/book.ts";
import { U } from "./settings.ts";
import { PEOPLE, ahead, acctSt, blocked, didLine, freshBook, livePerson, seatSt, type Book, type ConnRow, type Ctx, type Lapsed, type Person } from "../../settings/seats/model.ts";
import "../../settings/seats/extra.ts";

const books = new WeakMap<Data, Book>();
/** this canvas's pressed state */
export function book(d: Data = D): Book { let b = books.get(d); if (!b) { b = freshBook(); books.set(d, b); } return b; }
export const ctx = (d: Data = D): Ctx => ({ b: book(d), lapsed: d.lapsed as Lapsed });
/** the person on this canvas: the panel's people by the scenario's label (fixture); live, home.connections' rows */
export const personName = (name: string = SCN): string => (MODE === "fixture" && SCEN[name] ? SCEN[name].label : "You").split(" · ")[0];
export function me(d: Data = D): Person | null {
  if (MODE === "live") return Array.isArray(d.seatConns) ? livePerson(d.seatConns as ConnRow[]) : null;
  return PEOPLE[personName()] || null;
}
const aisHere = (): Set<string> => new Set((D.ais || []).map((a) => a.name));
/** the AIs a lapsed sign-in holds up now (the first asks of Needs you) */
export const blockedNow = () => blocked(ctx(), me(), personName(), aisHere());
/** the row the panel was opened at (ringed), or null */
export const seatRow = (): string | null => ((S as { seatRow?: string | null }).seatRow ?? null);

// the Diary: each Coming up item, one line, written ahead of time (Marco: a sign-in is a Diary line ahead of time)
hooks.onLoad.push((d, name) => {
  const p = PEOPLE[(SCEN[name]?.label || "").split(" · ")[0]];
  if (!p) return;
  for (const x of ahead(ctx(d), p)) note({ kind: "seat", key: `seat:${name}:${x.id}`, what: x.t.replace(/\.$/, "") + ". " + x.w, why: "Seats and sign-ins, checked this morning" });
});

const live = () => MODE === "live";
const flash = (t: string) => hooks.flash?.(t);

const moves: Moves = {
  /** open Settings › Seats and sign-ins, at a row when one is named */
  see_seats(row?: string): Done {
    const was = S.page;
    M.stOpen();
    (U() as { page: string }).page = "seats";
    (S as { seatRow?: string | null }).seatRow = row ? String(row) : null;
    render();
    return done(true, "seats", () => { (S as { seatRow?: string | null }).seatRow = null; M.page(was); });
  },
  /** a sign-in or a renewal: its own page opens (wait), then "It says I'm in" (done / in / renewed); always the person's */
  sign_in(id: string, to: string): Done {
    if (live()) return notYet();
    const p = me(); if (!p) return done(false);
    const x = p.seats.find((s) => s.id === id), a = p.accts.find((s) => s.id === id);
    if (!x && !a) return done(false);
    const b = book(), was = x ? seatSt(ctx(), x) : acctSt(ctx(), a!), slot = x ? b.seat : b.acct;
    slot[id] = to;
    const what = didLine(x, a, to);
    if (what) { note({ who: "person", kind: "decided", key: `seat-did:${id}:${to}:${Date.now()}`, what }); flash(what); }
    render();
    return done(true, id, () => { slot[id] = was; render(); });
  },
  /** "Remind me the day before": the week-ahead line is said once; the day before it comes again */
  remind_later(id: string): Done {
    if (live()) return notYet();
    const b = book(); b.snooze[id] = 1; render();
    flash("I’ll ask again the day before.");
    return done(true, id, () => { delete b.snooze[id]; render(); });
  },
};
export default moves;

// the rules for the counts on the dev page (window.CV.hooks.seats): read only, the names seats.js gave CV.seats
Object.assign(hooks, { seats: { PEOPLE, me, ahead: (p: Person | null) => ahead(ctx(), p), blocked: () => blockedNow(), book, personName } });
