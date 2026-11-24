// Context: facts with sources, learned and stale (next/context.ts, parts/next-s29.ts; #1617 Harmony slice S29). On S30's
// persona months (next/fixtures, the panel's people only), replayed into a temp SOL_HOME: every fact has a source; a
// seat's learning arrives as a proposal; stale ground is flagged, never deleted; Remove is a hold. Context follows place.
// With ui.next off the part answers nothing and writes nothing; another connection is refused.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HERE } from "./fixtures/make.mjs";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-context-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
const C = await import("./context.js");
const part = (await import("../parts/next-s29.js")).default;
const P = await import("./pos.js");
const F = await import("./fits.js");

type Act = { id: string; at: number; who: string; act: string; place: string; [k: string]: any };
const month = (name: string): Act[] => readFileSync(join(HERE, `${name}-month.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((a) => a.act);
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };
/** a month's facts, each written as it came: Sol's (learned) or the person's own */
function replay(h: string, acts: Act[]) {
  return acts.filter((a) => a.act === "fact").map((a) => ({ a, r: C.addFact(h, a, a.who === "sol" ? "sol" : "person", a.at) }));
}
const stored = (h: string) => JSON.parse(readFileSync(C.contextFile(h), "utf8"));

test("every fact of every month is kept with its source; Sol's are learned, the person's are not; none without a source", () => {
  let withFacts = 0;
  for (const name of ["dev", "denise", "minji", "tomas", "lucy"]) {
    const h = home(), got = replay(h, month(name));
    for (const { a, r } of got) {
      assert.ok(r.ok, `${name} ${a.id}: ${!r.ok && r.why}`);
      if (r.ok) { assert.equal(r.fact.source, a.source); assert.equal(r.fact.learned, a.who === "sol"); }
    }
    if (!got.length) continue;   // Lucy's month says no fact
    for (const f of stored(h).facts) assert.ok(typeof f.source === "string" && f.source.length > 0);
    withFacts++;
  }
  assert.equal(withFacts, 4);
  const h = home();
  assert.deepEqual(C.addFact(h, { place: "dev", fact: "tests run with pnpm" }), { ok: false, why: "a fact needs its source" });
  assert.deepEqual(C.addFact(h, { place: "dev", fact: "tests run with pnpm", source: "   " }), { ok: false, why: "a fact needs its source" });
  assert.equal(C.propose(h, { place: "dev", fact: "tests run with pnpm", seat: "claude" }).ok, false);
  assert.equal(existsSync(C.contextFile(h)), false, "nothing written");
});

test("context follows place: a place reads its own facts and those of every place above it", () => {
  const h = home();
  replay(h, month("denise"));
  const top = C.contextOf(h, "denise"), bookings = C.contextOf(h, "denise/bookings/2026");
  assert.ok(top.ok && bookings.ok);
  assert.ok(top.facts.every((f) => f.place === "denise"), "the business sees none of the bookings' notes");
  assert.equal(bookings.facts.filter((f) => f.place === "denise/bookings").length, 50);
  assert.ok(bookings.facts.every((f) => f.place !== "denise/bookings" || f.offLimits === true), "the clients' notes keep their off-limits mark");
  assert.ok(bookings.facts.some((f) => f.place === "denise"), "and the business's facts above");
  assert.equal(bookings.facts[0].place, "denise/bookings", "nearest place first");
  assert.equal(C.contextOf(h, "../x").ok, false);
});

test("stale ground is flagged, never deleted: Denise's old opening days, replaced on day 24", () => {
  const h = home(), acts = month("denise");
  replay(h, acts);
  const newer = acts.find((a) => a.act === "fact" && a.replaces)!;
  const r = C.contextOf(h, "denise");
  assert.ok(r.ok);
  const old = r.facts.find((f) => f.fact === newer.replaces)!, now = r.facts.find((f) => f.fact === newer.fact)!;
  assert.ok(old, "the old fact still shows");
  assert.equal(old.stale, true);
  assert.match(old.staleWhy!, /replaced by “open Tuesday to Sunday, 9 to 5”/);
  assert.equal(now.stale, false);
  assert.ok(stored(h).facts.some((f: any) => f.fact === newer.replaces), "and is still in the file");
  assert.deepEqual(C.wordsAt(h, "denise").includes(newer.replaces), false, "Home's filing reads only what stands");
  assert.ok(C.wordsAt(h, "denise").includes(newer.fact));
  // a check found a fact's ground gone (Tomás's VoiceOver note, say): flagged with why, kept
  const t = home();
  replay(t, month("tomas"));
  const vo = C.contextOf(t, "tomas");
  assert.ok(vo.ok);
  assert.ok(C.staleFact(t, { id: vo.facts[0].id, why: "the setting it came from is gone" }).ok);
  const again = C.contextOf(t, "tomas");
  assert.ok(again.ok && again.facts[0].stale && again.facts[0].staleWhy === "the setting it came from is gone");
  assert.equal(stored(t).facts.length, vo.facts.length);
});

test("a seat's learning arrives as a proposal: asked once, kept by the person as learned, a no not asked again", () => {
  const h = home();
  replay(h, month("dev"));
  const runs = month("dev").filter((a) => a.act === "run.start" && a.place.startsWith("dev/api")).slice(0, 2);
  assert.equal(runs.length, 2, "Dev's month has runs in api");
  const said = { place: "dev/api", fact: "migrations come with a test", source: `what ${runs[0].seat} saw in run ${runs[0].run}` };
  const p = C.propose(h, { ...said, seat: runs[0].seat });
  assert.ok(p.ok && p.ask === "Keep this?");
  const ctx = C.contextOf(h, "dev/api");
  assert.ok(ctx.ok);
  assert.equal(ctx.facts.some((f) => f.fact === said.fact), false, "not a fact until kept");
  assert.deepEqual(ctx.proposals.map((x) => x.fact), [said.fact]);
  // the same learning again, from another seat: it lands on the open one
  const p2 = C.propose(h, { ...said, fact: "Migrations come with a test.", seat: "codex" });
  assert.ok(p2.ok && p.ok && p2.proposal.id === p.proposal.id && p2.proposal.count === 2);
  assert.deepEqual(p2.ok && p2.proposal.seats, [runs[0].seat, "codex"].filter((x, i, a) => a.indexOf(x) === i));
  assert.equal(stored(h).proposals.length, 1);
  const k = C.answer(h, { id: p.ok && p.proposal.id, keep: true });
  assert.ok(k.ok && k.fact && k.fact.learned && k.fact.by === "seat" && k.fact.source === said.source);
  assert.equal(C.answer(h, { id: p.ok && p.proposal.id, keep: true }).ok, false, "answered once");
  const kept = C.contextOf(h, "dev/api/migrations");
  assert.ok(kept.ok && kept.facts.some((f) => f.fact === said.fact && f.learned) && kept.proposals.length === 0);
  assert.deepEqual(C.propose(h, { ...said, seat: "codex" }), { ok: false, why: "it is a fact here already" });
  // a no: kept, and not asked again there
  const q = C.propose(h, { place: "dev/web", fact: "the web app deploys on Fridays", source: "a guess from one run", seat: "codex" });
  assert.ok(q.ok);
  assert.ok(C.answer(h, { id: q.ok && q.proposal.id, keep: false }).ok);
  assert.equal(C.propose(h, { place: "dev/web", fact: "the web app deploys on Fridays", source: "again", seat: "claude" }).ok, false);
  assert.equal(C.propose(h, { place: "dev/web", fact: "the web app deploys on Fridays", source: "x" }).ok, false, "a proposal names its seat");
});

test("Remove is a hold: out of every context, kept in the file, its words refused until undone", () => {
  const h = home();
  replay(h, month("minji"));
  const r = C.contextOf(h, "minji");
  assert.ok(r.ok);
  const f = r.facts[0];
  assert.ok(C.remove(h, { id: f.id }).ok);
  const after = C.contextOf(h, "minji/clients");
  assert.ok(after.ok && !after.facts.some((x) => x.id === f.id));
  assert.ok(stored(h).facts.find((x: any) => x.id === f.id).removed, "held, not deleted");
  assert.equal(C.addFact(h, { place: "minji", fact: f.fact, source: "said again" }, "sol").ok, false);
  assert.equal(C.propose(h, { place: "minji", fact: f.fact, source: "seen again", seat: "claude" }).ok, false);
  assert.ok(C.remove(h, { id: f.id }).ok && (C.remove(h, { id: f.id }) as any).again, "a second Remove writes nothing new");
  assert.ok(C.remove(h, { id: f.id, undo: true }).ok);
  const back = C.contextOf(h, "minji");
  assert.ok(back.ok && back.facts.some((x) => x.id === f.id));
});

test("the part: off answers nothing and writes nothing; another connection is refused; on, the five messages", async () => {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  assert.deepEqual([...hs.keys()].sort(), ["next.context", "next.fact.add", "next.fact.keep", "next.fact.propose", "next.fact.remove"], "exact types only");
  const h = home(), sent: any[] = [];
  const conn = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send() {}, everyone() {}, face: { send: (m: object) => sent.push(m) }, conn: { chars: 0 }, fromSol, fromApp: fromSol });
  const ask = async (m: any, fromSol = true) => { await hs.get(m.type)!(m, conn(fromSol)); return sent.at(-1); };

  process.env.SOL_UI_NEXT = "off";
  await ask({ type: "next.fact.add", place: "tomas", fact: "uses VoiceOver on macOS, keyboard only", source: "Tomás said it, day 3" });
  assert.equal(sent.length, 0);
  assert.equal(existsSync(join(h, "next")), false, "nothing written while off");

  process.env.SOL_UI_NEXT = "on";
  assert.deepEqual(await ask({ type: "next.context", rid: 7, scope: "tomas" }, false), { type: "next.context", rid: 7, ok: false, why: "only Sol's own windows" });
  assert.equal(existsSync(join(h, "next")), false);
  const add = await ask({ type: "next.fact.add", place: "tomas", fact: "uses VoiceOver on macOS, keyboard only", source: "Tomás said it, day 3" });
  assert.ok(add.ok && add.fact.learned === false);
  const pr = await ask({ type: "next.fact.propose", place: "tomas", fact: "reads diffs with the line numbers spoken", source: "what claude saw on day 5", seat: "claude" });
  assert.equal(pr.ask, "Keep this?");
  const kp = await ask({ type: "next.fact.keep", id: pr.proposal.id, keep: true });
  assert.ok(kp.ok && kp.fact.learned);
  const rm = await ask({ type: "next.fact.remove", id: add.fact.id });
  assert.ok(rm.ok);
  const ctx = await ask({ type: "next.context", scope: "tomas" });
  assert.deepEqual(ctx.facts.map((f: any) => [f.fact, f.learned, f.stale]), [["reads diffs with the line numbers spoken", true, false]]);
  assert.deepEqual(readdirSync(join(h, "next")), ["context.json"]);
});

test("a no holds the words from the seats only; replaced stays replaced; replaces stays in its place; keep makes no second", () => {
  const h = home();
  const q = C.propose(h, { place: "denise", fact: "open on Mondays", source: "a guess from the calendar", seat: "claude" });
  assert.ok(q.ok && C.answer(h, { id: q.proposal.id, keep: false }).ok);
  assert.equal(C.addFact(h, { place: "denise", fact: "open on Mondays", source: "seen again" }, "sol").ok, false, "not Sol");
  assert.ok(C.addFact(h, { place: "denise", fact: "open on Mondays", source: "Denise said it" }).ok, "the person may say it herself");
  // B replaces A, then B is removed: A is still stale and out of Home's filing
  const a = C.addFact(h, { place: "denise", fact: "a massage is 60 minutes", source: "price-list.md" });
  const b = C.addFact(h, { place: "denise", fact: "a massage is 60 or 90 minutes", source: "price-list.md, day 9", replaces: "a massage is 60 minutes" });
  assert.ok(a.ok && b.ok && C.remove(h, { id: b.fact.id }).ok);
  const r = C.contextOf(h, "denise");
  assert.ok(r.ok && r.facts.find((f) => f.id === a.fact.id)!.stale);
  assert.equal(C.wordsAt(h, "denise").includes("a massage is 60 minutes"), false);
  // replaces by id only within its own place
  const m = C.addFact(h, { place: "minji", fact: "pays for Figma", source: "the seats Min-ji connected" });
  assert.ok(m.ok);
  assert.equal(C.addFact(h, { place: "denise", fact: "x", source: "y", replaces: m.fact.id }).ok, false);
  assert.equal((C.contextOf(h, "minji") as any).facts[0].stale, false);
  // a proposal kept after the person said the same words: the one fact stands
  const p = C.propose(h, { place: "denise/bookings", fact: "Saturdays fill first", source: "what codex saw", seat: "codex" });
  assert.ok(p.ok && C.addFact(h, { place: "denise/bookings", fact: "Saturdays fill first", source: "Denise said it" }).ok);
  const k = C.answer(h, { id: p.proposal.id, keep: true });
  assert.ok(k.ok);
  assert.equal(stored(h).facts.filter((f: any) => f.fact === "Saturdays fill first").length, 1);
});

// BR1 item 6 (#1615), builder P: a folder the person put inside another reads that folder's facts, not only its own
test("a folder the person nested themselves reads its parent's facts; their nesting wins over the path; a loop ends", () => {
  const h = home(), at = (id: string, inn: string | null) => assert.ok(P.setPos(h, { id, x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: inn }).ok);
  const words = (scope: string) => { const r = C.contextOf(h, scope); assert.ok(r.ok); return r.facts.map((f) => f.fact); };
  for (const [place, fact] of [["h:denise", "Denise books by phone"], ["h:massage", "a massage is 60 minutes"], ["h:work", "Dev ships on Fridays"],
    ["w:/srv/dev/code", "the code folder is backed up nightly"], ["w:/srv/dev/code/api", "the api runs on port 4000"], ["~", "answers in English"]] as const)
    assert.ok(C.addFact(h, { place, fact, source: "said it" }).ok);

  // Denise's life folders: unnested, massage knows only its own and All of Sol's
  assert.deepEqual(words("h:massage"), ["a massage is 60 minutes", "answers in English"]);
  at("h:massage", "h:denise");
  assert.deepEqual(words("h:massage"), ["a massage is 60 minutes", "Denise books by phone", "answers in English"], "nearest first, then the folder it sits in, then ~");
  assert.deepEqual(words("h:denise"), ["Denise books by phone", "answers in English"], "the parent never reads its child's");

  // Dev's api: by the path it reads its disk parent; put in Work by Dev, it reads Work's instead; taken to the top, neither
  assert.deepEqual(words("w:/srv/dev/code/api"), ["the api runs on port 4000", "the code folder is backed up nightly", "answers in English"]);
  at("w:/srv/dev/code/api", "h:work");
  assert.deepEqual(words("w:/srv/dev/code/api"), ["the api runs on port 4000", "Dev ships on Fridays", "answers in English"]);
  at("w:/srv/dev/code/api", null);
  assert.deepEqual(words("w:/srv/dev/code/api"), ["the api runs on port 4000", "answers in English"]);

  // a nesting two deep goes on; a loop the face could leave ends, each folder read once
  at("h:denise", "h:work");
  assert.deepEqual(words("h:massage"), ["a massage is 60 minutes", "Denise books by phone", "Dev ships on Fridays", "answers in English"]);
  at("h:work", "h:massage");
  assert.deepEqual(words("h:massage"), ["a massage is 60 minutes", "Denise books by phone", "Dev ships on Fridays", "answers in English"]);

  // with nothing said, upward is the path alone, as before
  assert.deepEqual(F.upward("dev/api/tests"), ["dev/api/tests", "dev/api", "dev", "~"]);
  assert.deepEqual(F.upward("dev/api", () => undefined), ["dev/api", "dev", "~"]);
  assert.deepEqual(F.upward("session:abc", () => "h:work"), ["session:abc", "~"]);
});

test("a folder's facts kept by its scope follow the nesting kept by its id: pos.json says h:massage, the fact says home/massage", () => {
  const h = home(), at = (id: string, inn: string | null) => assert.ok(P.setPos(h, { id, x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: inn }).ok);
  const words = (scope: string) => { const r = C.contextOf(h, scope); assert.ok(r.ok); return r.facts.map((f) => f.fact); };
  for (const [place, fact] of [["home/health", "Denise sees the physio on Tuesdays"], ["home/massage", "a massage is 60 minutes"],
    ["srv/dev/work", "Dev ships on Fridays"], ["srv/dev/code/api", "the api runs on port 4000"]] as const)
    assert.ok(C.addFact(h, { place, fact, source: "said it" }).ok);
  assert.deepEqual(words("home/massage"), ["a massage is 60 minutes"], "unnested, massage's path parent is home, which says nothing");
  at("h:massage", "h:health");
  assert.deepEqual(words("home/massage"), ["a massage is 60 minutes", "Denise sees the physio on Tuesdays"], "put in health, it reads health's");
  at("w:/srv/dev/code/api", "w:/srv/dev/work");
  assert.deepEqual(words("srv/dev/code/api"), ["the api runs on port 4000", "Dev ships on Fridays"], "a w: folder the same way");
  assert.deepEqual(F.upward("home/massage", F.nestedIn(h)), ["home/massage", "home/health", "home", "~"], "health unnested goes on by its path");
});
