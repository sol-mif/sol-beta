// node --test src/*.test.ts: the move-in's sort, kept after it (BR1, #1615; migration.html D, Marco 16:30). D's Sol box
// says the promise word for word; "tidy my folders" in the bar runs the sort, each move on the frame with its own Undo;
// the raise's presses on an offer reach the engine. The engine's half is sol/engine/src/next/tidy.test.ts. Signed:
// marcocyl04-ux's agent (builder T), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { TIDY } from "./next/cv/say/tidy.ts";
import { NO_ENGINE, NOTHING, isOffer, offerNo, offerYes, tidyRun, useAsk } from "./next/cv/wire/tidy.ts";

type Sent = { type: string } & Record<string, unknown>;
/** a stand-in engine: every message sent, answered by `reply` */
function engine(reply: (m: Sent) => unknown) {
  const sent: Sent[] = [];
  useAsk((async (m: Sent) => { sent.push(m); return reply(m); }) as never);
  return sent;
}
const tick = () => new Promise((r) => setTimeout(r, 0));
type Act = { label: string; run: () => void };
/** the frame's line as the shell gives it (hooks.flash is frame.say): the last one said */
let line: { text: string; act?: Act; no?: Act } | null = null;
CV.hooks.flash = (text, act, no) => { line = { text, act, no }; };

test("D's Sol box says the promise as drawn, beside the folders and Move in", () => {
  const src = readFileSync(new URL("./next/movein/Migration.tsx", import.meta.url), "utf8");
  assert.ok(src.includes(`export const TIDY_SAY = 'As you add more, I\\'ll offer to sort it the same way. You can also ask me any time: "tidy my folders".';`), "word for word, migration.html D");
  const calm = src.slice(src.indexOf("function Calm("), src.indexOf("export const TIDY_SAY"));
  assert.match(calm, /className="mg-say" data-mgsay="tidy"><div className="who"><b \/>Sol<\/div><p>\{TIDY_SAY\}<\/p>/, "the box in Calm: the who line, then the words");
  assert.ok(calm.indexOf("mg-say") > calm.indexOf("Move in"), "drawn after the folders and Move in, in the right column");
  const css = readFileSync(new URL("./next/movein/migration.css", import.meta.url), "utf8");
  assert.match(css, /\.mg-step\.mg-calm \{ display: grid; grid-template-columns: 1fr calc\(340px \* var\(--k\)\)/, "the drawing's .calm: 1fr and 340px");
});

test("the bar hears tidy my folders in its ordinary words, and nothing that only mentions folders", () => {
  for (const w of ["tidy my folders", "sort my folders", "tidy up my folders", "please tidy my folders", "tidy the folders", "sort all my folders."]) assert.match(w, TIDY, w);
  for (const w of ["tidy", "my folders", "tidy my folders and delete the rest", "open my folders", "sort my files"]) assert.doesNotMatch(w, TIDY, w);
});

test("tidy my folders, typed in the bar: every move made now, told one at a time, each with its own Undo", async () => {
  line = null;
  const sent = engine((m) => m.type === "next.tidy.run"
    ? { moves: [{ id: "o:inside:w:/u/someone/code/shop", batch: "sort-1", done: "Cli is inside shop now.", what: "cli inside shop" }, { id: "o:shelf:shelf", batch: "sort-2", done: "I archived once. Nothing is deleted.", what: "once archived" }] }
    : { ok: true });
  assert.equal(CV.say("Tidy my folders")?.ok, true, "the bar's Done: the sort was asked");
  await tick();
  assert.deepEqual(sent.map((m) => m.type), ["next.tidy.run"]);
  assert.equal(line!.text, "Cli is inside shop now. (1 of 2)", "the first move, and how many");
  assert.equal(line!.no?.label, "Undo"); assert.equal(line!.act?.label, "Next");
  line!.act!.run();   // Next: kept, the second told
  assert.equal(line!.text, "I archived once. Nothing is deleted. (2 of 2)");
  assert.equal(line!.act?.label, "Undo"); assert.equal(line!.no, undefined, "the last has no Next");
  line!.act!.run(); await tick();
  assert.deepEqual(sent.at(-1), { type: "next.tidy.undo", id: "o:shelf:shelf", batch: "sort-2" }, "its own batch, nothing else");
  assert.equal(line!.text, "Undone: once archived as before.");
  assert.equal(sent.filter((m) => m.type === "next.tidy.undo").length, 1, "the first move, kept with Next, is never undone");

  CV.say("sort my folders"); await tick();
  line!.no!.run(); await tick();   // Undo on the first: undone, said, and the second told after it
  assert.deepEqual(sent.at(-1), { type: "next.tidy.undo", id: "o:inside:w:/u/someone/code/shop", batch: "sort-1" });
  assert.equal(line!.text, "Undone: cli inside shop as before. I archived once. Nothing is deleted. (2 of 2)");
  useAsk(null);
});

test("nothing to sort is said, never a blank; no engine is said, and nothing moves", async () => {
  line = null;
  engine(() => ({ moves: [] }));
  tidyRun(); await tick();
  assert.equal(line!.text, NOTHING);
  engine(() => null);
  tidyRun(); await tick();
  assert.equal(line!.text, NO_ENGINE, "the engine did not answer");
  useAsk(null);
  assert.equal(tidyRun().ok, false);
  assert.equal(line!.text, NO_ENGINE);
});

test("the folder's one raise sends an offer's yes and no to the engine, beside its own answer line", () => {
  const src = readFileSync(new URL("./next/plane/Raise.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("onClick={() => { answered(rid, r.a, yesWords(r.a)); if (isOffer(r.a)) void offerYes(r.a.id); }}"), "Sort them: the move made");
  assert.ok(src.includes("onClick={() => { answered(rid, r.a, String(r.a.no)); M.answer(r.a.id); if (isOffer(r.a)) void offerNo(r.a.id); }}"), "Leave them: one answer line");
  assert.ok(src.includes('import { isOffer, offerNo, offerYes } from "../cv/wire/tidy.ts";'));
});

test("the raise's Sort them and Leave them on an offer reach the engine; its Undo is on the frame", async () => {
  assert.equal(isOffer({ id: "o:group:w:/u/someone/code" }), true);
  assert.equal(isOffer({ id: "p:session:item" }), false);
  assert.equal(isOffer(null), false);
  line = null;
  const sent = engine((m) => (m.type === "next.tidy.yes" ? { ok: true, id: m.id, batch: "sort-9", done: "I grouped api and web into code.", what: "api and web grouped in code" } : { ok: true }));
  assert.equal(await offerYes("o:group:w:/u/someone/code"), true);
  assert.deepEqual(sent[0], { type: "next.tidy.yes", id: "o:group:w:/u/someone/code" });
  assert.equal(line!.text, "I grouped api and web into code.");
  assert.equal(line!.act?.label, "Undo");
  assert.equal(await offerNo("o:group:w:/u/someone/code"), true);
  assert.deepEqual(sent.at(-1), { type: "next.tidy.no", id: "o:group:w:/u/someone/code" });
  engine(() => ({ ok: false, why: "that sort is not offered now" }));
  assert.equal(await offerYes("o:group:w:/u/someone/code"), false);
  assert.equal(line!.text, "Not sorted: that sort is not offered now.");
  useAsk(null);
});
