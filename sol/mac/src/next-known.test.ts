// node --test src/*.test.ts: what Sol knows, as one type (BR1 root part 5, #1615; next/known.ts). With invented people
// only (Denise, Dev, Lucy), never a real person's setup: known(place | "you") folds next.you's knows and fields, an opened
// folder's facts, Settings' learned lines and the fits' facts into one Known each; the same fact heard twice is said
// once; every fact says where it came from; only a fact the engine holds can be forgotten; the circle's chips are the
// same facts. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { becauseOf, clause, forgettable, forgotten, known, learnedId, ofFolder, ofLearned, ofPart, ofYou, samePlace, type Known } from "./next/known.ts";
import { knownInRegion, knowsWith, regionOf } from "./next/movein/you/lens-state.ts";
import { aboutYou, badgeOf, chipOf, circleOf, kindsOf } from "./next/movein/you/circle-state.ts";
import { prepare } from "./next/fits/rules.ts";
import type { Part, You } from "./next/movein/you/types.ts";
import type { Folder } from "./next/notes/read.ts";

const hours = (from: number, n: number) => Array.from({ length: 24 }, (_, h) => (h >= from && h < from + n ? 3 : 0));
const part = (o: Partial<Part> & Pick<Part, "id" | "name">): Part =>
  ({ share: 0.2, tools: [], ais: 0, level: null, faded: false, new: false, at: hours(9, 3), from: [], facts: 0, ...o });
const person = (parts: Part[], o: Partial<You> = {}): You => ({
  who: null, said: null, headline: "", aims: [], seenAims: [], parts, day: { hours: Array(24).fill(0), quiet: null },
  sieve: { thrown: { keys: 0, money: 0, health: 0, talk: 0, id: 0 }, keep: [] },
  read: { at: null, sources: [], by: "device", made: "rules", digest: "" }, questions: [], setup: [],
  again: { weekly: false, last: null, due: false }, ...o,
});

// Denise runs a bakery: her orders folder (told facts, one also in the opened folder) and her recipes (read only)
const denise = person([
  part({ id: "w:/home/you/orders", name: "orders", share: 0.6, main: true, from: ["files", "calendar-store"],
    knows: [{ k: "fact:d1", fact: "Orders close at noon", source: "you said", by: "person" },
      { k: "tool:w:/home/you/orders:Numbers", fact: "Uses Numbers here", source: "your files", by: "read" },
      { k: "tool:w:/home/you/orders:order_sync", fact: "Uses order_sync here", source: "your files", by: "read" }] }),
  part({ id: "w:/home/you/recipes", name: "recipes", share: 0.3, from: ["notes"], knows: [], faded: true }),
], { aims: [{ w: "Business", said: true, ok: null, at: "2026-11-02" }, { w: "Life", said: false, ok: false, at: "2026-11-02" }],
  talk: { style: "brief", by: "you", why: null } });
const deniseFolder: Folder = { folder: "w:/home/you/orders", place: "/home/you/orders", backs: [], sessions: [],
  facts: [{ id: "d1", fact: "Orders close at noon", source: "you told this folder", stale: false },
    { id: "d2", fact: "Flour comes on Tuesdays", source: "Sol noticed", stale: true, learned: true }] };

test("known(place): the place's own facts, each with its place, then what its fields say, then its folder's", () => {
  const ks = known("w:/home/you/orders", { you: denise, folders: { [deniseFolder.folder]: deniseFolder } });
  assert.deepEqual(ks.slice(0, 2).map((f) => f.k), ["fact:d1", "tool:w:/home/you/orders:Numbers"], "the engine's knows first, the id-like tool left out");
  assert.ok(!ks.some((f) => f.fact.includes("order_sync")), "a tool named like an id is not said");
  assert.equal(ks.filter((f) => f.k === "fact:d1").length, 1, "the same fact from next.you and next.folder is said once");
  const flour = ks.find((f) => f.k === "fact:d2");
  assert.deepEqual([flour?.by, flour?.stale], ["sol", true], "a folder fact Sol learned, marked as maybe old");
  assert.ok(ks.some((f) => f.k === "seen:w:/home/you/orders:in:calendar-store" && f.fact === "Seen in your calendar"));
  for (const f of ks) assert.ok(samePlace(f.place ?? "", "w:/home/you/orders"), `${f.k} sits in its place`);
  assert.equal(known("w:/home/you/recipes", { you: denise }).some((f) => f.fact === "Quiet lately"), true);
  assert.deepEqual(known("/home/you/orders", { you: denise }).map((f) => f.k), known("w:/home/you/orders", { you: denise }).map((f) => f.k), "a path and its folder id are one place");
});

