// node --test src/*.test.ts: the stage joined to the engine (#709): the wire's shapes as the face reads them (a body as a
// file's text, a ledger line's event), and the engine store's asks and answers on a fake socket.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyFor, fromEngine, lineOf, EngineStore } from "./stage/engineStore.ts";

test("bodyFor: the agent's json shapes read as the kinds read them", () => {
  assert.deepEqual(bodyFor("list", { format: "json", text: '[{"t":"a","st":"done"}]' }), { steps: [{ t: "a", st: "done" }] });
  assert.deepEqual(bodyFor("list", { format: "json", text: '{"steps":[{"t":"b","st":""}]}' }), { steps: [{ t: "b", st: "" }] });
  assert.deepEqual(bodyFor("shots", { format: "json", text: '[{"name":"one","path":"/a.png"}]' }), { stills: [{ name: "one", path: "/a.png", src: "/a.png" }] });
  assert.deepEqual(bodyFor("table", { format: "json", text: '{"columns":["a"],"rows":[["1"]]}' }), { cols: ["a"], rows: [["1"]] });
  assert.deepEqual(bodyFor("card", { format: "md", text: "# gate green\nstable 3 behind\nidle" }), { big: "gate green", sub: "stable 3 behind · idle" });
  assert.deepEqual(bodyFor("diff", { format: "diff", text: "-a\n+b" }), { text: "-a\n+b" });
  assert.deepEqual(bodyFor("page", { format: "html", text: "<p>x</p>" }), { html: "<p>x</p>" });
  assert.deepEqual(bodyFor("page", { format: "md", text: "# x" }), { text: "# x" });
  assert.equal(bodyFor("page", undefined), undefined);
});

test("fromEngine: blocks with their bodies and ledgers, the stage as it is, ready", () => {
  const s = fromEngine({
    stage: { lens: "app", tiled: false, blocks: [{ id: "week", x: 12, y: 12, w: 440, h: 300, z: 1, auto: true }] },
    blocks: [{ id: "week", kind: "page", title: "the week", state: "live", versions: [], sessions: ["s"], bind: { source: "/x/calendar.ts", watch: "file" },
      body: { format: "html", text: "<p/>" }, lines: [{ n: 1, at: 5, ev: "composed", by: "me", note: 'page "the week"' }] }],
  });
  assert.equal(s.ready, true);
  assert.deepEqual(s.blocks[0].bind, { source: "/x/calendar.ts", watch: "file" });
  assert.deepEqual(s.blocks[0].body, { html: "<p/>" });
  assert.deepEqual(s.ledger.week, [{ at: 5, by: "me", what: 'composed · page "the week"' }]);
  assert.equal(s.stage.blocks.length, 1);
  assert.deepEqual(lineOf({ at: 1, ev: "frozen", by: "you" }), { at: 1, by: "you", what: "frozen" });
});

test("EngineStore: asks once, shows the answer, asks again on a change; a layout shows at once and is written", async () => {
  const sent: { type: string; a: any }[] = [];
  let hear: (m: any) => void = () => {};
  const answer = { stage: { lens: "app", tiled: false, blocks: [{ id: "b1", x: 0, y: 0, w: 10, h: 10, z: 1 }] }, blocks: [{ id: "b1", kind: "card", title: "t", state: "waits", versions: [], sessions: ["s1"], body: { format: "md", text: "big" } }] };
  const ask = (async (type: string, a: object) => { sent.push({ type, a }); return type === "work.stage.get" ? answer : {}; }) as any;
  const st = new EngineStore();
  st.connect(ask, (f) => { hear = f; return () => {}; });
  assert.equal(st.read("s1").ready, false);
  let told = 0;
  st.subscribe("s1", () => told++);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(st.read("s1").ready, true);
  assert.equal(st.read("s1").blocks[0].title, "t");
  assert.ok(told >= 1);
  hear({ type: "work.stage.changed", sessionId: "other", block: { id: "b1", sessions: ["s1"] } });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(sent.filter((s) => s.type === "work.stage.get").length, 2);
  st.place("s1", { lens: "app", tiled: true, blocks: [] });
  assert.equal(st.read("s1").stage.tiled, true);
  assert.equal(sent.at(-1)!.type, "work.stage.layout");
  st.update("s1", "b1", { state: "live" }, "your yes");
  assert.deepEqual(sent.at(-1), { type: "work.stage.update", a: { sessionId: "s1", id: "b1", state: "live", note: "your yes" } });
  st.compose("s1", { id: "x1", kind: "list", title: "l", state: "waits", versions: [], sessions: [], body: { steps: [] } }, { x: 1, y: 2, w: 3, h: 4, z: 5 });
  assert.equal(sent.at(-1)!.type, "work.stage.compose");
  assert.equal(sent.at(-1)!.a.block.waits, true);
  assert.deepEqual(sent.at(-1)!.a.at, { x: 1, y: 2, w: 3, h: 4, z: 5 });
});

test("#744: a page bound to an html file carries where its files are, and its frame gets a <base> at its head", async () => {
  const { withBase } = await import("./stage/kinds/parts.ts");
  assert.deepEqual(bodyFor("page", { format: "html", text: "<p>hi</p>", base: "/pane-asset/k.x/%2Fa/" }), { html: "<p>hi</p>", base: "/pane-asset/k.x/%2Fa/" });
  assert.deepEqual(bodyFor("page", { format: "html", text: "<p>hi</p>" }), { html: "<p>hi</p>" });
  const H = "http://127.0.0.1:7777/pane-asset/k.x/%2Fa/";
  assert.equal(withBase('<html><head><link rel="stylesheet" href="a.css"></head><body><img src="kinds/x.png"></body></html>', H),
    `<html><head><base href="${H}"><link rel="stylesheet" href="a.css"></head><body><img src="kinds/x.png"></body></html>`);
  assert.equal(withBase('<img src="kinds/x.png">', H), `<base href="${H}"><img src="kinds/x.png">`);
  assert.equal(withBase('<head><base href="/own/"></head>', H), '<head><base href="/own/"></head>');   // its own base is kept
  assert.equal(withBase("<p>hi</p>", undefined), "<p>hi</p>");
});
