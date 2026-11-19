// node --test src/*.test.ts: what the person allowed (#1216, onboard/consent.ts): one consent record in me.json, written
// by whichever surface asks (the one onboarding, Home's level, the first run's switches, the Beta tap's one place) and
// read by every one of them; and the engine's read of it (sol/engine/src/consent.ts), on a made-up person's home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { consentIn, consentOf, heldByRecord, joinMachine, keepPending, levelOf, pendingMachine, tellBeta, withLevel, withMachine, PENDING_KEY } from "./onboard/consent.ts";
import { empty, groundOf, mergeRecords, policyOf, recordOf, type Record as Rec } from "./onboard/record.ts";
import { sortAll, type Explored } from "./onboard/sort.ts";

const NOA = "Second year at Westbrook, design major. I freelance for two clients. Training for a half marathon. Don't read my messages.";
const AT = "2026-11-15T09:00:00.000Z";
const go = { said: "go" as const, at: AT, by: "the one onboarding" };

/** Noa, seeded, read by the explorer, sorted and recorded as the one onboarding does at "this is my Home" (once; each
 *  test gets its own copy of the record) */
let seeded: Promise<{ dir: string; rec: Rec }> | null = null;
const noa = async () => { seeded ??= seed(); const { dir, rec } = await seeded; return { dir, rec: structuredClone(rec) }; };
async function seed() {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "ob1-consent-"));
  const here = new URL("./onboard/", import.meta.url).pathname;
  execFileSync(process.execPath, [join(here, "people/seed.mjs"), "noa", dir]);
  execFileSync(process.execPath, [join(here, "explore.mjs"), "--home", dir, "--out", join(dir, "out.json")]);
  const ex = JSON.parse(readFileSync(join(dir, "out.json"), "utf8")) as Explored;
  const rec: Rec = { ...recordOf("Noa Patel", NOA, ex.stops.flatMap((s) => s.facts), sortAll(NOA, ex), [], ["mail"]), hands: "show", solHome: join(dir, "sol"), built: AT };
  rec.consent = consentOf(rec, null, { agreed: go, levelMoved: false, machine: { microphone: { state: "granted", at: AT } }, at: AT });
  return { dir, rec };
}

test("consent: the one onboarding writes one consent record: the answer and when, the stops left out, the off-limits, a level per folder, the machine", async () => {
  const { rec } = await noa();
  const c = rec.consent!;
  assert.deepEqual(c.agreed, go);
  assert.deepEqual(c.left, ["mail"]);
  assert.deepEqual(c.off, ["messages"]);
  assert.deepEqual(Object.keys(c.levels).sort(), rec.areas.map((a) => a.id).sort());
  assert.ok(rec.areas.length >= 3);
  assert.ok(Object.values(c.levels).every((l) => l === "show"));
  assert.deepEqual(c.machine, { microphone: { state: "granted", at: AT } });
  assert.equal(c.beta, null);
  // one record: the only consent in the file, and it reads back as written
  const text = JSON.stringify(rec);
  assert.equal(text.match(/"consent":/g)?.length, 1);
  assert.deepEqual(consentIn(JSON.parse(text)), c);
});

test("consent: a level pressed in a folder is that folder's alone; pressed in Home it is every folder's; its policy.md follows, ground.json copies no level (#1227)", async () => {
  const { rec } = await noa();
  const [a, b] = rec.areas;
  const one = withLevel(rec, "record", a.id, AT);
  assert.equal(levelOf(one, a.id), "record");
  assert.equal(levelOf(one, b.id), "show");
  assert.equal(one.hands, "show");
  assert.match(policyOf(one, a), /\[watch, read\] stickies/);
  assert.match(policyOf(one, b), /\[watch, propose\] stickies/);
  assert.ok(!("rung" in groundOf(one, a).may), "the level lives in the consent alone (#1227)");
  const all = withLevel(one, "draft", undefined, AT);
  assert.equal(all.hands, "draft");
  assert.ok(all.areas.every((x) => levelOf(all, x.id) === "draft"));
});

