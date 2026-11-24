// owned by slices 8+9 (Cowork v2 and Social v2, the people), docs/port/slices.md "Night 2, outlined"
// The people's 13 moves (merge/people.js, P5), each named after its function (FN in people/queue.ts), merged into M by
// moves/index.ts. Live, Social's moves run on Isaac's Social (#1072's model, cv/wire/social.ts, BR1) and answer
// { ok: false, why: "not yet" } only before that wire is attached. ⌘J walks the canvas's asks first, then the people's (P3): M.next is slice 2's, so the walk wraps
// it once the store is filled (ensureWalk; docs/port/requests/people.md asks the join for a proper seam).
// Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { M, MODE, S, above, done, hooks, notYet, open, render, type Done, type Moves } from "../core.ts";
import { EXTRA, extOpen, register } from "../../people/extra.ts";
import { COWORK, SOCIAL } from "../../people/data.ts";
import { FN, SOCIAL_MOVES, live, answer, cardsAll, circle, count, diaryLines, find, isMaker, items, pagesOf, sortedGroups, st, team, use, waitsAll, PEOPLE, pk, parg, onPeople, needsCount, notHere } from "../../people/queue.ts";

const page = (p: string, arg?: string | null): Done => M.page(arg != null ? `${p}:${arg}` : p);
const groupOf = (gid?: string) => team().groups.find((g) => g.id === gid);

const own: Moves = {
  see_groups: () => page("cowork"),
  open_group(gid?: string) { const g = groupOf(gid) || sortedGroups(team())[0]; return g ? page("group", g.id) : done(false); },
  answer_wait: (id: string, said?: string) => done(answer(id, said), id),
  first_time(gid?: string) { const g = groupOf(gid) || team().groups[0]; return g ? page("first", g.id) : done(false); },
  /** drawn as people.html draws it: no engine behind it, it leaves nothing (a known gap, carried); live it says so */
  leave_group(gid?: string) { const g = groupOf(gid); if (g) hooks.flash?.(MODE === "live" ? notHere("Leave") : "You left. Your place stays empty; the link brings you back."); return done(false, g?.id); },
  see_social: () => page("social"),
  open_friend(name?: string) { const fs = circle().friends, f = fs.find((x) => x.n === name) || fs.find((x) => !x.waiting); return f ? page("friend", f.n) : done(false); },
  see_as_friend: (name?: string) => page("asfriend", name || ""),
  make_link: () => page("link"),
  pick_face(n?: number | string) {
    const b = st(), was = { face: b.face, faced: b.faced };
    b.face = +(n ?? 0) || 0; b.faced = true; live.social?.face(b.face); render();   // live: kept as #1072's jelly
    return done(true, String(b.face), () => { Object.assign(b, was); live.social?.face(was.face); render(); });
  },
  answer_card: (id: string, said?: string) => done(answer(id, said), id),
  make_close(name: string) {
    // live, #1072's own circle holds it (close or friend); the fixture keeps it in the book
    if (live.social) { const flip = () => { live.social?.close(name); render(); }; flip(); return done(true, name, flip); }
    const b = st(), flip = () => { if (b.close.has(name)) b.close.delete(name); else b.close.add(name); render(); };
    flip(); return done(true, name, flip);
  },
  /** ⌘J past the canvas: the next wait or card, on its own page, ringed; pressed again, the one after (each once) */
  next_wait() {
    const o = items();
    if (!o.length) return done(false);
    const b = st(), was = b.focus, i = o.findIndex((x) => x.id === b.focus), t = o[(i + 1) % o.length];
    b.focus = t.id; S.c.presses++;
    const r = t.type === "ext" ? M.needs() : t.type === "wait" ? page("group", t.g.id) : page("social");
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => {
      const el = document.querySelector(`#view [data-pid="${CSS.escape(t.id)}"]`);
      el?.scrollIntoView?.({ block: "center" });
    });
    return { ...r, ok: true, id: t.id, undo: () => { b.focus = was; r.undo(); } };
  },
};

/** live, Social's moves answer "not yet" until its wire is attached (cv/wire/social.ts, #1072's model); the fixture runs them all */
const moves: Moves = {};
for (const [name, f] of Object.entries(own)) moves[name] = (...a: unknown[]) => (MODE === "live" && SOCIAL_MOVES.has(name) && !live.social ? notYet() : f(...a));
export default moves;

// ---------------------------------------------------------------- ⌘J: one order (P3)

const WALK = Symbol("people walk");
type Walk = ((...a: unknown[]) => Done) & { [WALK]?: true };
/** wrap M.next once: while the canvas has asks it is the canvas's next, exactly as before; then the people's */
export function ensureWalk(): void {
  const cur = M.next as Walk | undefined;
  if (!cur || cur[WALK]) return;
  const w: Walk = (...a: unknown[]) => {
    if (open().length || !count()) { st().focus = null; return cur(...a); }
    return M.next_wait();
  };
  w[WALK] = true;
  M.next = w;
}
hooks.onLoad.push(() => ensureWalk());

/** the people's rules for the counts on the dev page (window.CV.hooks.people): read only, the names people.js gave */
Object.assign(hooks, {
  people: { above, extOpen, EXTRA, register, COWORK: Object.keys(COWORK), SOCIAL: Object.keys(SOCIAL), FN, st, use, team, circle, items, count, needsCount, find, waitsAll, cardsAll, sortedGroups, isMaker, pagesOf, diaryLines, PEOPLE, pk, parg, onPeople },
});
