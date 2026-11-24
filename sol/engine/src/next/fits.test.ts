// Fits with an author, a reason and a hold (next/fits.ts, parts/next-s15.ts; #1617 Harmony slice S15). On S30's persona
// months (next/fixtures, the panel's people only), replayed into a temp SOL_HOME: every fit Sol writes has a reason with a
// count; one Back of a knob in a scope holds it; the meta engine's write to a held fit is refused; the nearest scope wins;
// the history replays a past state; Sol offers once, and never again after one not now. With ui.next off the part
// answers nothing and writes nothing; another connection is refused.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HERE } from "./fixtures/make.mjs";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-fits-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
const F = await import("./fits.js");
const part = (await import("../parts/next-s15.js")).default;

type Act = { id: string; at: number; day: number; who: string; act: string; place: string; [k: string]: any };
const month = (name: string): Act[] => readFileSync(join(HERE, `${name}-month.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((a) => a.act);
let n = 0;
const home = () => { const d = join(tmp, `h${++n}`); mkdirSync(d, { recursive: true }); return d; };

/** a month's fit acts written through fits.ts, as the meta engine and the person's presses would: each answer kept */
function replay(h: string, acts: Act[]) {
  const offers = new Map<string, string>(), out: { a: Act; r: { ok: boolean; why?: string } }[] = [];
  for (const a of acts) {
    let r: { ok: boolean; why?: string } | null = null;
    if (a.act === "fit.set") r = a.author === "sol" ? F.solSet(h, a, a.at) : F.personSet(h, a, a.at);
    else if (a.act === "fit.back") r = F.back(h, a, a.at);
    else if (a.act === "offer") {
      const o = F.offer(h, { ...a, reason: a.why ?? `a ${a.mode} change the week asked for` }, a.at);
      if (o.ok) offers.set(a.offer, o.offer.id);
      r = o;
    } else if (a.act === "keep" || a.act === "notnow") {
      if (offers.has(a.offer)) r = F.answerOffer(h, { offer: offers.get(a.offer), keep: a.act === "keep" }, a.at);
    }
    if (r) out.push({ a, r });
  }
  return out;
}

test("every month replays, and every fit Sol wrote carries its reason and a count from the person's history", () => {
  for (const name of ["dev", "denise", "minji", "tomas", "lucy"]) {
    const h = home(), acts = month(name), got = replay(h, acts);
    const sets = got.filter((x) => x.a.act === "fit.set");
    assert.ok(sets.length > 0, `${name} has fits`);
    for (const x of sets.filter((x) => x.a.author === "person")) assert.ok(x.r.ok, `${name} ${x.a.id}: ${x.r.why}`);
    // every Sol fit of the month lands: none of them is on a knob the person held or set
    for (const x of sets.filter((x) => x.a.author === "sol" && !acts.some((b) => b.knob === x.a.knob && b.scope === x.a.scope && b.who !== "sol" && b.at < x.a.at))) assert.ok(x.r.ok, `${name} ${x.a.id}: ${x.r.why}`);
    assert.ok(F.fitsAt(h).some((f) => f.author === "sol"), `${name} has a standing Sol fit`);
    for (const f of F.fitsAt(h)) for (const s of f.history.filter((s) => s.act === "set" && s.author === "sol")) {
      assert.ok(typeof s.reason === "string" && s.reason.length > 0 && Number.isInteger(s.count) && s.count! > 0, `${name} ${f.knob}: ${JSON.stringify(s)}`);
    }
    for (const f of F.fitsAt(h).filter((f) => f.author === "sol")) assert.ok(f.reason && f.count! > 0);
  }
  // and none is written without them
  const h = home();
  for (const bad of [{ knob: "life.density", scope: "lucy", take: "close" }, { knob: "life.density", scope: "lucy", take: "close", reason: "3 of 4", count: 0 },
    { knob: "life.density", scope: "lucy", take: "close", reason: "", count: 3 }, { knob: "life.density", scope: "lucy", take: "close", reason: "3 of 4", count: 2.5 }]) {
    assert.equal(F.solSet(h, bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(existsSync(F.fitsFile(h)), false, "a refused write writes nothing");
});

test("one Back by Tomás holds the fit, and the meta engine's next write there is refused", () => {
  const h = home(), acts = month("tomas");
  replay(h, acts);
  const set = acts.find((a) => a.act === "fit.set" && a.author === "sol" && acts.some((b) => b.act === "fit.back" && b.knob === a.knob && b.scope === a.scope))!;
  const f = F.fitsOf(h, set.scope);
  assert.ok(f.ok);
  const motion = f.fits.find((x) => x.knob === set.knob)!;
  assert.equal(motion.held, true, "one Back holds it");
  assert.equal(motion.take, null, "the take before it (none) returns");
  assert.equal(motion.author, "default");
  assert.deepEqual(motion.history.map((s) => [s.act, s.undone ?? false]), [["set", true], ["back", false]]);
  const before = readFileSync(F.fitsFile(h), "utf8");
  const again = F.solSet(h, { knob: set.knob, scope: set.scope, take: set.take, reason: "5 of his last 6 runs landed while he was elsewhere", count: 5 });
  assert.deepEqual(again, { ok: false, why: "held: the person took it back, so Sol leaves it alone" });
  assert.equal(F.offer(h, { knob: set.knob, scope: set.scope, take: set.take, reason: "again", count: 5 }).ok, false, "nor is it offered");
  assert.equal(readFileSync(F.fitsFile(h), "utf8"), before, "nothing written");
  // the person lets it go: Sol may fit it again
  assert.ok(F.personSet(h, { knob: set.knob, scope: set.scope, held: false }).ok);
  assert.ok(F.solSet(h, { knob: set.knob, scope: set.scope, take: set.take, reason: "5 of his last 6 runs landed while he was elsewhere", count: 5 }).ok);
  // Tomás's other Sol fit (build.density), never taken back, is Sol's and not held
  const dens = F.takeOf(h, "build.density", "tomas");
  assert.equal(dens.author, "sol");
  assert.equal(dens.held, false);
});

test("a take the person set is theirs: Sol does not write over it", () => {
  const h = home();
  replay(h, month("lucy"));
  const att = F.takeOf(h, "attention", "lucy");
  assert.equal(att.author, "person");
  assert.equal(F.solSet(h, { knob: "attention", scope: "lucy", take: "everything", reason: "opened all 9 days", count: 9 }).ok, false);
});

test("the nearest scope wins", () => {
  const h = home();
  replay(h, month("dev"));
  assert.equal(F.takeOf(h, "build.density", "dev/api/tests").take, F.takeOf(h, "build.density", "dev").take, "the nearest above is dev");
  assert.ok(F.solSet(h, { knob: "build.density", scope: "dev/api", take: "close", reason: "4 of the last 5 days in api read this way", count: 4 }).ok);
  assert.ok(F.personSet(h, { knob: "build.density", scope: "dev/api/tests", take: "roomy" }).ok);
  assert.equal(F.takeOf(h, "build.density", "dev/api/tests/unit").take, "roomy");
  assert.equal(F.takeOf(h, "build.density", "dev/api/tests").author, "person");
  assert.equal(F.takeOf(h, "build.density", "dev/api/routes").take, "close");
  assert.equal(F.takeOf(h, "build.density", "dev/api").author, "sol");
  assert.equal(F.takeOf(h, "build.density", "dev/web").take, F.takeOf(h, "build.density", "dev").take);
  assert.equal(F.takeOf(h, "never.set", "dev/api").author, "default");
  // with a scope, next.fits answers the fits that bear on it: its own and those above
  const r = F.fitsOf(h, "dev/api");
  assert.ok(r.ok);
  assert.deepEqual([...new Set(r.fits.map((f) => f.scope))].sort(), ["dev", "dev/api"]);
  for (const bad of ["", "/dev", "dev//api", "dev/../x", "a\\b"]) assert.equal(F.fitsOf(h, bad).ok, false, bad);
});

test("the history replays a past state: Lucy's attention as it stood each hour of day 3", () => {
  const h = home(), acts = month("lucy");
  replay(h, acts);
  const att = acts.filter((a) => a.act === "fit.set" && a.knob === "attention");
  for (const a of att) {
    const then = F.fitsAt(h, a.at).find((f) => f.knob === "attention" && f.scope === a.scope)!;
    assert.equal(then.take, a.take, `${a.id}`);
    assert.equal(then.author, "person");
  }
  assert.equal(F.fitsAt(h, att[0].at - 1).find((f) => f.knob === "attention"), undefined, "before her first press, no fit");
  // and a Back is replayed too: Dev's voice, his own, taken back on day 9
  const d = home(), dev = month("dev");
  replay(d, dev);
  const set = dev.find((a) => a.act === "fit.set" && a.knob === "voice")!, bk = dev.find((a) => a.act === "fit.back" && a.knob === "voice")!;
  assert.equal(F.fitsAt(d, bk.at - 1).find((f) => f.knob === "voice")!.take, set.take);
  const now = F.fitsAt(d).find((f) => f.knob === "voice")!;
  assert.equal(now.take, null);
  assert.equal(now.held, true);
  assert.equal(F.fitsAt(d, set.at - 1).find((f) => f.knob === "voice"), undefined);
});

test("Sol offers once, and never again after one not now; a kept offer is the person's", () => {
  const h = home(), acts = month("dev"), got = replay(h, acts);
  const offered = got.filter((x) => x.a.act === "offer");
  assert.ok(offered.length >= 3 && offered.every((x) => x.r.ok));
  const said = acts.find((a) => a.act === "notnow")!, o = acts.find((a) => a.act === "offer" && a.offer === said.offer)!;
  assert.deepEqual(F.offer(h, { knob: o.knob, scope: o.scope, take: o.take, reason: "the week asked again" }), { ok: false, why: "not now was said: Sol does not offer it again" });
  // open: no second
  const x = home();
  assert.ok(F.offer(x, { knob: "build.tools", scope: "dev", take: "fewer tools at hand", reason: "a build change the week asked for" }).ok);
  assert.deepEqual(F.offer(x, { knob: "build.tools", scope: "dev", take: "one tool per part", reason: "another" }), { ok: false, why: "offered already, waiting for an answer" });
  // Denise kept the larger text: it is hers, with Sol's reason kept
  const d = home();
  replay(d, month("denise"));
  const size = F.takeOf(d, "text.size", "denise");
  assert.equal(size.take, "larger");
  assert.equal(size.author, "person");
  assert.ok(size.history.some((s) => s.act === "offer") && size.history.some((s) => s.act === "keep"));
});

test("the part: off answers nothing and writes nothing; another connection is refused; on, the person's set and back", async () => {
  const hs = new Map<string, (m: unknown, h: unknown) => unknown>();
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  assert.deepEqual([...hs.keys()].sort(), ["next.fit.back", "next.fit.set", "next.fits"], "exact types only");
  const h = home(), sent: any[] = [];
  const conn = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send() {}, everyone() {}, face: { send: (m: object) => sent.push(m) }, conn: { chars: 0 }, fromSol, fromApp: fromSol });
  const ask = async (m: any, fromSol = true) => { await hs.get(m.type)!(m, conn(fromSol)); return sent.at(-1); };

  process.env.SOL_UI_NEXT = "off";
  await ask({ type: "next.fit.set", knob: "voice", scope: "dev", take: "quieter" });
  assert.equal(sent.length, 0);
  assert.equal(existsSync(join(h, "next")), false, "nothing written while off");

  process.env.SOL_UI_NEXT = "on";
  assert.deepEqual(await ask({ type: "next.fits", rid: 1 }, false), { type: "next.fits", rid: 1, ok: false, why: "only Sol's own windows" });
  assert.equal(existsSync(join(h, "next")), false);
  const set = await ask({ type: "next.fit.set", rid: 2, knob: "voice", scope: "dev", take: "quieter while I'm reviewing" });
  assert.equal(set.ok, true);
  assert.equal(set.fit.author, "person");
  const bk = await ask({ type: "next.fit.back", knob: "voice", scope: "dev" });
  assert.equal(bk.fit.held, true);
  assert.equal(bk.fit.take, null);
  const all = await ask({ type: "next.fits", scope: "dev/api" });
  assert.deepEqual(all.fits.map((f: any) => [f.knob, f.scope, f.take, f.author, f.held]), [["voice", "dev", null, "default", true]]);
  assert.equal((await ask({ type: "next.fit.back", knob: "voice", scope: "dev" })).ok, false, "nothing left to take back");
  assert.deepEqual(readdirSync(join(h, "next")), ["fits.json"]);
});

test("a Back holds the scopes under it too, and what was taken back is not handed back from above", () => {
  const h = home(), why = { reason: "4 of the last 5 build days read this way", count: 4 };
  assert.ok(F.solSet(h, { knob: "build.density", scope: "dev", take: "close", ...why }).ok);
  assert.ok(F.back(h, { knob: "build.density", scope: "dev" }).ok);
  assert.equal(F.solSet(h, { knob: "build.density", scope: "dev/api", take: "close", ...why }).ok, false, "held in dev, so in dev/api");
  assert.equal(F.offer(h, { knob: "build.density", scope: "dev/api/tests", take: "close", ...why }).ok, false);
  const under = F.takeOf(h, "build.density", "dev/api/x");
  assert.deepEqual([under.take, under.author, under.held], [null, "default", true]);
  // Sol's take in dev and in dev/api; the person takes back dev/api's: dev's is not handed back there
  const g = home();
  assert.ok(F.solSet(g, { knob: "build.density", scope: "dev", take: "close", ...why }).ok);
  assert.ok(F.solSet(g, { knob: "build.density", scope: "dev/api", take: "close", ...why }).ok);
  assert.ok(F.back(g, { knob: "build.density", scope: "dev/api" }).ok);
  const api = F.takeOf(g, "build.density", "dev/api/routes");
  assert.deepEqual([api.take, api.held], [null, true]);
  assert.equal(F.takeOf(g, "build.density", "dev/web").take, "close", "the rest of dev keeps Sol's take");
});

test("each take carries its change id and its source when known; a Back names the change it undoes; unknown stays unknown", () => {
  const h = home();
  const a = F.personSet(h, { knob: "voice", scope: "dev", take: "quieter", source: "Settings › Voice" });
  assert.ok(a.ok && a.fit.source === "Settings › Voice" && a.fit.change === a.fit.history[0].id);
  const b = F.solSet(h, { knob: "text.size", scope: "dev", take: "larger", reason: "2 of 2 mornings", count: 2 });
  assert.ok(b.ok && b.fit.source === null, "no source given: none is made up");
  const k = F.back(h, { knob: "voice", scope: "dev" });
  assert.ok(k.ok && k.fit.change === null);
  assert.equal(k.ok && k.fit.history[1].undoes, a.ok && a.fit.change);
});

test("proposed for BR1 (#1615), Frank's word: ~ is All of Sol, found from any place; a session reads itself, then its folder, then ~", () => {
  const h = home();
  assert.deepEqual(F.upward("dev/api"), ["dev/api", "dev", "~"]);
  assert.deepEqual(F.upward("~"), ["~"]);
  assert.equal(F.okScope("~/dev"), false, "~ has nothing under it but folders: ~/dev is refused");
  assert.ok(F.personSet(h, { knob: "size", scope: "~", take: "large" }).ok);
  assert.equal(F.takeOf(h, "size", "dev/api").take, "large", "all of Sol reaches every folder");
  assert.ok(F.personSet(h, { knob: "size", scope: "dev", take: "small" }).ok);
  assert.equal(F.takeOf(h, "size", "dev/api").take, "small", "the nearest scope still wins");
  assert.ok(F.personSet(h, { knob: "size", scope: "session:s1", take: "usual" }).ok);
  assert.equal(F.takeOf(h, "size", "session:s1", undefined, "dev/api").take, "usual");
  assert.equal(F.takeOf(h, "size", "session:s2", undefined, "dev/api").take, "small", "a session with none of its own falls back to its folder");
  assert.equal(F.takeOf(h, "size", "session:s2").take, "large", "with no folder known, to all of Sol");
  const r = F.fitsOf(h, "session:s2", "dev/api");
  assert.ok(r.ok && r.fits.map((f) => f.scope).sort().join() === "dev,~");
  // a Back of all of Sol holds it everywhere: Sol's write in a folder is refused too
  assert.ok(F.back(h, { knob: "size", scope: "~" }).ok);
  assert.equal(F.solSet(h, { knob: "size", scope: "web", take: "large", reason: "3 of 3 mornings", count: 3 }).ok, false);
});

// BR1 item 6 (#1615), builder P: a take kept for a folder reaches a folder the person put inside it, as its facts do
test("a folder Denise nested herself takes its parent's take; the path's parent is the rule only while she said nothing", async () => {
  const P = await import("./pos.js");
  const h = home(), at = (id: string, inn: string | null) => assert.ok(P.setPos(h, { id, x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: inn }).ok);
  assert.ok(F.personSet(h, { knob: "build.density", scope: "h:denise", take: "roomy" }).ok);
  assert.ok(F.personSet(h, { knob: "build.density", scope: "w:/srv/denise/code", take: "close" }).ok);
  assert.equal(F.takeOf(h, "build.density", "h:massage").author, "default", "unnested, massage has none");
  at("h:massage", "h:denise");
  assert.deepEqual([F.takeOf(h, "build.density", "h:massage").take, F.takeOf(h, "build.density", "h:massage").author], ["roomy", "person"]);
  assert.deepEqual(F.chain("session:s1", "h:massage", F.nestedIn(h)), ["session:s1", "h:massage", "h:denise", "~"], "a session reads the folder it works in, then where she put it");
  assert.ok(F.fitsOf(h, "h:massage").ok && (F.fitsOf(h, "h:massage") as { fits: { scope: string }[] }).fits.some((f) => f.scope === "h:denise"));
  // by the path, her site reads the code folder's take; put in Denise, it reads Denise's instead
  assert.equal(F.takeOf(h, "build.density", "w:/srv/denise/code/site").take, "close");
  at("w:/srv/denise/code/site", "h:denise");
  assert.equal(F.takeOf(h, "build.density", "w:/srv/denise/code/site").take, "roomy");
});

test("a take kept by the folder's scope follows the nesting pos.json keeps by its id: home/massage in h:health reads home/health's", async () => {
  const P = await import("./pos.js");
  const h = home(), at = (id: string, inn: string | null) => assert.ok(P.setPos(h, { id, x: 0, y: 0, w: 100, h: 80, by: "person", touched: true, in: inn }).ok);
  assert.ok(F.personSet(h, { knob: "build.density", scope: "home/health", take: "roomy" }).ok);
  assert.equal(F.takeOf(h, "build.density", "home/massage").author, "default", "unnested, massage has none");
  at("h:massage", "h:health");
  assert.deepEqual(F.chain("home/massage", undefined, F.nestedIn(h)), ["home/massage", "home/health", "home", "~"]);
  assert.deepEqual([F.takeOf(h, "build.density", "home/massage").take, F.takeOf(h, "build.density", "home/massage").scope], ["roomy", "home/health"]);
  assert.deepEqual(F.chain("session:s1", "home/massage", F.nestedIn(h)), ["session:s1", "home/massage", "home/health", "home", "~"]);
  assert.ok((F.fitsOf(h, "home/massage") as { fits: { scope: string }[] }).fits.some((f) => f.scope === "home/health"));
  // asked by the id, the answer stays an id, as before
  assert.equal(F.nestedIn(h)("h:massage"), "h:health");
  // a w: folder: Dev's site put in his work folder reads its take, not its disk parent's
  assert.ok(F.personSet(h, { knob: "build.density", scope: "srv/dev/code", take: "close" }).ok);
  assert.ok(F.personSet(h, { knob: "build.density", scope: "srv/dev/work", take: "roomy" }).ok);
  assert.equal(F.takeOf(h, "build.density", "srv/dev/code/site").take, "close");
  at("w:/srv/dev/code/site", "w:/srv/dev/work");
  assert.equal(F.takeOf(h, "build.density", "srv/dev/code/site").take, "roomy");
  at("w:/srv/dev/code/site", null);
  assert.equal(F.takeOf(h, "build.density", "srv/dev/code/site").author, "default", "taken to the top, neither");
});
