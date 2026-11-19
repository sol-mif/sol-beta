// Build becomes yours (#1089, build.yours): from an offer to a kept thing. An offer is said once, and never two within
// the quiet gap; three made versions; a version changed by plain words (and unchanged by words it does not know); the
// page a version is (fields, the press that fills the box, no other way out); keeping puts an artifact in the project
// with a ledger and a row in the list; undo closes it and undo again brings it back; the record survives a restart.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-yours-keep-"));
process.env.SOL_STATE = join(dir, "work.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_YOURS_DIR = join(dir, "no-transcripts");   // never this machine's own transcripts
const k = await import("../src/work/yoursKeep.ts");
const stage = await import("../src/work/blocks.ts");
const jev = await import("../src/work/yoursJev.ts");
import type { Offer } from "../src/work/yours.ts";

const review: Offer = {
  id: "off-review", kind: "ask", count: 7, sessions: 5, first: Date.parse("2026-11-10T05:00:00Z"), last: Date.parse("2026-11-11T05:00:00Z"),
  words: "you are the reviewer of pr ____ on ____ the spring run of ____",
  examples: ["You are the reviewer of PR #31 on acme/garden (the spring run of #40, slice r2)…"],
  blanks: [{ name: "PR", values: ["#31", "#17", "#23"] }, { name: "slice", values: ["r2", "q7", "p4"] }],
  template: "You are the reviewer of PR {PR} on acme/garden (the spring run of #40, slice {slice}). Read-only.",
  sentence: "You've asked this 7 times, changing only the PR and slice. Keep it as a tool?", folder: "/work/garden",
  head: ["reviewer", "pr", "acme/garden", "build", "run", "slice", "fresh", "context", "read-only"],
};
const AGAIN = "You are the reviewer of PR #48 on acme/garden (the spring run of #40, slice u8), in a fresh context. Read-only.";
const fix: Offer = { ...review, id: "off-fix", kind: "correction", count: 3, blanks: [], template: "no, no bullet lists, plain sentences", sentence: "You've corrected the agent this way 3 times. Keep it as a rule?", head: ["bullet", "lists", "plain", "sentences"] };
const FIX = "no, no bullet lists, plain sentences please";
const place: Offer = { ...review, id: "off-place", kind: "arrangement", count: 3, blanks: [], template: "", head: [], target: { title: "the diff", kind: "diff", side: "right" }, sentence: "You've put the diff on the right in 3 sessions. Keep it there?" };
const w = { project: "garden", sessionId: "sess-1", by: "Ana" };

beforeEach(() => { process.env.SOL_YOURS_GAP_MS = "0"; k._reload(); k.setOfferSource(() => [review, fix]); jev.setYoursJev(null); });

test("an offer comes only when the Sol user just did it again: a send that belongs to it", () => {
  k.setOfferSource(() => [review, fix, place]);
  assert.equal(k.offerNow("/work/garden", Date.now(), "fix the failing test in greet.js")?.id, undefined, "a send of something else brings nothing");
  assert.equal(k.offerNow("/work/garden", Date.now(), AGAIN)?.id, "off-review");
  k.seen("off-review", "later");
  assert.equal(k.offerNow("/work/garden", Date.now(), FIX)?.id, "off-fix");
  k.seen("off-fix", "later");
  assert.equal(k.offerNow("/work/garden"), null, "opening a session says nothing; an arrangement is held back until the stage keeps the place");
});

test("an offer is said until it is answered (a day at most), then never again; the next waits for the quiet gap", () => {
  for (const id of ["off-review", "off-fix", "off-place"]) k.again(id);
  const a = k.offerNow("/work/garden", Date.now(), AGAIN);
  assert.equal(a?.id, "off-review");
  assert.equal(k.offerNow("/work/garden", Date.now(), AGAIN)?.id, "off-review", "said again while unanswered: a session opened again");
  k.seen("off-review", "later");
  assert.equal(k.offerNow("/work/garden", Date.now(), AGAIN), null, "the one answered is not said again");
  const b = k.offerNow("/work/garden", Date.now(), FIX);
  assert.equal(b?.id, "off-fix");
  k.seen("off-fix", "no");
  k.again("off-review");
  process.env.SOL_YOURS_GAP_MS = String(3_600_000);
  assert.equal(k.offerNow("/work/garden", Date.now(), AGAIN), null, "one was answered within the gap");
  assert.equal(k.offerNow("/work/garden", Date.now() + 2 * 3_600_000, AGAIN)?.id, "off-review");
  // unanswered for a day: it counts as passed
  assert.equal(k.offerNow("/work/garden", Date.now() + k.UNANSWERED_MS + 3 * 3_600_000, AGAIN), null);
  assert.deepEqual(k.passed().map((p) => p.id).sort(), ["off-fix", "off-review"]);
});

test("three made versions: a button with the fields, a row per past value, the whole brief", () => {
  const v = k.versionsOf(review);
  assert.deepEqual(v.map((s) => s.shape), ["button", "rows", "brief"]);
  assert.equal(v[0].title, "Reviewer");
  assert.equal(k.titleFrom({ words: "you are ____ a builder on the night shift" }), "Builder");
  assert.equal(k.titleFrom({ words: "draft invoice ____ for northside ____ hours at my usual rate" }), "Invoice", "named by the thing it makes, not the verb");
  assert.equal(k.titleFrom({ words: "draft ____ for northside" }), "Draft", "a verb before a blank stays");
  assert.deepEqual(v[0].fields.map((f) => [f.name, f.value]), [["PR", "#31"], ["slice", "r2"]]);
  const check = k.versionsOf({ ...review, kind: "checkin", blanks: [], template: "is it done?" });
  assert.deepEqual(check.map((x) => x.shape), ["checkin", "pin", "brief"], "is it done: a card, a pin by the box, the fuller ask");
  const rule = k.versionsOf(fix);
  assert.equal(rule[0].shape, "rule");
  assert.equal(rule[0].template, "No bullet lists, plain sentences");
});

test("a version changed by saying so: name, add and drop a field, size, look, shape; unknown words change nothing", () => {
  const v = k.versionsOf(review)[0];
  let r = k.adjust(v, "call it Review a PR");
  assert.equal(r.spec.title, "Review a PR");
  const two = k.adjust(v, "call it Review a PR, smaller");
  assert.equal(two.spec.title, "Review a PR", "a name ends at the comma");
  assert.equal(two.spec.size, "s");
  r = k.adjust(r.spec, "add the branch, bigger");
  assert.ok(r.spec.fields.some((f) => f.name === "branch"));
  assert.match(r.spec.template, /\nbranch: \{branch\}$/);
  assert.equal(r.spec.size, "l");
  r = k.adjust(r.spec, "drop the slice");
  assert.ok(!r.spec.fields.some((f) => f.name === "slice"));
  assert.match(r.spec.template, /slice r2\)/, "a dropped field keeps its last value as words");
  r = k.adjust(r.spec, "plain, as rows");
  assert.equal(r.spec.accent, "plain");
  assert.equal(r.spec.shape, "rows");
  const same = k.adjust(r.spec, "make it feel more like me");
  assert.deepEqual(same.changed, []);
  assert.deepEqual({ ...same.spec, said: [] }, { ...r.spec, said: [] });
  assert.equal(same.spec.said.at(-1), "make it feel more like me", "what it could not do is kept, never guessed");
});

