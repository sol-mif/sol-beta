// Pieces (#1092): a pulse of Home's due asks Jev nothing. Its rows are his stickies' own text and his facts' names: his
// words, which never leave this machine (the lead's 06:16; the designer's spy of 06:45 saw three requests carry them).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ROOT = realpathSync(mkdtempSync(join(tmpdir(), "sol-design-spy-")));
process.env.SOL_HOME = join(ROOT, "home");
process.env.SOL_STATE = join(ROOT, "state", "work.json");
const P = await import("../src/work/pieces.ts");
P.setTender(null);
after(() => { P.stopAll(); rmSync(ROOT, { recursive: true, force: true }); });
test("a pulse of Home's due sends no request to Jev: a sticky's text is his words", async () => {
  const sent: string[] = [];
  P.setJev(async (b) => { sent.push(JSON.stringify(b)); return null; });
  const d = join(ROOT, "cls"); mkdirSync(join(d, ".sol", "pieces"), { recursive: true });
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  writeFileSync(join(d, "ground.json"), JSON.stringify({ name: "ZZ202", facts: [] }));
  writeFileSync(join(d, "stickies.md"), `- [ ] Email Dana about my secret extension — ${day(2)}\n- [ ] Finish the essay on my grandmother — ${day(3)}\n`);
  writeFileSync(join(d, ".sol", "pieces", "due.json"), JSON.stringify({ name: "due", source: { from: "builtin", name: "due" } }));
  P.load(d);
  for (let i = 0; i < 150 && !P.list(d).pieces.find((p) => p.name === "due")?.at; i++) await new Promise((res) => setTimeout(res, 20));
  await new Promise((res) => setTimeout(res, 200));
  const rows = P.open(d, "due");
  assert.ok(JSON.stringify(rows).includes("Email Dana"), "the piece did read his stickies");
  assert.equal(sent.length, 0, "no request at all");
  assert.ok(!sent.some((x) => /Dana|grandmother/.test(x)), "and no word of a sticky in one");
  P.setJev(null);
});

test("a pulse of the night sends no request to Jev: its rows are what agents wrote (the run branch's 85b51eed)", async () => {
  const sent: string[] = [];
  P.setJev(async (b) => { sent.push(JSON.stringify(b)); return null; });
  const d = join(ROOT, "proj"); mkdirSync(join(d, ".sol", "pieces"), { recursive: true });
  writeFileSync(join(d, "night-fx.json"), JSON.stringify({ builders: [{ name: "n1-example", short: "example", title: "An example part", alive: true,
    status: "an agent's own words about a private plan", done: "DECISIONS FOR MARCO\n1. Should the example keep its secret plan? Default: yes." }] }));
  writeFileSync(join(d, ".sol", "pieces", "night.json"), JSON.stringify({ name: "night", source: { from: "builtin", name: "night", fixture: "night-fx.json" } }));
  P.load(d);
  for (let i = 0; i < 150 && !P.list(d).pieces.find((p) => p.name === "night")?.at; i++) await new Promise((res) => setTimeout(res, 20));
  await new Promise((res) => setTimeout(res, 200));
  assert.ok(JSON.stringify(P.open(d, "night")).includes("example"), "the piece did read the night");
  assert.equal(sent.length, 0, "no request at all");
  P.setJev(null);
});

test("a piece's title is never sent to Jev: a title he typed (the maker, the ghost) stays here; the source's fixed name goes (the lead's 08:20)", async () => {
  const sent: string[] = [];
  P.setJev(async (b) => { sent.push(JSON.stringify(b)); return null; });
  const d = join(ROOT, "typed"); mkdirSync(join(d, ".sol", "pieces"), { recursive: true });
  const now = Math.floor(Date.now() / 1000);
  writeFileSync(join(d, "runs-fx.json"), JSON.stringify({ at: now, machines: { nucbox: { runs: [{ id: "x-build", state: "failed", why: "stopped early", since: now - 60 }] } } }));
  writeFileSync(join(d, ".sol", "pieces", "mine.json"), JSON.stringify({ name: "mine", title: "how is my secret thing going", source: { from: "builtin", name: "runs", fixture: "runs-fx.json" } }));
  P.load(d);
  for (let i = 0; i < 150 && !P.list(d).pieces.find((p) => p.name === "mine")?.at; i++) await new Promise((res) => setTimeout(res, 20));
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((res) => setTimeout(res, 20));
  assert.ok(sent.length > 0, "Jev was asked about the failed run (an allowed source)");
  assert.ok(!sent.some((x) => /secret/.test(x)), "and the typed title is in no request");
  assert.ok(sent.some((x) => x.includes("runs on machines")), "the source's fixed name is");
  P.setJev(null);
});
