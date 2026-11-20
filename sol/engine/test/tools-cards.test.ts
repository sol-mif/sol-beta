// The tools follow their cards (#1589, src/tools/fromcards.ts): in product no tool a card short of product offers is in
// the list, even with every switch set on by hand; in concept the list is what it was before the cards; tools.cards off
// leaves the list to each tool's own switch. On a settings file of its own (SOL_SETTINGS), so the real one is never touched.
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "sol-tools-cards-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
const ENV = ["SOL_VERSION", "SOL_TOOLS_CARDS", "SOL_REACH_TOOLS", "SOL_REACH_ROOM", "SOL_OPEN_FOR"];
const clear = () => { for (const k of ENV) delete process.env[k]; };
clear();
afterEach(clear);
after(() => { clear(); rmSync(DIR, { recursive: true, force: true }); });

const C = await import("../src/tools/fromcards.ts");
const T = await import("../src/tools.ts");
const { OPEN_TOOLS } = await import("../src/openfor.ts");
const { MODES, standsOn } = await import("../src/versions.ts");
const cards = (await import("../src/stations.json", { with: { type: "json" } })).default as Record<string, { station: string; offers?: string[] }>;

/** every switch that gates a tool set on by hand, in a mode */
const allOn = (mode: string) => { process.env.SOL_VERSION = mode; process.env.SOL_REACH_TOOLS = "on"; process.env.SOL_REACH_ROOM = "on"; process.env.SOL_OPEN_FOR = "on"; };
const names = () => T.solToolsNow().map((t) => t.name);
const txt = (r: { content: { type: string; text?: string }[] }) => String(r.content[0]?.text ?? "");

test("each tool a card offers is one of Sol's tools, and the cards that offer some today are the three at concept", () => {
  const real = new Set([...T.SOL_TOOLS, ...OPEN_TOOLS].map((t) => t.name));
  assert.ok(C.OFFERS.size > 0);
  for (const [t, o] of C.OFFERS) assert.ok(real.has(t), `${t} (offered by ${o.id}) is no tool of Sol's`);
  assert.deepEqual([...new Set([...C.OFFERS.values()].map((o) => o.id))].sort(), ["engine/team/reach", "product/cowork/room", "product/settings/open-for"]);
});

test("the ladder: a tool is offered in a mode when its card's station is at or past it; one no card offers, always", () => {
  const offers = C.offersFrom({
    "a.x": { station: "concept", side: "engine", id: "a", offers: ["t_concept"] },
    "b.x": { station: "complete", side: "engine", id: "b", offers: ["t_complete"] },
    "c.x": { station: "product", side: "engine", id: "c", offers: ["t_product"] },
    "d.x": { station: "settled", side: "engine", id: "d", offers: ["t_settled"] },
    "e.x": { station: "beta", side: "engine", id: "e", offers: ["t_unknown"] },
  });
  assert.equal(offers.has("t_unknown"), false);   // a row versions.ts leaves out offers nothing
  const keep = (mode: Parameters<typeof C.keepFor>[1]) => C.keepFor(["t_concept", "t_complete", "t_product", "t_settled", "t_free"].map((name) => ({ name })), mode, offers).map((t) => t.name);
  assert.deepEqual(keep("concept"), ["t_concept", "t_complete", "t_product", "t_settled", "t_free"]);
  assert.deepEqual(keep("complete"), ["t_complete", "t_product", "t_settled", "t_free"]);
  assert.deepEqual(keep("product"), ["t_product", "t_settled", "t_free"]);
  assert.deepEqual(keep(null), ["t_settled", "t_free"]);
});

test("product, every switch set on by hand: no tool of a card short of product is offered, and a call to one is refused", async () => {
  allOn("product");
  const short = Object.values(cards).filter((r) => !standsOn(r.station as never, "product")).flatMap((r) => r.offers ?? []);
  assert.ok(short.includes("agents_room") && short.includes("ask_agent"));
  const list = names();
  for (const t of short) assert.ok(!list.includes(t), `${t} is offered in product`);
  assert.ok(!short.includes("open_settings") && list.includes("open_settings"), "open.for's card stands at product (#1667), so its tools are offered");
  const r = await T.runSolTool("agents_room", {}, { sessionId: "s" });
  assert.equal(r.isError, true);
  assert.match(txt(r), /not part of this Sol yet/);
});

test("concept: the list is the one each tool's own switch makes, as before the cards, in every reading of the switches", () => {
  for (const on of [true, false]) {
    if (on) allOn("concept"); else { clear(); process.env.SOL_VERSION = "concept"; for (const k of ["SOL_REACH_TOOLS", "SOL_REACH_ROOM", "SOL_OPEN_FOR"]) process.env[k] = "off"; }
    const withCards = names();
    process.env.SOL_TOOLS_CARDS = "off";
    assert.deepEqual(withCards, names());
    delete process.env.SOL_TOOLS_CARDS;
  }
  allOn("concept");
  for (const t of ["agents_room", "ask_agent", "open_settings"]) assert.ok(names().includes(t), t);
});

test("tools.cards stands on in every mode; off, a hand-set switch puts its tools back in product", () => {
  for (const m of MODES) { process.env.SOL_VERSION = m; assert.equal(C.toolsCards(), true, m); }
  allOn("product");
  process.env.SOL_TOOLS_CARDS = "off";
  for (const t of ["agents_room", "ask_agent", "open_settings"]) assert.ok(names().includes(t), t);
});
