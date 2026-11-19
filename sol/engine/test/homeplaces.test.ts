// Places inside places, by the person's word (#1662, src/homeplaces.ts): made inside another or moved under another only
// on the person's own words this turn; a move carries every id the record keeps and the folder on disk; the first
// reading (onboardRead.ts) nests one level under a place it also named. On a home of its own, never the real one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "sol-places-"));
after(() => rmSync(HOME, { recursive: true, force: true }));
const P = await import("../src/homeplaces.ts");
const { readOf } = await import("../src/onboardRead.ts");

const SOL = join(HOME, "sol");
const REC = join(HOME, ".sol", "record", "me.json");
const record = () => JSON.parse(readFileSync(REC, "utf8"));
function fresh() {
  rmSync(join(HOME, ".sol"), { recursive: true, force: true }); rmSync(SOL, { recursive: true, force: true });
  mkdirSync(join(HOME, ".sol", "record"), { recursive: true });
  for (const d of ["clubs", "chess", "chess/openings"]) mkdirSync(join(SOL, d), { recursive: true });
  writeFileSync(join(SOL, "chess", "ground.json"), "{}");
  writeFileSync(REC, JSON.stringify({ v: 1, built: "2026-11-19", solHome: SOL, hands: "show",
    areas: [{ id: "clubs", name: "Clubs", part: "life", facts: [] }, { id: "chess", name: "Chess", part: "life", facts: ["f1"] }, { id: "chess/openings", name: "Openings", part: "life", facts: [] }],
    facts: [{ id: "f1", area: "chess" }, { id: "f2", area: "chess/openings" }, { id: "f3", area: "you" }],
    confirmed: { "c-area-chess": "yes" }, asks: [{ id: "c-area-chess", area: "chess", into: { area: "chess/openings", label: "put it in Openings" } }], unchecked: ["chess/openings"], madeDirs: ["clubs", "chess", "chess/openings"],
    consent: { v: 1, levels: { clubs: "show", chess: "draft", "chess/openings": "record" } } }, null, 2));
}
const said = (s: string) => ({ said: s });
const txt = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");

test("the two are Sol's own, and with no Home yet each says so and writes nothing", async () => {
  const { SOL_TOOLS } = await import("../src/tools.ts");
  assert.ok(["place_add", "place_move"].every((n) => SOL_TOOLS.some((t) => t.name === n)));
  rmSync(join(HOME, ".sol"), { recursive: true, force: true });
  const r = await P.runPlaceTool("place_add", { name: "Swim", inside: "Clubs", yes: "swim inside clubs" }, said("swim inside clubs"), HOME);
  assert.equal(r.isError, true);
  assert.ok(!existsSync(join(HOME, ".sol")));
});

test("nothing changes on words the person did not say this turn", async () => {
  fresh();
  const before = readFileSync(REC, "utf8");
  const r = await P.runPlaceTool("place_add", { name: "Swim", inside: "Clubs", yes: "make a swim place" }, said("what is in my clubs?"), HOME);
  assert.equal(r.isError, true);
  assert.equal(readFileSync(REC, "utf8"), before);
});

test("a place made inside another: its path, the outer's part, waiting to be made and checked", async () => {
  fresh();
  const told: object[] = [];
  P.setPlaceFaces((m) => told.push(m));
  const r = await P.runPlaceTool("place_add", { name: "Swim", inside: "clubs", yes: "swim inside clubs" }, said("Make a place for swim inside clubs please"), HOME);
  assert.ok(!r.isError, txt(r));
  const rec = record();
  assert.deepEqual(rec.areas.at(-1), { id: "clubs/swim", name: "Swim", part: "life", facts: [], said: "swim inside clubs" });
  assert.ok(rec.fillDirs.includes("clubs/swim") && rec.unchecked.includes("clubs/swim"));
  assert.deepEqual(told, [{ type: "home.record", why: "place_add", id: "clubs/swim" }]);
  // the same name twice in one place is said, not made again
  const again = await P.runPlaceTool("place_add", { name: "swim", inside: "Clubs", yes: "swim inside clubs" }, said("swim inside clubs"), HOME);
  assert.equal(again.isError, true);
});