test("known(\"you\"): the person's own first (how Sol talks, the learned lines), then every place; a dropped place is gone; what they're here for is never a fact", () => {
  const learned = ofLearned([{ id: "7", text: "Denise answers orders before 9", seen: 4 }]);
  const all = known("you", { you: denise, learned, dropped: ["w:/home/you/recipes"] });
  assert.deepEqual(all.slice(0, 2).map((f) => f.k), ["talk", "learned:7"]);
  assert.ok(!all.some((f) => f.k.startsWith("aim:")), "the purpose step is parked: no aim is read, said or seen");
  assert.ok(all.slice(0, 2).every((f) => f.place === null), "about the person, everywhere");
  assert.ok(!all.some((f) => f.place === "w:/home/you/recipes"), "a dropped place says nothing");
  assert.ok(all.some((f) => f.place === "w:/home/you/orders"));
  assert.equal(new Set(all.map((f) => f.k)).size, all.length, "each fact once");
});

test("every Known says what, where from and who; only what the engine holds can be forgotten", () => {
  const dev = person([part({ id: "h:dev-api", name: "api", tools: ["Docker", "pnpm"], from: ["projects", "claude-sessions", "codex-sessions"], facts: 2, new: true })],
    { aims: [{ w: "Work", said: false, ok: true, at: "" }], talk: { style: "plain", by: "read", why: "how your AI is set" } });
  const all: Known[] = [...known("you", { you: dev }), ...ofFolder(deniseFolder), ...ofLearned([{ id: 1, text: "x" }])];
  for (const f of all) {
    assert.ok(f.k && f.fact.trim() && f.source.trim(), `${f.k}: words and a source`);
    assert.ok(["read", "person", "sol", "seat"].includes(f.by), `${f.k}: by`);
  }
  const api = ofPart(dev.parts[0]);
  assert.ok(api.some((f) => f.fact === "Docker, pnpm" && f.from === "projects"), "an older engine with no knows: the tools from the fields");
  assert.ok(api.some((f) => f.fact === "Claude Code and Codex work here" && f.from === "claude-sessions"));
  assert.ok(api.some((f) => f.fact === "2 things you told Sol" && f.by === "person"));
  assert.equal(ofYou(dev).some((f) => f.k.startsWith("aim:")), false, "an aim, even one kept, is never read");
  for (const k of ["fact:a", "tool:p:Figma", "learned:3"]) assert.ok(forgettable(k), k);
  for (const k of ["seen:p:hours", "aim:Work", "talk", "fit:1"]) assert.ok(!forgettable(k), k);
  assert.equal(learnedId("learned:42"), "42");
  assert.equal(ofLearned([{ id: 5, text: "y", seen: 1 }])[0].source, "seen 1 time");
});

test("the same fact on every screen: the circle's chips are known()'s facts, and the fits' facts are Knowns", () => {
  const lucy = person([part({ id: "w:/home/you/band", name: "band", from: ["calendar-store"],
    knows: [{ k: "fact:l1", fact: "Rehearsal on Fridays", source: "you said", by: "person" }] })]);
  const p = lucy.parts[0], chips = ofPart(p).map((f) => chipOf(f)), ks = known(p.id, { you: lucy });
  assert.deepEqual(chips.map((c) => c.w), ks.map((f) => f.fact), "the circle says what known says, in its order");
  assert.deepEqual(chips.map((c) => c.from), ks.map((f) => f.source));
  assert.deepEqual(chips.filter((c) => c.k).map((c) => c.k), ks.filter((f) => !f.k.startsWith("seen:")).map((f) => f.k), "a chip offers Forget only for the engine's own facts");
  const fits = prepare({ Lucy: { reach: "small", said: null, fits: [], yours: [], facts: [{ fact: "Lucy reads replies at night", source: "12 of 12 evenings" }] },
    Dev: { reach: "ask", said: null, fits: [], yours: [], facts: [{ fact: "Dev keeps tests beside code", source: "the last 9 pushes" }] } });
  const lf = fits.Lucy.facts[0], df = fits.Dev.facts[0];
  assert.deepEqual([lf.k, lf.fact, lf.source, lf.by, lf.place], ["fit:1", "Lucy reads replies at night", "12 of 12 evenings", "sol", null]);
  assert.notEqual(lf.k, df.k, "each fits fact its own key");
});