test("the kept page: its fields with past values, one press that posts the filled ask, its back with undo; no colour of its own", () => {
  const from = { kind: "ask" as const, count: 7, sessions: 5, first: review.first, last: review.last, example: "", sentence: "" };
  const page = k.pageOf(k.versionsOf(review)[0], from, "yours-ab12cd34");
  assert.match(page, /<input data-n="PR" value="#31"/);
  assert.match(page, /<option value="#17">/);
  assert.match(page, /parent\.postMessage\(\{sol:"yours\.fill",text:t\},"\*"\)/);
  assert.match(page, />use</);
  assert.match(page, /parent\.postMessage\(\{sol:"yours\.undo",id:ID\},"\*"\)/);
  assert.match(page, /const ID="yours-ab12cd34"/);
  assert.match(page, /from 7 asks · since 10 Nov/);
  assert.match(page, /<div class="piece" style="--w:288px">/, "the piece at its own width");
  assert.ok(!/<h1/.test(page), "no title: the block's head says it");
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(page), "the page reaches nothing but the face");
  const body = page.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*<\/script>/, "").replace(/value="#[0-9a-z]+"/g, "");
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|gradient/i.test(body), "no colour typed in the page: only the kit's tokens, in its one style");
  assert.ok(!/gradient/.test(page));
  assert.equal(k.fill(review.template, { PR: "#29", slice: "s5" }), "You are the reviewer of PR #29 on acme/garden (the spring run of #40, slice s5). Read-only.");
  assert.match(k.pageOf({ ...k.versionsOf(review)[2], template: "<img src=x onerror=alert(1)>" }), /&lt;img src=x/, "the ask is drawn as words");
});

test("keep: an artifact in the project with a ledger, a row in the list; undo closes it, undo again brings it back", () => {
  const spec = k.adjust(k.versionsOf(review)[0], "call it Review").spec;
  const { kept, block } = k.keep(w, review, spec);
  assert.equal(block.kind, "page");
  assert.match(block.id, /^yours-[0-9a-f]{8}$/);
  assert.match(stage.bodyOf("garden", block.id)?.text ?? "", new RegExp(`const ID="${block.id}"`), "the page knows its own id for undo");
  assert.equal(block.title, "Review");
  assert.equal(stage.getBlock("garden", block.id)?.state, "live");
  assert.ok(stage.getStage("garden", "sess-1").blocks.some((p) => p.id === block.id), "on this session's stage");
  assert.deepEqual(stage.ledger("garden", block.id).map((l) => l.ev), ["composed"]);
  assert.match(stage.bodyOf("garden", block.id)?.text ?? "", /data-n="PR"/);
  assert.equal(kept.ceiling, "look");
  assert.equal(kept.from.count, 7);
  assert.deepEqual(k.kept().map((x) => x.id), [block.id]);
  // the offer it came from is not said again
  k.again("off-fix");
  assert.equal(k.offerNow("/work/garden", Date.now(), AGAIN), null);
  assert.equal(k.offerNow("/work/garden", Date.now(), FIX)?.id, "off-fix");
  k.seen("off-fix", "later");
  k.undo(block.id);
  assert.equal(stage.getBlock("garden", block.id)?.state, "dead");
  assert.ok(k.kept()[0].undone);
  k.undo(block.id);
  assert.equal(stage.getBlock("garden", block.id)?.state, "live");
  assert.equal(k.kept()[0].undone, undefined);
  assert.deepEqual(stage.ledger("garden", block.id).map((l) => l.ev).slice(0, 2), ["composed", "closed"], "the ledger keeps the close");
  // the record is kept across a restart
  k._reload();
  assert.equal(k.kept()[0].title, "Review");
});

test("the wire: offer, keep and list answer by the face's message; an unknown offer is an error, not a throw", async () => {
  const who = async (sessionId: string) => ({ project: "garden", sessionId, by: "Ana's agent", cwd: "/work/garden" });
  k.again("off-review"); k.again("off-fix");
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-2", said: AGAIN }, (o) => out.push(o), who);
  assert.equal(out[0].offer.id, "off-review");
  assert.equal(out[0].versions.length, 3);
  await k.hear({ on: true, type: "work.yours.adjust", spec: out[0].versions[0], words: "smaller" }, (o) => out.push(o), who);
  assert.equal(out[1].spec.size, "s");
  await k.hear({ on: true, type: "work.yours.keep", sessionId: "sess-2", id: "off-review", spec: out[1].spec }, (o) => out.push(o), who);
  assert.equal(out[2].block.kind, "page");
  assert.equal(out[2].kept.sessionId, "sess-2");
  await k.hear({ on: true, type: "work.yours.keep", sessionId: "sess-2", id: "nope" }, (o) => out.push(o), async () => ({ ...(await who("x")), cwd: "/elsewhere" }));
  assert.equal(out[3].error, "that offer is gone");
  await k.hear({ on: true, type: "work.yours.list" }, (o) => out.push(o), who);
  assert.ok(out[4].kept.length >= 2);
});

// ---- Jev's picks: a stub answers as the real one would; each probability is read by one rule (0.7 acts, 0.45 a ghost)
const stub = (answers: Record<string, any>, seen: any[] = []) => jev.setYoursJev(async (state, questions) => { seen.push({ state, questions }); return answers; });

test("the rule: 0.7 and over acts, 0.45 and over a ghost, under that or no answer nothing", () => {
  assert.deepEqual([0.9, 0.7, 0.69, 0.45, 0.44, null, NaN].map((p) => jev.verdict(p as any)), ["act", "act", "ghost", "ghost", "none", "none", "none"]);
  assert.deepEqual(jev.chosen({ choice: "rows", probabilities: { rows: 0.8 } }, ["button", "rows"]), { pick: "rows", p: 0.8 });
  assert.equal(jev.chosen({ choice: "table", confidence: 0.9 }, ["button", "rows"]), null, "an option not asked is not an answer");
});

