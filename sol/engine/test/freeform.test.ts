// Freeform's foundation (#630, #629): tokens as data, the contract number, the frame, the record. The face's pure file
// (mac/src/home/frameRules.ts) is read here as meta.test.ts reads the atlas; the sample thing is the fixture in
// sol/design/system/fixtures/things/week (never anyone's real home).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contractNow, readThings, TOKENS_FILE } from "../src/things.ts";
import { declarePlace, declared, resetPlaces, loadThings, checkRecord, htmlFault, srcdoc, stateOf, flip, ordered, FrameError } from "../../mac/src/home/frameRules.ts";
const tokens = await import("../../design/system/tokens.mjs");
const atlasMod = await import("../../design/atlas/build.mjs");

const SOL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = join(SOL, "design/system/fixtures");
const home = () => { const d = mkdtempSync(join(tmpdir(), "sol-things-")); cpSync(join(FIXTURE, "things"), join(d, "things"), { recursive: true }); return d; };

test("tokens: tokens.json holds, says contract 1 with no migrations, and the committed css is what it makes", () => {
  const t = tokens.readTokens();
  assert.deepEqual(tokens.problems(t), []);
  assert.equal(t.contract, 1);
  assert.deepEqual(t.migrations, []);
  for (const [k, v] of Object.entries(t.tokens) as [string, { value: string; serves: string }][]) assert.ok(v.value && v.serves, `--${k} has its value and what it serves`);
  assert.equal(readFileSync(join(SOL, "mac/src/tokens.css"), "utf8"), tokens.css(t), "tokens.css is generated, never edited: run node sol/design/system/tokens.mjs");
  assert.deepEqual(tokens.drift(t, readFileSync(join(SOL, "mac/src/face.css"), "utf8")), [], "the face.css values written by hand agree with tokens.json");
});

