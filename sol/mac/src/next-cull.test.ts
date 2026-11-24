// node --test src/next-cull.test.ts: the plane at 500 and 2000 things (#1615, slice S32; next/plane/cull.ts; harmony
// canvas.md §4, C3): at Far at most twelve places are drawn whole, chosen by the ladder (asks first), every other place is
// in exactly one count line, one line for them all (BR1: no zones); the rule moves nothing on the plane; the panel's own scenarios (twelve
// places or fewer) fold nothing. The fixtures of 500 and 2000 things are grown from the panel's dev-morning, never real
// data; sol/test/e2e/next/counts/40.mjs grows the same ones in the browser.
// Signed: marcocyl04-ux's agent, slice S32 of the port (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import { FIXTURE } from "./next/cv/fixture.ts";
import { cull, foldWords, ladder, placesNow, MAX_WHOLE, type Place } from "./next/plane/cull.ts";
import type { Data } from "./next/cv/types.ts";
import * as L from "./next/plane/layout.ts";
import { DIARY_PX } from "./next/fits/fit.ts";

/** dev-morning grown to n things (places + pieces): places of five things each, code and life by turns, the panel's
 *  people's names; every ninth place asks, every fourth session waits (the same rule as count 40's) */
function grow(n: number): Data {
  const d = CV.SCEN["dev-morning"].data(), who = ["Dev", "Jayden", "Denise", "Min-ji", "Sam", "Tomás"], what = ["notes", "plans", "errands", "repo", "class", "trip"];
  let rank = Math.max(0, ...Object.values(d.asks).map((a) => a.rank)) + 1;
  const total = () => d.regions.length + Object.keys(d.pieces).length;
  for (let i = 0; total() < n; i++) {
    const code = i % 2 === 0, id = `g${i}`;
    d.regions.push({ id, name: `${who[i % who.length]}'s ${what[i % what.length]} ${i}`, kind: code ? "code" : "life" });
    for (let k = 0; k < 5 && total() < n; k++) {
      const pid = `${id}-${k}`;
      if (code) {
        const ai = `${who[(i + k) % who.length]}-AI-${i}.${k}`;
        d.pieces[pid] = { id: pid, region: id, kind: "session", name: `${ai} in ${id}-${k}`, ai, copy: `${id}-${k}`, branch: `ai/${id}-${k}`, files: (i + k) % 9, state: "working",
          term: { lines: ["$ npm test", "  ✓ 12 passed"], waiting: k % 4 === 3 ? "a yes" : null, stateWord: "tests: pass" }, talk: [`${ai}: on it.`] };
        d.ais.push({ name: ai, piece: pid });
      } else d.pieces[pid] = { id: pid, region: id, kind: k % 2 ? "doc" : "sticky", name: `note ${k}`, text: `${what[(i + k) % what.length]} ${i}.${k}` };
    }
    if (i % 9 === 4 && d.pieces[`${id}-0`]) { const aid = `ga${i}`; d.asks[aid] = { id: aid, rank: rank++, piece: `${id}-0`, kind: code ? "code" : "life", source: "fixture", text: `Keep the change in ${id}?`, how: "inplace", answered: false }; }
  }
  return d;
}
const loadGrown = (n: number) => { CV.addScen(`grown-${n}`, { label: `Dev · morning, ${n} things`, data: () => grow(n), start: "far" }); CV.load(`grown-${n}`); };
const P = (id: string, x: Partial<Place> = {}): Place => ({ id, rank: Infinity, asks: 0, working: 0, fresh: 0, x: 0, y: 0, ...x });

test("twelve places or fewer: every one whole, nothing folded", () => {
  const ps = Array.from({ length: MAX_WHOLE }, (_, i) => P("p" + i, { y: i }));
  const r = cull(ps);
  assert.equal(r.whole.size, MAX_WHOLE);
  assert.deepEqual(r.folds, []);
});

test("the ladder: asks first by their best rank, then AIs at work, then new things, then the plane's order", () => {
  const ps = [P("quiet", { x: 0 }), P("new", { fresh: 2, x: 1 }), P("ai", { working: 3, x: 2 }), P("ask2", { rank: 2, asks: 1, x: 3 }), P("ask1", { rank: 1, asks: 1, x: 4 })];
  assert.deepEqual([...ps].sort(ladder).map((p) => p.id), ["ask1", "ask2", "ai", "new", "quiet"]);
  const r = cull([...ps, ...Array.from({ length: 10 }, (_, i) => P("q" + i, { x: 10 + i }))], 4);
  assert.deepEqual([...r.whole].sort(), ["ai", "ask1", "ask2", "new"]);
  assert.deepEqual(r.folds.map((f) => f.ids.length), [11], "one line for every folded place, in the plane's order (BR1: no zones)");
  assert.equal(r.folds[0].first, "quiet", "the line sits at its first folded place");
});

test("a count line's words", () => {
  assert.equal(foldWords(34, 0, 0), "34 quiet places");
  assert.equal(foldWords(1, 0, 0), "1 quiet place");
  assert.equal(foldWords(5, 2, 1), "5 more places · 2 asks · 1 session at work");
});