test("worth: Jev sure says it; a ghost is only noticed; unsure lets it go; no Jev keeps the rule", async () => {
  const AG = "You are the reviewer of PR #1200 on acme/garden (the spring run of #40, slice c60), in a fresh context. Read-only.";
  for (const id of ["off-review", "off-fix"]) k.again(id);
  const asked: any[] = [];
  stub({ worth: { noul: 0.82 } }, asked);
  assert.equal((await k.offerJudged("/work/garden", AG))?.id, "off-review");
  assert.equal(asked[0].questions.worth.type, "noul");
  // prompts never leave the machine: Jev is told numbers and kinds, no word of an ask, a value or a title
  const told = JSON.stringify(asked[0]);
  for (const word of ["reviewer", "garden", "acme", "#31", "r2", "Reviewer", "slice", "spring"]) assert.ok(!told.includes(word), `"${word}" went to Jev: ${told}`);
  assert.equal(asked[0].state.count, "7");
  assert.match(asked[0].state.blanks, /^PR \(3 values\); other \(3 values\)$/);
  asked.length = 0;
  assert.equal((await k.offerJudged("/work/garden", AG))?.id, "off-review", "judged once: said again while unanswered, Jev not asked again");
  assert.equal(asked.length, 0);
  k.again("off-review"); stub({ worth: { noul: 0.5 } });
  assert.equal(await k.offerJudged("/work/garden", AG), null);
  assert.deepEqual(k.noticed().map((x) => x.id), ["off-review"], "a ghost stands under noticed, never said");
  process.env.SOL_YOURS_GAP_MS = String(3_600_000);
  stub({ worth: { noul: 0.9 } });
  assert.equal((await k.offerJudged("/work/garden", "no, no bullet lists, plain sentences please"))?.id, "off-fix", "a noticed one starts no quiet gap");
  k.again("off-fix"); process.env.SOL_YOURS_GAP_MS = "0";
  k.again("off-review"); stub({ worth: { noul: 0.2 } });
  assert.equal(await k.offerJudged("/work/garden", AG), null);
  assert.deepEqual(k.passed().map((x) => x.id), [], "Jev's no is its own, never listed as the person's");
  process.env.SOL_YOURS_GAP_MS = String(3_600_000); k.again("off-fix"); stub({ worth: { noul: 0.9 } });
  assert.equal((await k.offerJudged("/work/garden", "no, no bullet lists, plain sentences please"))?.id, "off-fix", "Jev's no starts no quiet gap");
  k.again("off-fix"); process.env.SOL_YOURS_GAP_MS = "0";
  k.again("off-review"); jev.setYoursJev(null);
  assert.equal((await k.offerJudged("/work/garden", AG))?.id, "off-review", "no Jev: the rule alone");
});

test("the versions: Jev picks which leads, on the shape alone; the names and the title stay the rule's", async () => {
  const asked: any[] = [];
  stub({ first: { choice: "button", probabilities: { button: 0.75 } } }, asked);
  const r = await k.shaped({ ...review, blanks: [{ name: "number", values: ["#31", "#17"] }, { name: "slice", values: ["r2", "q7"] }], template: "review PR {number} slice {slice}" });
  assert.deepEqual(r.versions[0].fields.map((f) => f.name), ["number", "slice"], "the rule names the blanks");
  assert.equal(r.versions[1].title, "Reviewer", "the rule names the tool");
  assert.equal(r.lead, 0);
  assert.equal(r.doubt, false);
  assert.deepEqual(Object.keys(asked[0].questions), ["first"], "one question, on numbers");
  assert.ok(!JSON.stringify(asked[0]).includes("review"), "no word of the ask");
  stub({ first: { choice: "button", probabilities: { button: 0.5 } } });
  assert.equal((await k.shaped(review)).lead, 1, "a ghost changes nothing");
  jev.setYoursJev(null);
  const plain = await k.shaped(review);
  assert.equal(plain.lead, 1);
  assert.equal((await k.shaped({ ...review, words: "please ____" })).doubt, true, "the rule's last resort: the face shows the title in doubt");
});

test("words the plain rules miss stay the person's: the version unchanged, nothing asked of Jev", async () => {
  const who = async (sessionId: string) => ({ project: "garden", sessionId, by: "Ana's agent", cwd: "/work/garden" });
  const v = k.versionsOf(review)[0];
  const asked: any[] = [];
  stub({ change: { choice: "smaller", probabilities: { smaller: 0.9 } } }, asked);
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.adjust", spec: v, words: "make it feel like me" }, (o) => out.push(o), who);
  assert.deepEqual(out[0].changed, []);
  assert.equal(out[0].spec.size, v.size);
  assert.equal(out[0].spec.said.at(-1), "make it feel like me");
  assert.equal(asked.length, 0, "typed words never go to Jev");
});

test("the engine checks the switch too: without on, nothing is read or kept", async () => {
  const out: any[] = [];
  await k.hear({ type: "work.yours.list" }, (o) => out.push(o));
  await k.hear({ type: "work.yours.offer", sessionId: "sess-2", said: AGAIN, on: "yes" }, (o) => out.push(o));
  assert.deepEqual(out.map((o) => o.error), ["build.yours is off", "build.yours is off"]);
});

test("the client: no key is no Jev; an error, a bad answer or a slow one is null", async () => {
  assert.equal(jev.makeAsk({ key: null }), null);
  const bad = jev.makeAsk({ key: "k", fetch: (async () => ({ ok: false })) as any })!;
  assert.equal(await bad({}, {}), null);
  const slow = jev.makeAsk({ key: "k", budget: 30, fetch: ((_u: string, o: any) => new Promise((_r, no) => o.signal.addEventListener("abort", () => no(new Error("aborted"))))) as any })!;
  assert.equal(await slow({}, {}), null);
  let sent: any = null;
  const good = jev.makeAsk({ key: "k", fetch: (async (_u: string, o: any) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: { worth: { noul: 0.8 } } }) }; }) as any })!;
  assert.deepEqual(await good({ asks: "x".repeat(5000) }, {}), { worth: { noul: 0.8 } });
  assert.equal(sent.model, "jev-latest");
  assert.equal(sent.state.asks.length, 1200, "state strings are kept short");
});

test("a correction's three versions differ in what they do; the one by the box keeps no block; the shelf is the project's own", () => {
  const v = k.versionsOf(fix);
  assert.deepEqual(v.map((x) => x.shape), ["rule", "pin", "brief"]);
  assert.equal(v[1].title, "No bullet lists");
  const before = k.shelf("garden").length;
  const { kept, block } = k.keep(w, fix, v[1]);
  assert.equal(block, null, "no stage room used");
  assert.equal(stage.getBlock("garden", kept.id), null);
  assert.equal(k.shelf("garden").length, before + 1);
  assert.equal(k.shelf("garden").at(-1)?.id, kept.id, "the newest at the row's end: the row keeps its order");
  assert.equal(k.shelf("elsewhere").length, 0);
  k.undo(kept.id);
  assert.ok(!k.shelf("garden").some((x) => x.id === kept.id), "undone leaves the shelf");
  k.undo(kept.id);
  assert.ok(k.shelf("garden").some((x) => x.id === kept.id), "brought back");
});

