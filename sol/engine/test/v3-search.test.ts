import { test } from "node:test";
import assert from "node:assert/strict";

// Cowork v3 slice 7 (fr-30, #560): one search over items, loose things, artifacts, Talk messages, trail events and
// place titles, folded from the record and the trail (E16), answering in under 50 ms on a thousand things.
const A = await import("../src/team/v3/artifacts.ts");
const { search, query, docsOf, words } = await import("../src/team/v3/search.ts");
const { standIn } = await import("../src/team/v3/trailport.ts");

const me = { person: "marcocyl04-ux", machine: "macbook" };
const frank = { person: "franktsai2008-eng", machine: "frank-mac" };
const port = () => { let t = 1_000_000; return standIn({ machine: "macbook", now: () => (t += 1000) }); };

const seeded = () => {
  const p = port();
  p.append({ project: "sol", by: me, kind: "item", item: "i-logo", value: { title: "Logo review", whose: "marcocyl04-ux", state: "open", place: "record" } });
  p.append({ project: "sol", by: frank, kind: "item", item: "i-2", value: { title: "Night cards ask why", whose: "franktsai2008-eng", state: "open", place: "github" } });
  p.append({ project: "sol", by: frank, kind: "loose", item: "l-1", value: { title: "Logo explorations", kind: "link", whose: "franktsai2008-eng", place: "figma" } });
  p.append({ project: "sol", by: me, kind: "place", item: "pl-1", value: { kind: "drive", label: "Brand folder", by: "marcocyl04-ux" } });
  p.append({ project: "sol", by: frank, kind: "talk", item: "t-general", value: { text: "the new logo reads well at 16 px", thread: "general" } });
  A.make(p, { project: "sol", by: me, kind: "canvas", title: "The mark, v4", content: { shapes: [{ k: "note", x: 8, y: 10, t: "logo: the o opened a touch" }] } });
  A.make(p, { project: "sol", by: me, kind: "document", title: "Release notes, November" });
  p.append({ project: "lea", by: { person: "anna" }, kind: "item", item: "i-l1", value: { title: "School trip to Ghent" } });
  return p;
};
const kinds = (g: { groups: { kind: string }[] }) => g.groups.map((x) => x.kind);

test("E16: search finds items, loose things, artifacts, Talk and place titles", () => {
  const p = seeded();
  const r = search(p, "logo", { project: "sol" });
  for (const k of ["item", "loose", "artifact", "talk"]) assert.ok(kinds(r).includes(k), `a ${k} for "logo": ${kinds(r)}`);
  const art = r.groups.find((g) => g.kind === "artifact")!.hits[0];
  assert.equal(art.title, "The mark, v4", "an artifact found by a word inside it");
  assert.deepEqual(art.open, { room: "artifacts", id: art.id }, "one press opens it");
  assert.equal(art.whose, "marcocyl04-ux"); assert.equal(art.place, "record", "two marks");
  const item = r.groups.find((g) => g.kind === "item")!.hits[0];
  assert.equal(item.id, "i-logo");
  assert.ok(item.score > r.groups.find((g) => g.kind === "talk")!.hits[0].score, "a word in a title before one in Talk");
  const place = search(p, "brand", { project: "sol" });
  assert.equal(place.groups[0].kind, "place");
  assert.equal(place.groups[0].hits[0].title, "Brand folder");
  const trail = search(p, "franktsai2008", { project: "sol" });
  assert.ok(kinds(trail).includes("trail"), "trail events: who did what");
  assert.ok(search(p, "release nov", { project: "sol" }).groups[0].hits[0].title.startsWith("Release notes"), "the last word as it is typed");
  assert.equal(search(p, "ghent", { project: "sol" }).total, 0, "one project's search stays in it");
  assert.equal(search(p, "ghent", { projects: ["sol", "lea"] }).groups[0].hits[0].project, "lea", "and all of mine finds it");
  assert.equal(search(p, "logo zebra", { project: "sol" }).total, 0, "every word must be found");
  assert.equal(search(p, "l", { project: "sol" }).total, 0, "one letter asks nothing");
  assert.deepEqual(words("Café, Brood!"), ["cafe", "brood"]);
});

test("E16: an edit is found at once; the old words are not", () => {
  const p = seeded();
  const doc = A.list(p, "sol").find((a) => a.kind === "document")!;
  assert.equal(search(p, "volcano", { project: "sol" }).total, 0);
  A.edit(p, { project: "sol", id: doc.id, by: me, content: { sections: [{ h: "Class", p: "The volcano project is due." }] } });
  assert.equal(search(p, "volcano", { project: "sol" }).groups.find((g) => g.kind === "artifact")?.hits[0].id, doc.id);
  A.back(p, { project: "sol", id: doc.id, by: me });
  assert.equal(search(p, "volcano", { project: "sol" }).groups.find((g) => g.kind === "artifact"), undefined, "back: the words are v1's again");
});

test("search answers in under 50 ms on a thousand things", () => {
  const p = port();
  const W = ["logo", "pricing", "notch", "night", "release", "brief", "volcano", "trip", "brood", "wheat", "tutor", "invoice"];
  for (let i = 0; i < 1000; i++) {
    const w = `${W[i % W.length]} ${W[(i * 7) % W.length]} ${i}`;
    if (i % 4 === 0) p.append({ project: "sol", by: me, kind: "item", item: `i-${i}`, value: { title: `Item ${w}`, whose: me.person, state: "open" } });
    else if (i % 4 === 1) p.append({ project: "sol", by: frank, kind: "loose", item: `l-${i}`, value: { title: `Loose ${w}`, whose: frank.person } });
    else if (i % 4 === 2) p.append({ project: "sol", by: frank, kind: "talk", item: "general", value: { text: `said ${w}` } });
    else A.make(p, { project: "sol", by: me, kind: "document", title: `Doc ${w}`, content: { sections: [{ h: "one", p: `about ${w}` }] } });
  }
  const docs = docsOf("sol", p.record("sol"), p.events("sol"));
  assert.ok(docs.length >= 1000, `${docs.length} things`);
  search(p, "warm", { project: "sol" });   // the words made once
  const ms: number[] = [];
  // each query its fastest of three, so a busy machine (a build beside it) is not read as a slow search
  for (const q of ["logo", "pricing night", "vol", "brood wheat 40", "zebra"]) {
    let best = Infinity;
    for (let i = 0; i < 3; i++) { const t = performance.now(); search(p, q, { project: "sol" }); best = Math.min(best, performance.now() - t); }
    ms.push(best);
  }
  assert.ok(Math.max(...ms) < 50, `slowest ${Math.max(...ms).toFixed(1)} ms`);
  const r = query(docs, "logo");
  assert.ok(r.total > 50 && r.groups.every((g) => g.hits.length <= 6), "a few of each kind");
});