test("tokens: a contract step without its migration, a migration not { from, to, keys }, a token with no rule: refused", () => {
  const ok = { ...tokens.readTokens(), contract: 1, migrations: [], tokens: { a: { value: "1px", serves: "x" } } };
  assert.deepEqual(tokens.problems(ok), []);
  assert.match(tokens.problems({ ...ok, contract: 2 }).join("\n"), /step to 2 has no entry/);
  assert.deepEqual(tokens.problems({ ...ok, contract: 2, migrations: [{ from: 1, to: 2, keys: { a: "b" } }] }), []);
  assert.deepEqual(tokens.problems({ ...ok, contract: 3, migrations: [{ from: 1, to: 2, keys: { a: null } }, { from: 2, to: 3, keys: { b: "c" } }] }), []);
  assert.match(tokens.problems({ ...ok, contract: 2, migrations: [{ from: 1, to: 2 }] }).join("\n"), /"keys" is \{ old: new \}/);
  assert.match(tokens.problems({ ...ok, contract: 2, migrations: [{ from: 1, to: 2, keys: { a: "a" } }] }).join("\n"), /keys\.a/);
  assert.match(tokens.problems({ ...ok, contract: 3, migrations: [{ from: 1, to: 3, keys: { a: "b" } }] }).join("\n"), /from \+ 1/);
  assert.match(tokens.problems({ ...ok, contract: 2, migrations: [{ from: 1, to: 2, keys: { a: "b" } }, { from: 1, to: 2, keys: { c: "d" } }] }).join("\n"), /one per bump/);
  assert.match(tokens.problems({ ...ok, migrations: [{ from: 1, to: 2, keys: { a: null } }] }).join("\n"), /past the contract/);
  assert.match(tokens.problems({ ...ok, places: [] }).join("\n"), /places/);
  assert.match(tokens.problems({ ...ok, tokens: { a: { value: "1px" } } }).join("\n"), /serves/);
  assert.match(tokens.problems({ ...ok, tokens: { a: { value: "1px; color: red", serves: "x" } } }).join("\n"), /one css value/);
  assert.match(tokens.problems({ ...ok, contract: 0 }).join("\n"), /whole number/);
  const css = tokens.css({ ...ok, contract: 4 });
  assert.match(css, /--contract: 4;/);
  assert.match(css, /--a: 1px;   \/\* x \*\//);
  assert.deepEqual(tokens.drift({ tokens: { a: { value: "1px", serves: "x", hand: "face.css" } } }, ":root {\n  --a: 2px;\n}\n"), [{ name: "a", json: "1px", face: "2px" }]);
});

test("the contract: the engine reads the one number from tokens.json, null when it cannot", () => {
  assert.equal(contractNow(), 1);
  assert.equal(contractNow(TOKENS_FILE), 1);
  const d = mkdtempSync(join(tmpdir(), "sol-tok-"));
  assert.equal(contractNow(join(d, "none.json")), null);
  writeFileSync(join(d, "t.json"), '{"contract": "1"}');
  assert.equal(contractNow(join(d, "t.json")), null, "a number, not a string");
});

test("the home's things: read as they are, a folder that cannot be read says why, nothing outside the folder", () => {
  const h = home();
  const [week] = readThings(h);
  assert.equal(week.id, "week");
  assert.equal(week.error, undefined);
  assert.equal(week.ask?.trim(), "show my week as a calendar, free in green");
  assert.match(week.html ?? "", /<div class="wk"/);
  assert.equal((week.record as { contract: number }).contract, 1);
  mkdirSync(join(h, "things", "bad")); writeFileSync(join(h, "things", "bad", "record.json"), "{ nope");
  mkdirSync(join(h, "things", "empty"));
  mkdirSync(join(h, "things", "Not An Id"));
  writeFileSync(join(h, "things", "stray.txt"), "x");
  mkdirSync(join(h, "things", "link")); writeFileSync(join(h, "secret.txt"), "x");
  writeFileSync(join(h, "things", "link", "record.json"), JSON.stringify({ versions: [{ v: 1, file: "v1.html" }] }));
  symlinkSync(join(h, "secret.txt"), join(h, "things", "link", "v1.html"));
  const by = Object.fromEntries(readThings(h).map((t) => [t.id, t]));
  assert.match(by.bad.error ?? "", /not JSON/);
  assert.match(by.empty.error ?? "", /record.json is missing/);
  assert.match(by["Not An Id"].error ?? "", /not an id/);
  assert.match(by["stray.txt"].error ?? "", /not a folder/, "never skipped in silence");
  assert.match(by.link.error ?? "", /not a plain file/, "a link out of the thing's folder is refused, never followed");
  assert.deepEqual(readThings(join(h, "nowhere")), []);
  rmSync(h, { recursive: true, force: true });
});

test("the frame: a place is declared by one owner, an undeclared or unknown place fails at load, a declaration unwinds", () => {
  resetPlaces();
  assert.throws(() => declarePlace("dock", "Home"), FrameError, "not a place of the frame");
  const undo = declarePlace("card", "Home");
  assert.deepEqual(declared(), ["card"]);
  assert.doesNotThrow(() => declarePlace("card", "Home")(), "the same owner again is the same claim");
  declarePlace("card", "Home");
  assert.throws(() => declarePlace("card", "Settings"), /declared by Home/);
  const h = home();
  const wire = readThings(h);
  assert.equal(loadThings(wire, declared()).loaded.length, 1);
  undo();
  assert.deepEqual(declared(), []);
  const off = loadThings(wire, declared());
  assert.equal(off.loaded.length, 0);
  assert.match(off.refused[0].why, /the card, which this face has not declared/);
  const dock = wire.map((t) => ({ ...t, record: { ...(t.record as object), place: "dock" } }));
  assert.match(loadThings(dock, ["card"]).refused[0].why, /"dock", which is not a place of the frame/);
  assert.match(loadThings([{ id: "x", record: null, ask: null, html: null, error: "record.json is missing" }], ["card"]).refused[0].why, /missing/);
  rmSync(h, { recursive: true, force: true });
});

test("the record: the same Meta a part carries, plus ask, contract, reads, writes and versions; one that does not hold says why", () => {
  const raw = JSON.parse(readFileSync(join(FIXTURE, "things/week/record.json"), "utf8"));
  const ask = "show my week as a calendar, free in green";
  const ok = checkRecord(raw, "week", ask);
  assert.ok(ok.ok);
  if (ok.ok) { assert.equal(ok.record.ask, ask); assert.equal(ok.record.current, 1); assert.deepEqual(ok.record.reads, ["calendar.week"]); }
  const why = (r: object, a: string | null = ask) => { const c = checkRecord({ ...raw, ...r }, "week", a); return c.ok ? "" : c.why; };
  assert.match(why({ id: "other" }), /the folder is "week"/);
  assert.match(why({ flow: "dance" }), /ten flows/);
  assert.match(why({ contract: undefined }), /contract/);
  assert.match(why({ reads: "calendar" }), /reads and writes/);
  assert.match(why({ versions: [{ v: 1, file: "../x.html", at: "", contract: 1 }] }), /versions/);
  assert.match(why({ current: 2 }), /version 2/);
  assert.match(why({}, null), /ask.md is missing/);
  assert.match(why({ job: "" }), /job/);
});

test("the frame: html broken anywhere says the line; good html, optional ends and scripts are not faults", () => {
  assert.equal(htmlFault(readFileSync(join(FIXTURE, "things/week/v1.html"), "utf8")), null, "the sample is whole");
  assert.equal(htmlFault("<ul><li>a<li>b</ul><p>one<p>two<br><img src=x><input/>"), null);
  assert.equal(htmlFault('<div title="a > b">x</div><script>if (a < b) "</div>"</script><!-- <div> -->'), null);
  assert.deepEqual(htmlFault("<main>\n<div>\n<section>\n</div>\n</main>"), { why: "<section> from line 3 is still open at </div>", line: 4 });
  assert.deepEqual(htmlFault("<div>\n  <span>x\n</div>"), { why: "<span> from line 2 is still open at </div>", line: 3 });
  assert.deepEqual(htmlFault("<p>a</p>\n</div>"), { why: "</div> closes nothing", line: 2 });
  assert.deepEqual(htmlFault("<div>\n<b>x</b>"), { why: "<div> is never closed", line: 1 });
  assert.deepEqual(htmlFault("<div>\n<b class='x'\n"), { why: "<b never closes its tag", line: 2 });
  assert.deepEqual(htmlFault("x\n<script>let a = 1"), { why: "<script> never closes", line: 2 });
  assert.deepEqual(htmlFault("<!-- open"), { why: "a comment never closes", line: 1 });
  assert.deepEqual(htmlFault("  \n"), { why: "the thing is empty", line: 1 });
  assert.equal(htmlFault("<div>a</p>b</div>"), null, "a stray </p> is an empty p to a browser, not a break");
  assert.equal(htmlFault("<a title=it's href=x>a</a>\n<b>b</b>"), null, "an apostrophe in an unquoted value opens no quote");
  assert.equal(htmlFault("<SCRIPT>x</Script><STYLE>a{}</style>"), null, "raw text closes whatever the case");
  assert.deepEqual(htmlFault("<p>\n".repeat(20000) + "</div>"), { why: "</div> closes nothing", line: 20001 }, "a long thing is read in one pass");
});

test("the frame: the thing's document keeps its own line numbers, under a doctype or not, and carries the contract's variables", () => {
  const html = "<!doctype html>\n<p>a</p>\n<script>boom()</script>";
  const doc = srcdoc(html, ":root {\n  --a: 1px;\n}\n", "week");
  assert.equal(doc.split("\n").length, html.split("\n").length, "nothing added a line");
  assert.ok(doc.startsWith("<!doctype html><style>:root { --a: 1px; }"), "the doctype stays first, so the document is not in quirks mode");
  assert.match(doc, /solThing:"week"/);
  assert.equal(srcdoc("<p>x</p>", "", "w").split("\n").length, 1);
  assert.ok(srcdoc("<!-- made by my AI -->\n<!DOCTYPE html>\n<p>a</p>", "", "w").startsWith("<!-- made by my AI -->\n<!DOCTYPE html><style>"), "a comment before the doctype keeps the doctype first");
  assert.match(srcdoc("<p>x</p>", "", "w"), /<\/script><p>x<\/p>$/);
});

test("the frame: state, pin and order", () => {
  assert.equal(stateOf({ fault: { why: "x", line: 1 }, loaded: true, made: 1, contract: 1 }), "broken");
  assert.equal(stateOf({ fault: null, loaded: false, made: 1, contract: 1 }), "loading");
  assert.equal(stateOf({ fault: null, loaded: true, made: 1, contract: 2 }), "stale", "made under an older contract");
  assert.equal(stateOf({ fault: null, loaded: true, made: 1, contract: 1 }), "shown");
  assert.equal(stateOf({ fault: null, loaded: true, made: 1, contract: null }), "shown", "no contract known: never called stale");
  assert.deepEqual(flip(["a"], "b"), ["a", "b"]);
  assert.deepEqual(flip(["a", "b"], "a"), ["b"]);
  const xs = ["a", "b", "c", "d"].map((id) => ({ record: { id } }));
  assert.deepEqual(ordered(xs, ["c", "a"]).map((x) => x.record.id), ["c", "a", "b", "d"]);
});

test("the atlas: a thing from the home is drawn like a part of ours, rendered by the part that declares its place", () => {
  const places = atlasMod.declaredPlaces();
  assert.equal(places.card, "Things", "Home's things declare the card place");
  const h = home();
  mkdirSync(join(h, "things", "dock"));
  writeFileSync(join(h, "things", "dock", "record.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(FIXTURE, "things/week/record.json"), "utf8")), id: "dock", place: "notch" }));
  writeFileSync(join(h, "things", "dock", "ask.md"), "a dock");
  for (const [id, rec] of [["anull", "null"], ["bstates", JSON.stringify({ ...JSON.parse(readFileSync(join(FIXTURE, "things/week/record.json"), "utf8")), states: "x", versions: {} })]]) {
    mkdirSync(join(h, "things", id)); writeFileSync(join(h, "things", id, "record.json"), rec); writeFileSync(join(h, "things", id, "ask.md"), "a");
  }
  const { things, refused } = atlasMod.readThings(h, places);
  assert.deepEqual(things.map((t: { name: string }) => t.name), ["things/week"]);
  assert.deepEqual(refused, [
    { id: "anull", why: "record.json is not an object" },
    { id: "bstates", why: "the record's states, versions are not of its kind" },
    { id: "dock", why: "asks for the notch, which the face has not declared" },
  ], "a record that does not hold is refused with why, never a crash of the builder");
  const { parts } = atlasMod.readParts();
  const a = atlasMod.atlas(atlasMod.withThings(parts, things), atlasMod.readFlows(), refused);
  const week = a.parts.find((p: { name: string }) => p.name === "things/week");
  assert.equal(week.thing.ask, "show my week as a calendar, free in green");
  assert.equal(week.thing.contract, 1);
  assert.notEqual(week.presses, null, "reached from Home through the part that renders it");
  assert.ok(a.parts.find((p: { name: string }) => p.name === "Things").renders.includes("things/week"));
  assert.deepEqual(a.flags.refused, refused);
  const page = atlasMod.page(a, "yours");
  assert.match(page, /Your things, and their records/);
  assert.match(page, /show my week as a calendar, free in green/);
  assert.match(page, /The parts, ours and yours/);
  assert.equal(atlasMod.page(atlasMod.atlas(parts, atlasMod.readFlows())).includes("yours"), false, "ours stays ours: no thing in graph.html");
  rmSync(h, { recursive: true, force: true });
});

test("the engine: /health says contract 1, and /things hands the face the home's things", { timeout: 90_000 }, async () => {
  const { spawn } = await import("node:child_process");
  const { freePort, ownHealth } = await import("./test-engine.ts");
  const port = await freePort();
  const d = mkdtempSync(join(tmpdir(), "sol-freeform-engine-"));
  const h = join(d, "home");
  mkdirSync(h); cpSync(join(FIXTURE, "things"), join(h, "things"), { recursive: true });
  const engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: join(SOL, "engine"), stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(port), SOL_HOME: h, SOL_PROFILE: join(d, "profile"),
      SOL_STATE: join(d, "work.json"), SOL_TEAM: join(d, "team.json"), SOL_LOG: join(d, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
    },
  });
  try {
    const health: { contract?: unknown } = await ownHealth(engine, port);   // this test's engine, not another run's on the port (#938)
    assert.equal(health.contract, 1);
    const t = await (await fetch(`http://127.0.0.1:${port}/things`)).json() as { contract: number; things: { id: string; ask: string; html: string }[] };
    assert.equal(t.contract, 1);
    assert.deepEqual(t.things.map((x) => x.id), ["week"]);
    assert.match(t.things[0].html, /class="wk"/);
    assert.deepEqual(loadThings(t.things as never, ["card"]).refused, [], "what the engine hands over, the face loads");
    for (const origin of ["null", "https://example.com"])
      assert.equal((await fetch(`http://127.0.0.1:${port}/things`, { headers: { origin } })).status, 403, `the door refuses ${origin}: a sandboxed thing or another site never reads the home's things`);
  } finally { engine.kill(); rmSync(d, { recursive: true, force: true }); }
});