test("kept, it also stands as part 3's piece in the folder, only with pieces on, out of git, and undo takes only its own file", async () => {
  const pieces = await import("../src/work/pieces.ts");
  const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
  const folder = join(dir, "project-folder"); mkdirSync(folder, { recursive: true });
  (await import("node:child_process")).execFileSync("git", ["init", "-q", folder]);
  const who = async (sessionId: string) => ({ project: "garden", sessionId, by: "Ana's agent", cwd: folder });
  const out: any[] = [];
  // pieces off (the face says so): no file in the folder at all
  k.again("off-review");
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-8", said: AGAIN }, (o) => out.push(o), who);
  await k.hear({ on: true, type: "work.yours.keep", sessionId: "sess-8", id: "off-review", spec: out[0].versions[1] }, (o) => out.push(o), who);
  assert.equal(out[1].kept.piece, undefined);
  assert.equal(out[1].where, null);
  assert.ok(!existsSync(join(folder, ".sol")), "nothing written into the folder with pieces off");
  // pieces on: the piece, named after the kept id, and the folder's git told to leave it
  k.again("off-review"); out.length = 0;
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-9", said: AGAIN }, (o) => out.push(o), who);
  await k.hear({ on: true, type: "work.yours.keep", pieces: true, sessionId: "sess-9", id: "off-review", spec: { ...out[0].versions[1], title: "Review a PR" } }, (o) => out.push(o), who);
  const kept = out[1].kept;
  assert.equal(kept.piece, kept.id);
  assert.match(kept.id, /^yours-[0-9a-f]{8}$/);
  assert.equal(out[1].where, join(".sol", "pieces", `${kept.id}.json`), "the sheet says where it went");
  const file = join(folder, ".sol", "pieces", `${kept.id}.json`);
  assert.ok(existsSync(file));
  assert.ok(readFileSync(join(folder, ".git", "info", "exclude"), "utf8").split("\n").includes("/.sol/pieces/yours-*"), "out of the folder's git, in its own exclude");
  assert.ok(!existsSync(join(folder, ".sol", "pieces", ".gitignore")), "no file of the team's is written or changed");
  const recipe = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(!("error" in pieces.readRecipe(recipe)), "part 3's own reader takes it");
  assert.equal(recipe.ceiling, "look");
  assert.deepEqual(recipe.source.rows.map((r: any) => r.t), ["#48", "#31", "#17", "#23"]);
  assert.match(recipe.about, /from 7 asks since 10 Nov/);
  k.undo(kept.id);
  assert.ok(!existsSync(file), "undo takes it out of the folder");
  k.undo(kept.id);
  assert.ok(existsSync(file), "bring it back writes it again");
  // a file under its name that is not its own (another hand wrote it): undo leaves it
  writeFileSync(file, JSON.stringify({ name: "someone-else", title: "theirs" }));
  k.undo(kept.id);
  assert.ok(existsSync(file), "undo never deletes a file it does not own");
  assert.equal(k.owns(JSON.stringify({ name: kept.id, ceiling: "look" }), kept), true);
  assert.equal(k.owns(JSON.stringify({ name: kept.id, ceiling: "look" }), { ...kept, piece: "pieces" }), false);
  // a session whose folder is unknown falls back to the engine's own: never written there
  k.again("off-review"); out.length = 0;
  const lost = async (sessionId: string) => ({ ...(await who(sessionId)), cwd: process.cwd() });
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-7", said: AGAIN }, (o) => out.push(o), who);
  await k.hear({ on: true, type: "work.yours.keep", pieces: true, sessionId: "sess-7", id: "off-review", spec: out[0].versions[0] }, (o) => out.push(o), lost);
  assert.equal(out[1].kept.piece, undefined);
  pieces.stopAll();
});

test("forget: a kept thing gone for good: its page closed, its piece out, its row out of the list", async () => {
  const { existsSync, mkdirSync } = await import("node:fs");
  const folder = join(dir, "forget-folder"); mkdirSync(folder, { recursive: true });
  const who = async (sessionId: string) => ({ project: "garden", sessionId, by: "Ana's agent", cwd: folder });
  k.again("off-review");
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-6", said: AGAIN }, (o) => out.push(o), who);
  await k.hear({ on: true, type: "work.yours.keep", pieces: true, sessionId: "sess-6", id: "off-review", spec: out[0].versions[0] }, (o) => out.push(o), who);
  const id = out[1].kept.id;
  const file = join(folder, ".sol", "pieces", `${id}.json`);
  assert.ok(existsSync(file));
  await k.hear({ on: true, type: "work.yours.forget", id }, (o) => out.push(o), who);
  assert.equal(out[2].forgot, id);
  assert.ok(!k.kept().some((x) => x.id === id));
  assert.ok(!existsSync(file));
  assert.equal(stage.getBlock("garden", id)?.state, "dead");
  k._reload();
  assert.ok(!k.kept().some((x) => x.id === id), "gone after a restart too");
  (await import("../src/work/pieces.ts")).stopAll();
});

test("the look: offered right after the talk is set the way it was set three times; kept as data only; changed to another", async () => {
  const look: Offer = { ...review, id: "off-look", kind: "arrangement", count: 3, sessions: 3, blanks: [], template: "", head: [],
    target: { title: "the talk", kind: "talk", side: "right", dock: "right", width: 0.42 }, sentence: "You've set the talk right, 42% wide in 3 sessions. Keep it that way?" };
  k.setOfferSource(() => [review, look]);
  k.again("off-look");
  assert.equal(k.offerNow("/work/garden", Date.now(), undefined, { dock: "left" }), null, "another layout brings nothing");
  assert.equal(k.offerNow("/work/garden", Date.now(), undefined, { dock: "right", width: 0.44 })?.id, "off-look", "the same dock, the width within a twentieth");
  const v = k.versionsOf(look);
  assert.deepEqual(v.map((x) => [x.shape, x.title, x.lay]), [["layout", "Talk on the right", { dock: "right", width: 0.42 }]]);
  const { kept, block } = k.keep(w, look, JSON.parse(JSON.stringify(v[0])));
  assert.equal(block, null, "a look is kept by the face, never a block");
  assert.deepEqual(kept.spec.lay, { dock: "right", width: 0.42 }, "the layout survives the trip from the face");
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.lay", id: kept.id, lay: { dock: "bottom" } }, (o) => out.push(o));
  assert.deepEqual(out[0].kept.spec.lay, { dock: "bottom" });
  await k.hear({ on: true, type: "work.yours.lay", id: kept.id, lay: { dock: "sideways" } }, (o) => out.push(o));
  assert.equal(out[1].error, "no such look");
  assert.deepEqual(k.layOf({ dock: "right", width: 2 }), { dock: "right" }, "a width that is not a share is dropped");
});