test("the panel's scenarios fold nothing: the plane draws them as before", () => {
  for (const name of Object.keys(FIXTURE)) {
    CV.load(name);
    const r = cull(placesNow());
    assert.deepEqual(r.folds, [], `${name}: nothing folded (${CV.D.regions.length} places)`);
  }
});

for (const n of [500, 2000]) test(`${n} things: twelve places whole by the ladder, every other one in one count line, nothing moved`, () => {
  loadGrown(n);
  const things = CV.D.regions.length + Object.keys(CV.D.pieces).length;
  assert.ok(things >= n && things < n + 20, `${things} things (the slices' seeds add a few stickies on load)`);
  const before = JSON.stringify(CV.D.pos), ps = placesNow(), t0 = performance.now(), r = cull(ps), ms = performance.now() - t0;
  assert.equal(ps.length, CV.D.regions.length);
  assert.equal(r.whole.size, MAX_WHOLE);
  const folded = r.folds.flatMap((f) => f.ids);
  assert.equal(new Set(folded).size, folded.length, "a place in one line only");
  assert.equal(folded.length + r.whole.size, ps.length, "every place whole or counted");
  assert.ok(!folded.some((id) => r.whole.has(id)));
  assert.ok(r.folds.length === 1 && !("zone" in r.folds[0]), "one count line, no zones");
  const worstWhole = ps.filter((p) => r.whole.has(p.id)).sort(ladder).at(-1)!;
  for (const p of ps) if (!r.whole.has(p.id)) assert.ok(ladder(worstWhole, p) < 0, `${p.id} folded under ${worstWhole.id} by the ladder`);
  const asking = ps.filter((p) => p.asks).length;
  assert.equal(ps.filter((p) => r.whole.has(p.id) && p.asks).length, Math.min(asking, MAX_WHOLE), "the places that ask are drawn first");
  assert.equal(JSON.stringify(CV.D.pos), before, "never reshuffle: nothing on the plane moved");
  assert.ok(ms < 50, `the rule is cheap (${ms.toFixed(1)} ms)`);
  // an ask answered changes what is drawn, never where anything sits
  const a = CV.open()[0];
  CV.answer(a.id);
  const r2 = cull(placesNow());
  assert.equal(r2.whole.size, MAX_WHOLE);
  assert.equal(JSON.stringify(CV.D.pos), before);
});

// the shared files' changes for scale (docs/port/notes/cull.md): an answer kept per version of the data is never read
// stale, a pan keeps it, and the layout at scale stands beside today's page while the panel's layouts are as they were
test("kept answers: a pan keeps them; any other move, or a piece moved by the plane, makes them again", () => {
  loadGrown(500);
  const v = CV.dataVer(), r0 = CV.D.regions[0].id, n0 = CV.piecesIn(r0).length, asks = CV.open().length;
  CV.M.pan(-40, -10);
  assert.equal(CV.dataVer(), v, "a pan at Far changes no data");
  const pid = CV.piecesIn("g1")[0].id, R = CV.D.pos![r0];
  CV.M.place(pid, R.x + R.w / 2 - 10, R.y + R.h / 2 - 10);   // dropped inside the first folder: it belongs there now
  assert.equal(CV.D.pieces[pid].region, r0);
  assert.equal(CV.piecesIn(r0).length, n0 + 1, "the folder holds it at once");
  assert.ok(!CV.piecesIn("g1").some((p) => p.id === pid), "the old folder no longer does");
  assert.deepEqual(CV.piecesIn(r0).map((p) => p.id).sort(), Object.values(CV.D.pieces).filter((p) => p.region === r0).map((p) => p.id).sort());
  CV.open()[0].answered = true; CV.render();
  assert.equal(CV.open().length, asks - 1, "an answered ask leaves the open ones");
  const rid = CV.D.pieces[CV.open()[0].piece].region;
  assert.deepEqual(CV.asksInRegion(rid).map((x) => x.id), CV.open().filter((x) => CV.D.pieces[x.piece].region === rid).map((x) => x.id));
  assert.equal(CV.regionOf(r0)?.id, r0);
  assert.equal(CV.regionOf("no-such"), undefined);
  assert.equal(CV.regionOf(pid), undefined);
});

test("at scale the places stand beside today's page; the panel's scenarios are never at scale", () => {
  loadGrown(500);
  const Z = CV.D.zones!, laid = (Z as { page0?: { w: number } }).page0?.w ?? Z.diary.w;   // the join: R8's keepWidth grows the page leftwards on screen; as laid out it stays one page wide
  // rule (d): the page is laid out at its drawn width at the person's scale (DIARY_PX on screen), never wider for a crowd
  assert.ok(Math.abs(laid * L.Z_PERSON - DIARY_PX) <= 1, `today's page is one page wide at scale (${Math.round(laid * L.Z_PERSON)}px)`);
  assert.ok(Math.min(...CV.D.regions.map((r) => CV.D.pos![r.id].x)) <= laid + L.Z_GAP + 1, "the folders start right after it (BR1: one flow, no Build zone)");
  for (const name of Object.keys(FIXTURE)) { CV.load(name); assert.ok(CV.D.regions.length <= MAX_WHOLE, `${name}: twelve places or fewer, laid out as before`); }
});