test("the circle at every size reads known(): full's chips are its facts by k, the badge counts them, Forget only on the engine's", () => {
  const all = new Map(known("you", { you: denise }).map((f) => [f.k, f]));
  const pic = circleOf(denise, { w: 1200, h: 800 });
  const real = pic.chips.filter((c) => !c.more);
  assert.ok(real.length > 0);
  for (const c of real) {
    assert.equal(all.get(c.id)?.fact, c.full, `chip ${c.id} is known()'s fact`);
    assert.equal(c.k !== undefined, forgettable(c.id), `chip ${c.id}: Forget only when the engine holds it`);
  }
  assert.deepEqual(aboutYou(denise).map((c) => [c.id, c.w]), [["talk", "Brief, the answer first"]], "about the person: the fact's k, a few words");
  assert.equal(chipOf(all.get("fact:d1")!).k, "fact:d1");
  assert.equal(chipOf(all.get("seen:w:/home/you/orders:hours")!).k, undefined, "worked out from the fields: nothing to forget");

  assert.equal(badgeOf([]), null, "nothing known: no badge, never a zero");
  const here = known("w:/home/you/orders", { you: denise, folders: { [deniseFolder.folder]: deniseFolder } });
  const b = badgeOf(here, { level: "draft", label: "orders" })!;
  assert.equal(b.n, here.length);
  assert.deepEqual(b.kinds, kindsOf(here));
  assert.equal(new Set(b.kinds).size, b.kinds.length, "each source's dot once");
  assert.equal(b.w, `${here.length} facts about this folder`, "the words pass: one wording with the circle's");
  assert.equal(b.dial, "◑", "the place's dial beside the count");
  assert.equal(b.aria, `Show ${here.length} facts the AI knows about orders`);
  assert.match(b.desc, /^From .+; AIs here .+$/);
  assert.ok(!/ai chats|sol noticed/.test(b.desc), "a source's own capitals kept when read aloud");
  assert.equal(badgeOf(here.slice(0, 1))!.dial, null, "no dial asked: no dial said");
});

test("a folder of the plane knows what its places know: by id or by name, with its own told facts, each once", () => {
  const regions = [{ id: "w:/home/you/orders", name: "orders" }, { id: "h:cakes", name: "Recipes" }, { id: "h:empty", name: "spare" }];
  const folders = { [deniseFolder.folder]: deniseFolder };
  const orders = knownInRegion("w:/home/you/orders", regions, { you: denise, folders });
  assert.deepEqual(orders.map((f) => f.k), known("w:/home/you/orders", { you: denise, folders }).map((f) => f.k), "by id: what known(place) says");
  assert.equal(orders.filter((f) => f.k === "fact:d1").length, 1);
  const cakes = knownInRegion("h:cakes", regions, { you: denise });
  assert.ok(cakes.length > 0 && cakes.every((f) => f.place === "w:/home/you/recipes"), "a folder named as a place is that place");
  assert.deepEqual(knownInRegion("h:empty", regions, { you: denise }), [], "nothing known: nothing, and so no badge");
});

test("You says what the folder's badge says: a place knows its folder's own facts and what the move-in found there, the same N (BR1 H4)", () => {
  const regions = [{ id: "w:/home/you/orders", name: "orders" }, { id: "h:cakes", name: "Recipes" }, { id: "h:nowhere", name: "spare" }];
  const folders = { [deniseFolder.folder]: deniseFolder };
  const found = [{ id: "/home/you/orders", place: "w:/home/you/orders", app: false, holds: { repo: true }, rules: ["CLAUDE.md"], sessions: { claude: 2 } }];
  const lone = part({ id: "/home/you/lone", name: "lone", knows: [] });
  const y = knowsWith({ ...denise, parts: [...denise.parts, lone] }, regions, { folders, found });
  for (const rid of ["w:/home/you/orders", "h:cakes"]) {
    const p = y.parts.find((x) => regionOf(x, regions) === rid)!;
    assert.deepEqual(ofPart(p).map((f) => f.k).sort(), knownInRegion(rid, regions, { you: denise, folders, found }).map((f) => f.k).sort(), `${rid}: You's N is the badge's N`);
  }
  assert.ok(ofPart(y.parts.find((x) => x.id === "w:/home/you/orders")!).some((f) => f.fact === "A repo"), "what the move-in found is among it");
  assert.equal(y.parts.find((x) => x.id === "/home/you/lone"), lone, "a place on no folder keeps its own");
});