test("a kept thing changed by saying so: its page replaced in place, still kept; the change's undo puts the spec back", () => {
  k.again("off-review");
  const { kept } = k.keep(w, review, k.versionsOf(review)[0]);
  const smaller = k.adjust(kept.spec, "call it Review, smaller").spec;
  const c = k.change(kept.id, smaller);
  assert.equal(c.title, "Review");
  assert.equal(c.spec.size, "s");
  assert.equal(c.before?.title, "Reviewer");
  assert.equal(stage.getBlock("garden", kept.id)?.title, "Review", "the same block, renamed in place");
  assert.match(stage.bodyOf("garden", kept.id)?.text ?? "", /--w:232px/, "its page redrawn at the new size");
  assert.equal(k.change(kept.id, { ...smaller, shape: "rows" }).spec.shape, "button", "a change keeps what it is");
  const back = k.unchange(kept.id);
  assert.equal(back.spec.size, "s", "undo takes back the last change only");
  assert.equal(back.before, undefined);
  assert.throws(() => k.unchange(kept.id), /nothing to take back/);
  assert.ok(!back.undone, "it stays kept");
});

test("the first minute: this machine's most repeated, at most three, never one kept or answered no; one opens by hand", async () => {
  const mk = (id: string, count: number): Offer => ({ ...review, id, count });
  k.setFoundSource(() => [mk("f-a", 9), mk("f-b", 7), mk("f-c", 5), mk("f-d", 4), mk("f-e", 3)]);
  k.again("f-a"); k.again("f-b"); k.again("f-c"); k.again("f-d");
  assert.deepEqual(k.found().map((o) => o.id), ["f-a", "f-b", "f-c"]);
  k.seen("f-b", "no");
  k.keep(w, mk("f-c", 5), k.versionsOf(mk("f-c", 5))[0]);
  assert.deepEqual(k.found().map((o) => o.id), ["f-a", "f-d", "f-e"], "a no and a kept one are never offered");
  const out: any[] = [];
  process.env.SOL_YOURS_GAP_MS = String(3_600_000);   // by hand: the quiet gap does not hold it back
  await k.hear({ on: true, type: "work.yours.offer", id: "f-d" }, (o) => out.push(o));
  assert.equal(out[0].offer.id, "f-d");
  assert.equal(out[0].versions.length, 3);
  await k.hear({ on: true, type: "work.yours.offer", id: "nope" }, (o) => out.push(o));
  assert.equal(out[1].offer, null);
  k.setFoundSource(null);
});

test("a damaged record is set aside, never wiped: only a missing yours.json reads as empty", async () => {
  const { readFileSync, readdirSync, writeFileSync, rmSync } = await import("node:fs");
  const file = join(dir, "yours.json");   // STATE_DIR is the folder of SOL_STATE
  const bad = () => readdirSync(dir).filter((n) => n.startsWith("yours.json.bad-"));
  const CUT = "{ \"kept\": [ {\"id\": \"yours-0000aaaa\"";   // cut off half way
  writeFileSync(file, CUT);
  k._reload();
  assert.deepEqual(k.kept(), [], "it reads as nothing kept");
  assert.equal(bad().length, 1, "the damaged file moved aside");
  assert.equal(readFileSync(join(dir, bad()[0]), "utf8"), CUT, "kept as it was");
  k.again("off-review");
  k.keep(w, review, k.versionsOf(review)[0]);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).kept.length, 1, "a fresh record after it");
  assert.equal(readFileSync(join(dir, bad()[0]), "utf8"), CUT, "never written over");
  // a JSON that is not a record (an array) is damaged too
  writeFileSync(file, "[1,2]"); k._reload();
  assert.deepEqual(k.kept(), []);
  assert.equal(bad().length, 2);
  // valid JSON with a field of the wrong type is damage too, never read as a record nor saved over
  for (const t of ['{"kept": {}}', '{"kept": [null]}', '{"seen": [], "kept": []}']) { writeFileSync(file, t); k._reload(); assert.deepEqual(k.kept(), [], t); }
  assert.equal(bad().length, 5, "each one set aside");
  // gone: simply empty, nothing set aside
  for (const n of readdirSync(dir)) if (n.startsWith("yours.json")) rmSync(join(dir, n));
  k._reload();
  assert.deepEqual(k.kept(), []);
  assert.equal(bad().length, 0, "a missing file is simply empty");
});

test("a piece is never written without its exclude line, and never over a file changed by hand", async () => {
  const pieces = await import("../src/work/pieces.ts");
  const { readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
  const folder = join(dir, "hand-folder"); mkdirSync(folder, { recursive: true });
  (await import("node:child_process")).execFileSync("git", ["init", "-q", folder]);
  const who = async (sessionId: string) => ({ project: "garden", sessionId, by: "Ana's agent", cwd: folder });
  const out: any[] = [];
  k.again("off-review");
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-h", said: AGAIN }, (o) => out.push(o), who);
  await k.hear({ on: true, type: "work.yours.keep", pieces: true, sessionId: "sess-h", id: "off-review", spec: out[0].versions[1] }, (o) => out.push(o), who);
  const kept = out[1].kept;
  const file = join(folder, ".sol", "pieces", `${kept.id}.json`);
  assert.ok(k.untouched(readFileSync(file, "utf8")), "written with its sum");
  k.change(kept.id, { ...kept.spec, title: "Review it" });
  assert.equal(JSON.parse(readFileSync(file, "utf8")).title, "Review it", "a change by words replaces an untouched file");
  // the exclude line gone (someone cleaned it): a change writes it back before the piece
  const ex = join(folder, ".git", "info", "exclude");
  writeFileSync(ex, "");
  k.change(kept.id, { ...kept.spec, title: "Review" });
  assert.ok(readFileSync(ex, "utf8").split("\n").includes("/.sol/pieces/yours-*"), "the exclude line first");
  // changed by hand: Build never writes over it
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), title: "My own words" }));
  assert.equal(k.untouched(readFileSync(file, "utf8")), false);
  k.change(kept.id, { ...kept.spec, title: "Something else" });
  assert.equal(JSON.parse(readFileSync(file, "utf8")).title, "My own words", "a hand-edited piece stays as the person left it");
  // a .git that cannot be read: nothing may be written
  const odd = join(dir, "odd-folder"); mkdirSync(join(odd, ".git"), { recursive: true });
  writeFileSync(join(odd, ".git", "info"), "a file where a folder should be");
  assert.equal(k.ignoreKept(odd), false, "the exclude cannot be written: the folder is not safe");
  assert.equal(k.placePiece(kept, odd), undefined, "and no piece is written there");
  pieces.stopAll();
});