test("consent: another run keeps each folder's own level unless the level moved, and never drops what another surface saw", async () => {
  const { rec } = await noa();
  const id = rec.areas[0].id;
  const before = withMachine(withLevel(rec, "record", id, AT), "screen", "denied", "2026-11-15T10:00:00.000Z");
  const told = tellBeta(before, AT);
  assert.deepEqual(told.consent!.beta, { told: AT, by: "the Beta brief" });
  assert.equal(tellBeta(told, "2026-12-01T00:00:00.000Z"), told);   // told once
  const next = { ...rec, consent: consentOf(rec, consentIn(told), { agreed: null, levelMoved: false, at: AT }) };
  assert.equal(next.consent.levels[id], "record");
  assert.deepEqual(next.consent.agreed, go);   // a run with no ask keeps the answer given
  assert.equal(next.consent.machine.screen?.state, "denied");
  assert.equal(consentOf(rec, consentIn(told), { levelMoved: true, at: AT }).levels[id], "show");
  // a record written over one changed since (Home, the first run): the merge keeps the machine and the Beta tap
  const merged = mergeRecords(told, { ...rec, consent: { ...rec.consent!, machine: {} } }, false);
  assert.equal(merged.consent!.machine.screen?.state, "denied");
  assert.deepEqual(merged.consent!.beta, told.consent!.beta);
  assert.deepEqual(joinMachine({ microphone: { state: "denied", at: "2" } }, { microphone: { state: "granted", at: "1" } }).microphone, { state: "denied", at: "2" });
});

test("consent: the first run asks nothing the record holds; a switch seen before there is a record waits in this window", () => {
  assert.deepEqual(heldByRecord(null), { name: null, on: new Set() });
  const rec = withMachine(withMachine({ ...empty(), name: "Noa Patel" }, "microphone", "granted", AT), "screen", "denied", AT);
  const h = heldByRecord(rec);
  assert.equal(h.name, "Noa Patel");
  assert.deepEqual([...h.on], ["microphone"]);
  const kept = new Map<string, string>();
  const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
  keepPending(store, "notifications", "granted", AT);
  keepPending(store, "microphone", "denied", AT);
  assert.deepEqual(Object.keys(pendingMachine(store)).sort(), ["microphone", "notifications"]);
  kept.set(PENDING_KEY, "{ broken");
  assert.deepEqual(pendingMachine(store), {});
  // a record from before #1216: its consent is made from its older parts, every folder at its one level
  const old = consentIn({ ...empty(), hands: "draft", off: ["mail"], skipped: ["calendar"], areas: [{ id: "x", name: "X", part: "life", facts: [] }] });
  assert.deepEqual([old.levels, old.off, old.left], [{ x: "draft" }, ["mail"], ["calendar"]]);
});

test("consent: noa goes ask → Home; one folder set to record only, and the engine reads it from her home and refuses its agent's act by name", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { dir, rec } = await noa();
  const id = rec.areas[0].id;
  const home = withLevel(rec, "record", id, AT);
  mkdirSync(join(dir, ".sol/record"), { recursive: true });
  writeFileSync(join(dir, ".sol/record/me.json"), JSON.stringify(home, null, 2) + "\n");
  for (const a of home.areas) mkdirSync(join(dir, "sol", a.id), { recursive: true });
  // the engine's own reader (no imports past node's own: it runs here as it runs in the engine)
  const engine = await import("../../engine/src/consent.ts");
  assert.deepEqual(engine.levelFor(join(dir, "sol", id), dir), { id, level: "record" });
  assert.deepEqual(engine.levelFor(join(dir, "sol", home.areas[1].id), dir), { id: home.areas[1].id, level: "show" });
  const no = engine.refusalIn(join(dir, "sol", id), dir)!;
  assert.match(no("desk_show")!, /^refused: desk_show\. The person's record \(~\/\.sol\/record\/me\.json, consent\.levels\) sets the folder .+ at record only/);
  assert.equal(no("browser_read"), null);
});
