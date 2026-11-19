// node --test src/*.test.ts (npm test here): the frame's paths where the kernel (#633) and the after-release pass (#634)
// meet (home/frameRules.ts): a remake's relocation to a card, the state's precedence with both, the card's lines, GET
// /things with the engine half and the release together, and the card's press reading the engine's ok.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadThings, stateOf, releaseLines, pressRelease, type ThingWire, type ReleaseWire } from "./home/frameRules.ts";

const record = (o: Record<string, unknown> = {}) => ({
  title: "Weather", place: "pane", job: "the weather, at a glance", flow: "mine", states: ["shown"], keys: [], listens: [],
  contract: 1, reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-01", contract: 1 }], ...o,
});
const wire = (id: string, o: Record<string, unknown> = {}, extra: Partial<ThingWire> = {}): ThingWire =>
  ({ id, record: record(o), ask: "show me the weather", html: "<p>sun</p>", ...extra });

test("a thing marked remake whose place the contract dropped stands on Home as a card; one not marked is refused", () => {
  const { loaded, refused } = loadThings([
    wire("moved", { place: "notch", remake: { why: "the notch is gone" } }),
    wire("kept", { place: "notch" }),
  ], ["card"]);
  assert.deepEqual(loaded.map((t) => t.record.id), ["moved"]);
  assert.equal(loaded[0].record.place, "notch");   // the record keeps what it asked for; only where it stands moved
  assert.deepEqual(refused.map((r) => r.id), ["kept"]);
  assert.match(refused[0].why, /"notch", which is not a place of the frame/);
});

test("stateOf with the kernel and the release together: broken wins over remake, remake over stale", () => {
  const base = { loaded: true, made: 1, contract: 2 };
  assert.equal(stateOf({ ...base, fault: { why: "its engine half is broken", line: null }, remake: true }), "broken");
  assert.equal(stateOf({ ...base, fault: null, loaded: false, remake: true }), "loading");
  assert.equal(stateOf({ ...base, fault: null, remake: true }), "remake");
  assert.equal(stateOf({ ...base, fault: null, remake: false }), "stale");
  assert.equal(stateOf({ ...base, fault: null, made: 2 }), "shown");
});

test("releaseLines: one line for what moved, its renames once each, one per thing marked remake", () => {
  const p: ReleaseWire = { contract: 2, at: "2026-11-05", moved: [{ id: "a", from: 1, renamed: ["--x"] }, { id: "b", from: 1, renamed: ["--x", "--y"] }], marked: [{ id: "c", why: "its place is gone" }] };
  const l = releaseLines(p);
  assert.equal(l.head, "Sol updated to contract 2");
  assert.equal(l.moved, "2 things moved to contract 2: a, b (--x, --y)");
  assert.deepEqual(l.marked, ["c: marked remake, its place is gone; its last version stays until it is remade"]);
  assert.equal(releaseLines({ ...p, moved: [] }).moved, null);
});

test("loadThings on a GET /things with the engine half and the release: each thing keeps its engine, the release is the card's", () => {
  const body: { contract: number; things: ThingWire[]; release: ReleaseWire } = {
    contract: 2,
    things: [
      wire("live", { place: "card" }, { engine: { state: "loaded", tools: ["weather.read"] } }),
      wire("face", { place: "card" }),
      wire("old", { place: "notch", remake: { why: "the notch is gone" } }, { engine: { state: "broken", why: "it threw", tools: [] } }),
    ],
    release: { contract: 2, at: "2026-11-05", moved: [{ id: "live", from: 1, renamed: [] }], marked: [{ id: "old", why: "the notch is gone" }] },
  };
  const { loaded, refused } = loadThings(body.things, ["card"]);
  assert.deepEqual(refused, []);
  assert.deepEqual(loaded.map((t) => [t.record.id, t.engine?.state ?? null]), [["live", "loaded"], ["face", null], ["old", "broken"]]);
  assert.equal("engine" in loaded[1], false);
  assert.equal(releaseLines(body.release).marked.length, 1);
});

test("the card's press: ok:false is a refusal with its reason and is not taken for a step done", async () => {
  const asked: string[] = [];
  const stub = (status: number, body: string): typeof fetch => (async (url: string | URL | Request) => { asked.push(String(url)); return new Response(body, { status }); }) as typeof fetch;
  assert.deepEqual(await pressRelease("undo", "http://e", stub(200, JSON.stringify({ ok: false, why: "the pass is already undone" }))), { ok: false, why: "the pass is already undone" });
  assert.deepEqual(await pressRelease("close", "http://e", stub(200, JSON.stringify({ ok: false }))), { ok: false, why: "no reason given" });
  assert.deepEqual(await pressRelease("undo", "http://e", stub(500, "oops")), { ok: false, why: "the engine answered 500" });
  assert.deepEqual(await pressRelease("undo", "http://e", (async () => { throw new Error("refused"); }) as typeof fetch), { ok: false, why: "the engine did not answer (refused)" });
  assert.deepEqual(await pressRelease("close", "http://e", stub(200, JSON.stringify({ ok: true }))), { ok: true });
  assert.deepEqual(asked, ["http://e/things/release/undo", "http://e/things/release/close", "http://e/things/release/undo", "http://e/things/release/close"]);
});