test("a change clears the edits heard against the old template; an undone tool learns nothing", () => {
  k.again("off-review");
  const { kept } = k.keep(w, review, k.versionsOf(review)[0]);
  k.sent(kept.id, AGAIN.replace("Read-only.", "Read-only, be brief."));
  assert.ok((k.kept().find((x) => x.id === kept.id)?.edits ?? []).length > 0, "an edit heard");
  k.change(kept.id, { ...kept.spec, title: "Review" });
  assert.deepEqual(k.kept().find((x) => x.id === kept.id)?.edits, [], "a change starts the edits again");
  k.undo(kept.id);
  assert.throws(() => k.learn(kept.id, "anything"), /undone tool learns nothing/);
});

test("the first minute: when fewer than three repeat, the person's last asks stand in; never one near a repeat; found again by hand", async () => {
  const at = Date.now() - 60_000;
  const a = (text: string, cwd = "/work/garden") => ({ session: "s-a", cwd, at, text, afterAgent: true });
  const asks = [
    a(AGAIN),   // near the repeat itself: never a row of its own
    a("Draft invoice #1048 for Halden Studio, 7 hours, at my usual rate"),
    a("write the newsletter for friday about the spring planting day"),
    a("ok"),
  ];
  k.setFoundSource(() => [{ ...review, id: "off-fresh" }], () => asks);   // an id no earlier test kept
  const top = k.found(undefined, 3, "/work/garden");
  assert.equal(top[0].id, "off-fresh", "repeats first");
  assert.deepEqual(top.slice(1).map((o) => o.count), [1, 1], "then two asks sent once");
  assert.ok(!top.some((o) => o.count === 1 && /reviewer/.test(o.words)), "none near the repeat");
  // the list waits for the first read: an empty transcripts folder of the test's own, never this machine's
  process.env.SOL_YOURS_DIR = join(dir, "no-transcripts");
  await (await import("../src/work/yours.ts")).scanNow();
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.list", cwd: "/work/garden" }, (o) => out.push(o));
  assert.equal(out[0].found[0].since, undefined, "a repeat shows its count");
  assert.match(out[0].found[1].since, /^once · today$/, "an ask sent once: where it was sent");
  k._reload();
  const again = k.offerByHand(top[1].id);
  assert.equal(again?.count, 1, "a 'you asked' row opens by hand");
  assert.equal(k.versionsOf(again!).length, 2, "two versions: the fields and the whole ask");
  k.setFoundSource(null);
});

test("undo and forget leave a piece changed by hand, and say so; a piece from before sums is Build's once", async () => {
  const pieces = await import("../src/work/pieces.ts");
  const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
  const folder = join(dir, "stays-folder"); mkdirSync(folder, { recursive: true });
  (await import("node:child_process")).execFileSync("git", ["init", "-q", folder]);
  const who = async (sessionId: string) => ({ project: "garden", sessionId, by: "Ana's agent", cwd: folder });
  const keepOne = async (sid: string) => {
    const out: any[] = [];
    k.again("off-review");
    await k.hear({ on: true, type: "work.yours.offer", sessionId: sid, said: AGAIN }, (o) => out.push(o), who);
    await k.hear({ on: true, type: "work.yours.keep", pieces: true, sessionId: sid, id: "off-review", spec: out[0].versions[1] }, (o) => out.push(o), who);
    return out[1].kept;
  };
  const a = await keepOne("sess-s1");
  const fa = join(folder, ".sol", "pieces", `${a.id}.json`);
  writeFileSync(fa, JSON.stringify({ ...JSON.parse(readFileSync(fa, "utf8")), title: "Mine now" }));
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.undo", id: a.id }, (o) => out.push(o));
  assert.ok(existsSync(fa), "undo leaves the file he changed");
  assert.equal(out[0].stays, true, "and says so");
  await k.hear({ on: true, type: "work.yours.forget", id: a.id }, (o) => out.push(o));
  assert.ok(existsSync(fa), "forget leaves it too");
  assert.equal(out[1].stays, true);
  // a piece written before sums: no "sum" at all, its own name and ceiling: replaced once, and then it has a sum
  const b = await keepOne("sess-s2");
  const fb = join(folder, ".sol", "pieces", `${b.id}.json`);
  const { sum: _, ...old } = JSON.parse(readFileSync(fb, "utf8"));
  writeFileSync(fb, JSON.stringify(old));
  out.length = 0;
  await k.hear({ on: true, type: "work.yours.change", id: b.id, spec: { ...b.spec, title: "Review it" } }, (o) => out.push(o));
  assert.equal(JSON.parse(readFileSync(fb, "utf8")).title, "Review it");
  assert.ok(k.untouched(readFileSync(fb, "utf8")), "it has a sum now");
  assert.equal(out[0].stays, false);
  await k.hear({ on: true, type: "work.yours.undo", id: b.id }, (o) => out.push(o));
  assert.ok(!existsSync(fb), "an untouched piece goes with undo");
  assert.equal(out[1].stays, false);
  pieces.stopAll();
});

test("git itself must say a piece is ignored: a '!' line in the team's .gitignore stops the write; a folder named with [ ] works", async () => {
  const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import("node:fs");
  const git = (await import("node:child_process")).execFileSync;
  const neg = join(dir, "negated-folder"); mkdirSync(neg, { recursive: true });
  git("git", ["init", "-q", neg]);
  writeFileSync(join(neg, ".gitignore"), "!.sol/pieces/yours-*\n");
  assert.equal(k.ignoreKept(neg), false, "the team's '!' outranks the exclude: not safe");
  const odd = join(dir, "odd [v2] folder"); mkdirSync(join(odd, "sub"), { recursive: true });
  git("git", ["init", "-q", odd]);
  assert.equal(k.ignoreKept(join(odd, "sub")), true, "brackets in the folder's name are matched as written");
  assert.match(readFileSync(join(odd, ".git", "info", "exclude"), "utf8"), /\/sub\/\.sol\/pieces\/yours-\*/);
  assert.ok(!existsSync(join(neg, ".sol")), "nothing written in the negated folder");
});

test("a row pressed in the list: Jev is told numbers and kinds only, never a word of the ask", async () => {
  const seen: any[] = [];
  stub({ first: { choice: "button", confidence: 0.9 } }, seen);
  k.setFoundSource(() => [{ ...review, id: "off-spy" }], () => []);
  k.found();
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-spy", id: "off-spy" }, (o) => out.push(o), async (sessionId) => ({ project: "garden", sessionId, by: "Ana" }));
  assert.equal(out[0].offer?.id, "off-spy");
  assert.ok(seen.length > 0, "Jev was asked (which version leads)");
  const told = JSON.stringify(seen.map((x) => x.state));
  for (const w of ["reviewer", "acme", "garden", "#31", "r2", "spring", "Read-only"]) assert.ok(!told.toLowerCase().includes(w.toLowerCase()), `"${w}" never reaches Jev`);
  k.setFoundSource(null);
});