// the because (mine/look/br1/because.html): Ana, a student who builds a site for a client
test("the because: only beside what Sol did, from the facts its why names, each source once", () => {
  const ana: Known[] = [
    { k: "fact:7", fact: "You write on your thesis before 11 most weekdays.", source: "you said", by: "person", at: "2026-11-18T10:00:00Z", place: null },
    { k: "seen:/u/ana/studio-site:hours", fact: "Busiest 2pm–5pm", source: "when you work", by: "sol", place: "/u/ana/studio-site" },
    { k: "fact:9", fact: "Mira writes after lunch", source: "you said", by: "person", at: "2026-11-18T10:00:00Z", place: "/u/ana/studio-site" },
  ];
  assert.equal(becauseOf(undefined, ana), null, "no why: no because");
  assert.equal(becauseOf([], ana), null);
  assert.equal(becauseOf(["fact:404"], ana), null, "a key Sol no longer knows (forgotten): no empty because");
  const b = becauseOf(["fact:7", "fact:404", "fact:9", "fact:7"], ana)!;
  assert.equal(b.label, "because you write on your thesis before 11 most weekdays");
  assert.equal(b.short, "because you write on your…", "the grey words: at most six, the rest unfolds on a press (folder.html)");
  assert.equal(becauseOf(["seen:/u/ana/studio-site:hours"], ana)!.short, "because Busiest 2pm–5pm", "a short fact is said whole");
  assert.deepEqual(b.facts.map((f) => f.k), ["fact:7", "fact:9"], "the why's order, each once, the unknown left out");
  assert.equal(b.from.length, 1, "the same source on the same day is said once");
  assert.ok(b.from[0].startsWith("you said · "));
  assert.equal(becauseOf(["seen:/u/ana/studio-site:hours"], ana)!.label, "because Busiest 2pm–5pm", "a fact not about the person keeps its words");
  assert.equal(clause("Your client writes after lunch."), "your client writes after lunch");
  assert.equal(clause("You’re here for school"), "you’re here for school");
  assert.equal(clause("Youth league on Sundays."), "Youth league on Sundays", "only the word You, not a word starting with it");
});

test("what the person forgot is read from the one store, never a copy: a hide holds its key out of every source, a show lets it back (builder K)", () => {
  // next.known's own fix lines as the engine says them (fix: how, what, the key it answers), Denise's orders folder
  const fixLine = (id: string, how: string, reason: string, at: string): Known =>
    ({ k: `fix:${id}`, fact: `You ${how === "hide" ? "hid" : "brought back"} “Orders close at noon”`, source: "you did it", by: "person", at, place: "w:/home/you/orders", fix: { how, what: "“Orders close at noon”", reason } });
  const hid = [fixLine("f1", "hide", "fact:d1", "2026-11-22T10:00:00Z")];
  assert.equal(forgotten(null), null, "no engine list: nothing is read as forgotten");
  assert.deepEqual([...forgotten(hid)!], ["fact:d1"]);
  // the folder's own facts are folded on top of the engine's list: the forgotten one is out of them too, before a re-read
  const ks = known("w:/home/you/orders", { you: denise, engine: hid, folders: { [deniseFolder.folder]: deniseFolder } });
  assert.ok(!ks.some((f) => f.k === "fact:d1"), JSON.stringify(ks.map((f) => f.k)));
  assert.ok(ks.some((f) => f.k === "fact:d2"), "the rest of the folder stays");
  // Back: the later show lets it back, in whatever order the lines arrive
  const back = [fixLine("f2", "show", "fact:d1", "2026-11-22T10:01:00Z"), ...hid];
  assert.deepEqual([...forgotten(back)!], []);
  assert.ok(known("w:/home/you/orders", { you: denise, engine: back, folders: { [deniseFolder.folder]: deniseFolder } }).some((f) => f.k === "fact:d1"));
  // a window that holds the keys itself (the folder's badge, through forgotNow) passes them as forgot
  assert.ok(!known("w:/home/you/orders", { you: denise, forgot: ["fact:d1"] }).some((f) => f.k === "fact:d1"));
});