test("a place moved under another carries everything under it, every id the record keeps, and its folder", async () => {
  fresh();
  const told: { moves?: unknown }[] = [];
  P.setPlaceFaces((m) => told.push(m as { moves?: unknown }));
  const r = await P.runPlaceTool("place_move", { place: "Chess", under: "Clubs", yes: "chess under clubs" }, said("put chess under clubs"), HOME);
  assert.ok(!r.isError, txt(r));
  const rec = record();
  assert.deepEqual(rec.areas.map((a: { id: string }) => a.id), ["clubs", "clubs/chess", "clubs/chess/openings"]);
  assert.deepEqual(rec.facts.map((f: { area: string }) => f.area), ["clubs/chess", "clubs/chess/openings", "you"]);
  assert.deepEqual(rec.confirmed, { "c-area-clubs/chess": "yes" });
  assert.deepEqual(rec.unchecked, ["clubs/chess/openings"]);
  assert.deepEqual(rec.asks, [{ id: "c-area-clubs/chess", area: "clubs/chess", into: { area: "clubs/chess/openings", label: "put it in Openings" } }]);
  // the old ids stay among the made, so a later onboarding never makes their folders anew
  assert.deepEqual(rec.madeDirs, ["clubs", "clubs/chess", "clubs/chess/openings", "chess", "chess/openings"]);
  // never freer than the place it went under: draft under show is show
  assert.deepEqual(rec.consent.levels, { clubs: "show", "clubs/chess": "show", "clubs/chess/openings": "record" });
  assert.ok(existsSync(join(SOL, "clubs", "chess", "ground.json")) && existsSync(join(SOL, "clubs", "chess", "openings")) && !existsSync(join(SOL, "chess")));
  assert.deepEqual(told[0].moves, [["chess", "clubs/chess"], ["chess/openings", "clubs/chess/openings"]]);
  // and back to the top
  const back = await P.runPlaceTool("place_move", { place: "clubs/chess", under: "", yes: "chess back to the top" }, said("move chess back to the top"), HOME);
  assert.ok(!back.isError, txt(back));
  assert.deepEqual(record().areas.map((a: { id: string }) => a.id), ["clubs", "chess", "chess/openings"]);
  assert.ok(existsSync(join(SOL, "chess", "ground.json")));
});

test("a new inner place takes its outer's level; one moved to the top never takes an id the face keeps", async () => {
  fresh();
  await P.runPlaceTool("place_add", { name: "You", inside: "Chess", yes: "you inside chess" }, said("make you inside chess"), HOME);
  assert.equal(record().consent.levels["chess/you"], "draft");
  const r = await P.runPlaceTool("place_move", { place: "chess/you", under: "", yes: "move it to the top" }, said("move it to the top"), HOME);
  assert.ok(!r.isError, txt(r));
  assert.ok(record().areas.some((a: { id: string }) => a.id === "place-you") && !record().areas.some((a: { id: string }) => a.id === "you"));
});

test("a move into itself, or onto a folder that is there, changes nothing", async () => {
  fresh();
  const before = readFileSync(REC, "utf8");
  const into = await P.runPlaceTool("place_move", { place: "Chess", under: "Openings", yes: "chess under openings" }, said("chess under openings"), HOME);
  assert.equal(into.isError, true);
  mkdirSync(join(SOL, "clubs", "chess"));
  const onto = await P.runPlaceTool("place_move", { place: "Chess", under: "Clubs", yes: "chess under clubs" }, said("chess under clubs"), HOME);
  assert.equal(onto.isError, true);
  assert.equal(readFileSync(REC, "utf8"), before);
  assert.ok(existsSync(join(SOL, "chess", "ground.json")));
});

test("the first reading nests one level under a place it also named, and only one", () => {
  const SAID = "I have two kids. Lia does chess at her club. I run a bakery.";
  const r = readOf(JSON.stringify({ areas: [
    { name: "Chess", en: "Chess", part: "life", in: "Family", from: 2 },
    { name: "Family", en: "Family", part: "life", in: "", from: 1 },
    { name: "Bakery", en: "Bakery", part: "work", in: "Chess", from: 3 },
  ], off: [], unsure: [] }), SAID)!;
  assert.deepEqual(r.areas.map((a) => [a.id, a.part]), [["family", "life"], ["family/chess", "life"], ["bakery", "work"]]);
  // an `in` naming nothing it read stays at the top; no `in` at all reads as before
  const flat = readOf(JSON.stringify({ areas: [{ name: "Family", en: "Family", part: "life", in: "Kids", from: 1 }, { name: "Bakery", en: "Bakery", part: "work", from: 3 }], off: [], unsure: [] }), SAID)!;
  assert.deepEqual(flat.areas.map((a) => a.id), ["family", "bakery"]);
});
