// Cowork ways, step 4c (docs/cowork-ways-2026-11-10/reports/step4-plan.md §6): a person's own ways on the kernel's
// own log, on a real log (log.ts dayTrail) in a temp folder. Frank's way of his own drafts: proposed, agreed, applied,
// pressed and turned on his own log, read back as his and his NucBox's; the kept read always the read from nothing.
// Nothing leaves this test's temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayTrail, readLog, valueFile, type LogEv, type LogPort } from "../src/log.ts";
import { AUTO, forgetOwn, ownPress, ownTurns, ownVersion, ownWaysOn, ownWho, readOwn, readOwnFresh, type OwnDoor, type OwnSol } from "../src/way-own.ts";
import { WayFiles } from "../src/team/v3/way-files.ts";
import { load } from "../src/way/load.ts";
import { place } from "../src/way/fold.ts";
import { OWN, type Answers } from "../src/way/types.ts";
import { canonical } from "../src/canonical.ts";
import { DRAFTS_WAY } from "./fixtures/sol-drafts-way.ts";

const dir = mkdtempSync(join(tmpdir(), "sol-way-own-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const WAY = "sol.drafts";
// Frank's own copy of the drafts' way: he holds both roles, his NucBox runs it
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`).replaceAll('"person:marco"', '"person:frank"'));
const L = load(FILE);
const T = (m: number) => Date.UTC(2026, 10, 13, 14, 0) + m * 60_000;
const DAY = 1440;
const ALL5: Answers = { "contract.written": { pass: true }, "undo.works": { pass: true }, "data.ok": { pass: true }, "gate.green": { pass: true }, "used.enough": { pass: true } };
let count = 0;
/** the kernel's door as kernel.ts append() writes (its `via` and `at` from `more`), over a log */
const doorOf = (log: LogPort): OwnDoor => ({ append: (kind, item, value, by, more) => log.append({ by, kind, ...(item !== undefined ? { item } : {}), ...(value !== undefined ? { value } : {}), ...more }) });
const sol = (machine = "nucbox"): OwnSol & { d: string; log: LogPort } => {
  const d = join(dir, `${machine}-${++count}`), log = dayTrail(join(d, "log"));
  return { d, log, door: doorOf(log), files: new WayFiles(join(d, "ways")), machine };
};
const at = (m: number) => () => T(m);
/** the kept read held against the read from nothing, and against a log opened again on the same folder */
const same = (s: ReturnType<typeof sol>, label: string) => {
  const kept = readOwn(s.log);
  assert.equal(canonical({ ways: [...kept.ways], dropped: kept.dropped }), canonical({ ways: [...readOwnFresh(s.log).ways], dropped: readOwnFresh(s.log).dropped }), label);
  const again = readOwnFresh(dayTrail(join(s.d, "log")));
  assert.equal(canonical([...kept.ways]), canonical([...again.ways]), `${label}: the log opened again`);
  return kept;
};
const lines = (s: ReturnType<typeof sol>) => readLog(join(s.d, "log")) as LogEv[];
/** Frank's way, started on his own log */
function started() {
  const s = sol();
  assert.equal(ownVersion(s, WAY, "frank", { kind: "propose", file: FILE }, at(0)).ok, true);
  for (const [i, role] of ["explorer", "keeper"].entries()) assert.equal(ownVersion(s, WAY, "frank", { kind: "agree", to: L.ver, role }, at(1 + i)).ok, true);
  assert.equal(ownVersion(s, WAY, "frank", { kind: "apply", to: L.ver }, at(5)).ok, true);
  return s;
}
const fold = (s: ReturnType<typeof sol>, now: number) => place(WAY, readOwn(s.log).ways.get(WAY) ?? [], (v) => s.files.get(v), OWN, { now }).p;

test("4c own: the switch is the frame's and the ways' together; the ways' on by default (#691), the frame's off", () => {
  const was = { w: process.env.SOL_COWORK_WAYS, f: process.env.SOL_FRAME };
  try {
    delete process.env.SOL_COWORK_WAYS; process.env.SOL_FRAME = "off";
    assert.equal(ownWaysOn(), false);
    process.env.SOL_COWORK_WAYS = "off"; process.env.SOL_FRAME = "on";
    assert.equal(ownWaysOn(), false);
    delete process.env.SOL_COWORK_WAYS;
    assert.equal(ownWaysOn(), true);
  } finally {
    if (was.w === undefined) delete process.env.SOL_COWORK_WAYS; else process.env.SOL_COWORK_WAYS = was.w;
    if (was.f === undefined) delete process.env.SOL_FRAME; else process.env.SOL_FRAME = was.f;
  }
});

test("4c own: a way proposed, agreed and applied on one's own log is in force; its file is kept here, the log carries its name only", () => {
  const s = started();
  assert.equal(fold(s, T(6)).ver, L.ver);
  assert.ok(s.files.get(L.ver), "the file kept here");
  const proposed = lines(s).find((e) => e.kind === "way.proposed")!;
  assert.deepEqual([proposed.item, proposed.by, (proposed.value as { from: string }).from], [L.ver, { person: "frank", machine: "nucbox" }, ""]);
  assert.ok(!lines(s).some((e) => e.kind === "wayfile"), "no file on the log");
  same(s, "started");
});

test("4c own: a press is written as the person, a check names its seam's plugin as `via`, a note's words go to a value file, `cause` is what `because` says; the runner's turn is signed `auto`, read as the machine's; an agent's press as the agent's", () => {
  const s = started();
  const make = ownPress(s, WAY, { person: "frank" }, { thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } }, at(10));
  assert.equal(make.ok, true, make.why);
  same(s, "made");
  const want = ownPress(s, WAY, { person: "frank", agent: "helper" }, { thing: "d1", move: "want" }, at(11));
  assert.equal(want.why, "not_allowed", "his agent holds no role of his way");
  assert.deepEqual(want.written.map((w) => w.kind), ["way.refused"], "nothing written for a refused press but its refusal");
  assert.equal(lines(s).find((e) => e.id === want.written[0].id)?.by.agent, "helper");
  assert.equal(ownPress(s, WAY, { person: "frank" }, { thing: "d1", move: "want" }, at(12)).ok, true);
  const promote = ownPress(s, WAY, { person: "frank" }, { thing: "d1", move: "promote" }, at(13), ALL5);
  assert.equal(promote.ok, true, promote.why);
  assert.equal(fold(s, T(14)).things.d1.state, "official");
  const log = lines(s), byId = new Map(log.map((e) => [e.id, e]));
  const checks = log.filter((e) => e.kind === "way.checked");
  assert.equal(checks.length, 5);
  for (const c of checks) assert.deepEqual(c.via, { plugin: FILE.seams[(c.value as { seam: string }).seam].plugin, pv: 1, pkg: `sha256:${"0123456789abcdef".repeat(4)}` });
  for (const e of log.filter((x) => x.kind.startsWith("way.") && x.cause)) assert.equal((e.value as { because?: string }).because, e.cause, `${e.kind}: cause is because`);
  const note = log.find((e) => e.kind === "way.note")!;
  assert.ok(existsSync(valueFile(join(s.d, "log"), note.hash)), "the words in a value file");
  assert.ok(byId.size > 0);
  same(s, "promoted");

  // a second draft, left alone: three weeks on, Frank's NucBox drops it (the trigger `expire`), owing the act switch.off
  assert.equal(ownPress(s, WAY, { person: "frank" }, { thing: "d2", kind: "draft", move: "make", set: { title: "Old idea", switch: "idea" } }, at(20)).ok, true);
  const turns = ownTurns(s, "frank", at(23 * DAY));
  assert.equal(turns.length, 1);
  const t = turns[0];
  assert.equal(t.ok, true, t.why);
  assert.deepEqual(t.written.map((w) => w.kind), ["way.fired", "way.fired", "way.move"], "the reminder's firing (born 14 days ago), then the expiry's and its move");
  assert.deepEqual(t.pings.map((x) => [x.role, x.trigger, x.thing]), [["explorer", "remind", "d2"]]);
  assert.deepEqual(t.acts.map((a) => [a.seam, a.thing]), [["switch.off", "d2"]]);
  const auto = lines(s).filter((e) => e.field === AUTO);
  assert.deepEqual(auto.map((e) => ownWho(e)), ["machine:nucbox@frank", "machine:nucbox@frank", "machine:nucbox@frank"]);
  assert.equal(fold(s, T(23 * DAY)).things.d2.state, "to_remove");
  assert.deepEqual(ownTurns(s, "frank", at(23 * DAY + 1)).map((x) => x.written.length), [0], "nothing due twice");
  same(s, "turned");
  // another machine of Frank's, or another login, is not this way's runner
  assert.deepEqual(ownTurns({ ...s, machine: "macbook" }, "frank", at(24 * DAY)), []);
  assert.deepEqual(ownTurns(s, "marco", at(24 * DAY)), []);
});

test("4c own: a change the fold would set aside is not written, and says why; a proposal of another way or of the version in force is refused", () => {
  const s = sol();
  assert.equal(ownVersion(s, WAY, "frank", { kind: "apply", to: L.ver }, at(0)).why, "no_file");
  assert.equal(ownVersion(s, WAY, "frank", { kind: "propose", file: FILE }, at(0)).ok, true);
  assert.equal(ownVersion(s, WAY, "frank", { kind: "apply", to: L.ver }, at(1)).why, "not_agreed");
  assert.equal(ownVersion(s, WAY, "frank", { kind: "agree", to: L.ver, role: "explorer" }, at(2)).ok, true);
  const marco = ownVersion(s, WAY, "marco", { kind: "agree", to: L.ver, role: "keeper" }, at(3));
  assert.deepEqual([marco.ok, marco.written], [false, []], `someone the way does not name agrees to nothing: ${marco.why}`);
  assert.equal(ownVersion(s, WAY, "frank", { kind: "apply", to: L.ver }, at(4)).why, "not_agreed");
  assert.equal(ownVersion(s, "sol.other", "frank", { kind: "propose", file: FILE }, at(5)).why, "other_way");
  assert.equal(ownVersion(s, WAY, "frank", { kind: "propose", file: { way: 1 } }, at(5)).why, "way_unread");
  assert.equal(ownVersion(s, WAY, "not a login", { kind: "agree", to: L.ver, role: "keeper" }, at(5)).why, "not_in_project");
  assert.equal(lines(s).filter((e) => e.kind === "way.applied").length, 0);
  assert.equal(ownVersion(s, WAY, "frank", { kind: "agree", to: L.ver, role: "keeper" }, at(6)).ok, true);
  assert.equal(ownVersion(s, WAY, "frank", { kind: "apply", to: L.ver }, at(7)).ok, true);
  assert.equal(ownVersion(s, WAY, "frank", { kind: "propose", file: FILE }, at(8)).why, "same_version");
  same(s, "refusals");
});

test("4c own: the kept read is the read from nothing after every write and after an erase (the note's words gone, in every way's list where it stood), and after the log is opened again", () => {
  forgetOwn();
  const s = started();
  ownVersion(s, "sol.other", "frank", { kind: "agree", to: L.ver, role: "keeper" }, at(6));   // a second way's list
  same(s, "two ways");
  assert.equal(ownPress(s, WAY, { person: "frank" }, { thing: "d1", kind: "draft", move: "make", set: { title: "Secret", switch: "s1" } }, at(10)).ok, true);
  const note = lines(s).find((e) => e.kind === "way.note")!;
  assert.equal((same(s, "a note").ways.get(WAY)!.find((e) => e.id === note.id)!.value as { words: string }).words, "Secret");
  s.log.erase(note.id, { person: "frank" });
  const r = same(s, "erased");
  for (const [w, l] of r.ways) assert.deepEqual(l.filter((e) => e.id === note.id).map((e) => [e.erased, e.value]), [[true, undefined]], w);
  assert.equal(fold(s, T(11)).things.d1.fields.title, undefined, "the field goes with the words");
  // a line of a newer build's kind, put on the log by hand: dropped and named, never guessed
  const day = s.log.files().at(-1)!;
  const last = lines(s).at(-1)!;
  writeFileSync(day, readFileSync(day, "utf8") + JSON.stringify({ ...last, kind: "way.later", seq: last.seq + 1, id: "f".repeat(64), prev: last.id }) + "\n");
  const fresh = readOwnFresh(dayTrail(join(s.d, "log")));
  assert.deepEqual(fresh.dropped, [{ id: "f".repeat(64), why: "unread" }]);
});

test("4c own: what readOwn hands out is shared, so frozen", () => {
  const s = started();
  const r = readOwn(s.log), l = r.ways.get(WAY)!;
  assert.throws(() => (l as unknown[]).push({}));
  assert.throws(() => { (l[0] as { at: number }).at = 0; });
  assert.throws(() => (r.dropped as unknown[]).push({}));
});

test("4c own, the nineteenth review: an erase line takes only a content that was in a value file (F1); a version counts only when the log carries its proposal, and a proposal not written keeps no file (F2); a line naming no writer is dropped and named in both reads (F3); values are copies, frozen (F4)", () => {
  const s = started();
  // F1: a log.erase naming the apply, its content on its line: the log never erases it, nor does the read
  const apply = lines(s).find((e) => e.kind === "way.applied")!;
  s.log.append({ by: { person: "engine" }, kind: "log.erase", item: apply.id, value: { hash: apply.hash } });
  assert.equal(fold(s, T(6)).ver, L.ver, "still in force");
  same(s, "an erase line of a fact");
  // F2: a file this Sol keeps from elsewhere is no version of its own way; a proposal the log refuses keeps no file
  const other = structuredClone(FILE); other.name = "elsewhere";
  const lo = load(other);
  s.files.keep([{ ver: lo.ver, file: other }]);
  assert.equal(ownVersion(s, WAY, "frank", { kind: "agree", to: lo.ver, role: "keeper" }, at(7)).why, "no_file");
  const full = { ...s, door: { append: () => { throw new Error("disk full"); } }, files: new WayFiles(join(s.d, "ways-2")) } as OwnSol;
  const third = structuredClone(FILE); third.name = "third";
  const p3 = ownVersion(full, WAY, "frank", { kind: "propose", file: third }, at(8));
  assert.deepEqual([p3.ok, p3.why, full.files.get(load(third).ver)], [false, "not_written_whole", undefined]);
  // F3: a way line that names no writer, put on the log by hand
  const day = s.log.files().at(-1)!, last = lines(s).at(-1)!;
  writeFileSync(day, readFileSync(day, "utf8") + JSON.stringify({ v: 1, project: "home", kind: "way.agreed", hash: "", at: T(9), prev: last.id, id: "e".repeat(64), seq: last.seq + 1 }) + "\n");
  const reopened = dayTrail(join(s.d, "log"));
  assert.deepEqual(readOwnFresh(reopened).dropped, [{ id: "e".repeat(64), why: "no_writer" }]);
  assert.deepEqual(readOwn(reopened).dropped, [{ id: "e".repeat(64), why: "no_writer" }]);
  // F4: the value handed out is a copy, frozen: the log's own event is never changed through it
  const r = readOwn(s.log), e = r.ways.get(WAY)!.find((x) => x.kind === "way.applied")!;
  assert.throws(() => { (e.value as Record<string, unknown>).from = "tampered"; });
  assert.equal((s.log.since("home", 0).find((x) => x.id === apply.id)!.value as { from: string }).from, "");
});