test("a record that is there but cannot be read is never set aside nor saved over; it is read again next time", async () => {
  const { readdirSync, writeFileSync, rmSync, mkdirSync } = await import("node:fs");
  const file = join(dir, "yours.json");
  for (const n of readdirSync(dir)) if (n.startsWith("yours.json")) rmSync(join(dir, n), { recursive: true });
  mkdirSync(file);   // reading it fails (EISDIR): a stand-in for EMFILE, EIO, a lock
  k._reload();
  assert.deepEqual(k.kept(), []);
  k.again("off-review");
  k.keep(w, review, k.versionsOf(review)[0]);   // nothing saved
  assert.equal(readdirSync(dir).filter((n) => n.startsWith("yours.json.bad-")).length, 0, "not set aside");
  const out: any[] = [];
  await k.hear({ on: true, type: "work.yours.list" }, (o) => out.push(o));
  assert.equal(out[0].stuck, true, "the list says it cannot save");
  rmSync(file, { recursive: true });
  writeFileSync(file, JSON.stringify({ seen: {}, kept: [{ id: "yours-0000beef", spec: { shape: "button", fields: [], template: "t", title: "T" }, from: { kind: "ask", count: 3, first: 1 }, project: "garden", title: "T", at: 1 }] }));
  assert.equal(k.kept().length, 1, "read again: the record as it was");
  // shapes that would break the list are damage: a seen entry that is not a record, a kept entry with no spec
  writeFileSync(file, '{"seen": {"x": null}}'); k._reload(); assert.deepEqual(k.kept(), []);
  assert.equal(readdirSync(dir).filter((n) => n.startsWith("yours.json.bad-")).length, 1);
  // a kept entry from before spec and from existed is filled in (the lead, 08:00), never set aside
  writeFileSync(file, '{"kept": [{"id": "yours-1"}]}'); k._reload(); assert.equal(k.kept().length, 1);
  assert.equal(readdirSync(dir).filter((n) => n.startsWith("yours.json.bad-")).length, 1);
});

test("Jev's late answer never turns the person's no back into a ghost", async () => {
  let release: (v: any) => void = () => {};
  jev.setYoursJev(() => new Promise((r) => { release = r; }));
  const late = { ...review, id: "off-late" };
  k.setOfferSource(() => [late]);
  const pending = k.offerJudged("/work/garden", AGAIN);
  await new Promise((r) => setTimeout(r, 10));
  k.seen("off-late", "no");   // the person answers while Jev thinks
  release({ worth: { noul: 0.5 } });
  await pending;
  assert.ok(k.passed().some((p) => p.id === "off-late" && p.how === "no"), "their no stands");
  assert.ok(!k.noticed().some((p) => p.id === "off-late"));
});

test("the rows are the first choice, the same for the page and the piece", () => {
  const two: Offer = { ...review, id: "off-two", blanks: [{ name: "lines", values: ["5", "10"] }, { name: "file", values: ["~/notes/a.md", "~/notes/b.md"] }], template: "summarise {file} in {lines} lines" };
  const v = k.versionsOf(two);
  const rows = v.find((x) => x.shape === "rows")!;
  assert.equal(k.rowField(rows)?.name, "file");
  assert.match(k.pageOf(rows), /data-row="~\/notes\/a.md"/);
  assert.deepEqual((k.recipeOf({ id: "yours-00000001", title: "t", spec: rows, from: two } as any).source as any).rows.map((r: any) => r.t), ["~/notes/a.md", "~/notes/b.md"]);
});

test("a send heard from Build marks its session as one the person typed in, kept in the record", async () => {
  k.setOfferSource(() => []);
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-typed", said: "plan the week's watering" }, () => {}, async (sessionId) => ({ project: "garden", sessionId, by: "Ana" }));
  k._reload();
  const { readFileSync } = await import("node:fs");
  const yo = await import("../src/work/yours.ts");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "yours.json"), "utf8")).typed["sess-typed"], [yo.sentKey("plan the week's watering")], "what he sent, kept across a restart");
});

test("in a session he typed in, only what he sent is his: the engine's own later turns there never are", async () => {
  const yo = await import("../src/work/yours.ts");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const root = join(dir, "typed-transcripts", "-work-mine"); mkdirSync(root, { recursive: true });
  const at = new Date(Date.now() - 60_000).toISOString();
  const line = (text: string) => JSON.stringify({ type: "user", sessionId: "sess-mine", cwd: "/work/mine", timestamp: at, entrypoint: "sdk-cli", message: { role: "user", content: text } });
  writeFileSync(join(root, "sess-mine.jsonl"), [line("plan the  week's\nwatering"), line("Run this folder's own tests in /work/mine. End with one word on its own line: GREEN")].join("\n") + "\n");
  k.setOfferSource(() => []);
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-mine", said: "plan the week's watering" }, () => {}, async (sessionId) => ({ project: "garden", sessionId, by: "Ana" }));
  const asks = await yo.readAsks(join(dir, "typed-transcripts"), 30, Date.now());
  assert.deepEqual(asks.map((a) => a.text), ["plan the  week's\nwatering"], "his send (spaces aside) counts; the engine's test prompt does not");
});

test("odd hand-made records and names never break the list or the tool", async () => {
  const { writeFileSync, readdirSync } = await import("node:fs");
  const file = join(dir, "yours.json");
  const n0 = readdirSync(dir).filter((x) => x.startsWith("yours.json.bad-")).length;
  writeFileSync(file, JSON.stringify({ kept: [{ id: "yours-0000abcd", spec: {}, from: {}, piece: "yours-0000abcd", cwd: 5 }] }));
  k._reload();
  assert.deepEqual(k.kept(), [], "a cwd that is no path is damage");
  assert.equal(readdirSync(dir).filter((x) => x.startsWith("yours.json.bad-")).length, n0 + 1);
  // a blank named like an object's own key reads nothing it was not given
  const named: Offer = { ...review, id: "off-ctor", template: "fix the {constructor} gate and the {hinge} today", blanks: [{ name: "constructor", values: ["north"] }, { name: "hinge", values: ["top"] }] };
  const seen = k.withSaid(named, "fix the gate today");   // "constructor" not in the send: nothing read for it
  assert.deepEqual(seen.blanks.map((b) => b.values.every((x) => typeof x === "string")), [true, true]);
  // a counter is never the row, even when it is the only field left
  assert.equal(k.rowField({ fields: [{ name: "issue", value: "#1047", values: ["#1046", "#1045", "#1044"], next: true }] } as any), undefined);
});

test("an older record whose kept entry has no spec or from is filled in, never set aside: his kept tools stay", async () => {
  const { writeFileSync, readdirSync } = await import("node:fs");
  const file = join(dir, "yours.json");
  const n0 = readdirSync(dir).filter((x) => x.startsWith("yours.json.bad-")).length;
  writeFileSync(file, JSON.stringify({ seen: {}, kept: [{ id: "yours-0000c0de", title: "Bills", project: "garden", at: 5 }] }));
  k._reload();
  const kept = k.kept();
  assert.equal(kept.length, 1, "it stays");
  assert.equal(kept[0].title, "Bills");
  assert.deepEqual(kept[0].spec.fields, []);
  assert.equal(kept[0].from.count, 1);
  assert.equal(kept[0].spec.shape, "brief", "no shape said: the whole ask");
  writeFileSync(file, JSON.stringify({ kept: [{ id: "yours-0000c0de", shape: "pin", title: "Shorter" }] }));
  k._reload();
  assert.equal(k.kept()[0].spec.shape, "pin", "its own shape, when it says one");
  writeFileSync(file, JSON.stringify({ seen: {}, kept: [{ id: "yours-0000c0de", title: "Bills", project: "garden", at: 5 }] }));
  k._reload();
  assert.equal(readdirSync(dir).filter((x) => x.startsWith("yours.json.bad-")).length, n0, "nothing set aside");
  // a field that is there with the wrong type is still damage
  writeFileSync(file, JSON.stringify({ kept: [{ id: "yours-0000c0de", spec: "button", from: {} }] }));
  k._reload();
  assert.deepEqual(k.kept(), []);
});

test("an ask sent from Build is a row in the list even when the agent's turn failed (no transcript line); the engine's own first prompt never is; Jev never sees it", async () => {
  // the walk of 2026-11-13: the try copy's turns fail (401, no sign-in), so Claude writes no line of the ask; only the
  // seeded transcript's "holiday hours" was listed. A seeded transcript of the test's own, never this machine's
  const yo = await import("../src/work/yours.ts");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const root = join(dir, "seeded-transcripts"), proj = join(root, "-work-bakery"); mkdirSync(proj, { recursive: true });
  const at = new Date(Date.now() - 3_600_000).toISOString();
  writeFileSync(join(proj, "sess-seed.jsonl"), JSON.stringify({ type: "user", sessionId: "sess-seed", cwd: "/work/bakery", timestamp: at, message: { role: "user", content: "Add the holiday hours to the bakery's front page." } }) + "\n");
  process.env.SOL_YOURS_DIR = root;
  yo._forget(); await yo.scanNow();
  k.setOfferSource(null); k.setFoundSource(null);
  const asked: any[] = [];
  stub({}, asked);
  const who = async (sessionId: string) => ({ project: "bakery", sessionId, by: "Noa Patel", cwd: "/work/bakery" });
  const SENT = "Write the opening times for the new menu page, closed on 2026-12-25";
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-401", said: SENT }, () => {}, who);
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-eng", said: "You are the one session: plan the bakery's whole week of baking and orders" }, () => {}, who);
  const list = async () => { const out: any[] = []; await k.hear({ on: true, type: "work.yours.list", cwd: "/work/bakery" }, (o) => out.push(o), who); return out[0].found as any[]; };
  let found = await list();
  assert.equal(found[0]?.opening, SENT, "his ask, newest first, though the agent never answered");
  assert.match(found[0].since, /^once · today$/);
  assert.ok(found.some((o) => /holiday hours/.test(o.opening)), "the transcript's ask stays too");
  assert.ok(!found.some((o) => /one session/.test(o.opening)), "the engine's own first prompt is never his");
  // kept across a restart; and once the turn does land in a transcript, the ask is one row, not two
  k._reload();
  writeFileSync(join(proj, "sess-401.jsonl"), JSON.stringify({ type: "user", sessionId: "sess-401", cwd: "/work/bakery", timestamp: new Date().toISOString(), entrypoint: "sdk-cli", message: { role: "user", content: SENT } }) + "\n");
  await yo.scanNow();
  found = await list();
  assert.equal(found.filter((o) => o.opening === SENT).length, 1, "one row");
  assert.ok(!JSON.stringify(asked).includes("opening times"), "the ask's words never go to Jev");
  process.env.SOL_YOURS_DIR = join(dir, "no-transcripts");
  yo._forget(); await yo.scanNow();
  jev.setYoursJev(null as any);
});

test("#1131: a new session's first ask is kept under its own folder, not the engine's; a record-only ask marks nothing shown", async () => {
  // the run is still opening: whoFor knows no folder and falls back to the engine's own (process.cwd())
  const opening = async (sessionId: string) => ({ project: "engine", sessionId, by: "work agent", cwd: process.cwd() });
  const out: any[] = [];
  const said = "Plan the spring garden beds for Noa Patel, three rows, by Friday";
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-new1", said, cwd: "/work/garden-new", record: true }, (o) => out.push(o), opening);
  const row = k.withSent([]).find((a) => a.session === "sess-new1");
  assert.equal(row?.cwd, "/work/garden-new", "the folder the face sent, not the engine's");
  assert.deepEqual(out[0], { offer: null, versions: [] }, "record only: nothing judged");
  // a run the engine knows keeps its own folder, whatever the face sent; a folder that is not a path is not taken
  assert.equal(k.folderOf("/work/garden", "/work/other"), "/work/garden");
  assert.equal(k.folderOf(process.cwd(), "/work/garden-new"), "/work/garden-new");
  assert.equal(k.folderOf(process.cwd(), "garden"), process.cwd());
  assert.equal(k.folderOf(undefined, "/work/garden-new"), "/work/garden-new");
  // an offer standing on the line: the send's ask is record-only and the next offer is not marked shown unseen
  k.again("off-review");
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-new2", said: AGAIN, cwd: "/work/garden", record: true }, (o) => out.push(o), opening);
  assert.equal(out[1].offer, null);
  assert.equal(k.offerNow("/work/garden", Date.now(), AGAIN)?.id, "off-review", "still to be said: it was never marked shown");
  // the judged ask reads the face's folder too
  k.again("off-review"); out.length = 0;
  let read = "";
  k.setOfferSource((folder: string) => { read = folder; return [review, fix]; });
  await k.hear({ on: true, type: "work.yours.offer", sessionId: "sess-new3", said: AGAIN, cwd: "/work/garden" }, (o) => out.push(o), opening);
  assert.equal(read, "/work/garden");
});
