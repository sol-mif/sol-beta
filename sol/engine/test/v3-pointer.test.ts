// The two books (the v2 backend design §6.4, step C1, #724): an action in a Cowork project is kept in the team trail
// only, and the local log gets one `team.pointer` line that points at it (team/v3/pointer.ts). Through both doors a
// local write takes (door.ts append, index.ts team.v3.append), never for what a teammate's Sol sent (Trail.merge), and
// only with its switch (SOL_COWORK_V3_POINTER) and the frame both on. A real kernel on the test's own home and log
// folder; the trail and keys under the test's own state. Nothing leaves the machine.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-v3-pointer-")));
const ME = "marcocyl04-ux";
process.env.SOL_STATE = join(root, "state", "work.json");
process.env.SOL_TEAM = join(root, "team.json");
process.env.SOL_HOME = join(root, "home");
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
process.env.SOL_COWORK_V3 = "on";
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: ME, name: "Marco" }, rooms: [{ id: "lab", name: "Physics Lab", provider: "github", org: "sol-mif", repos: [] }] }));

const { syncKernel, kernelNow } = await import("../src/kernel.ts");
const { readLog } = await import("../src/log.ts");
const { v3, answerV3, Trail, Keys } = await import("../src/team/v3/index.ts");
const { door } = await import("../src/team/v3/door.ts");
const { POINTER_ENV, pointerOn } = await import("../src/team/v3/pointer.ts");
const { kindRow, placeOf } = await import("../src/contract/kinds.ts");

const LOG = process.env.SOL_LOGDIR!;
const home = join(root, "home");
mkdirSync(join(home, "things"), { recursive: true });
after(async () => { await syncKernel(home, false); v3().trail.close(); rmSync(root, { recursive: true, force: true }); });

type Line = { seq: number; kind: string; item?: string; value?: unknown; by: unknown };
const log = (): Line[] => (existsSync(LOG) ? (readLog(LOG) as Line[]) : []);
/** the lines written while f ran */
async function during(f: () => unknown | Promise<unknown>): Promise<Line[]> {
  const before = log().length;
  await f();
  return log().slice(before);
}
/** every byte under a folder, as one text */
const everything = (d: string): string => !existsSync(d) ? "" : readdirSync(d).map((x) => { const p = join(d, x); return statSync(p).isDirectory() ? everything(p) : readFileSync(p, "utf8"); }).join("\n");
const switchTo = (on: boolean) => { process.env[POINTER_ENV] = on ? "on" : "off"; };
let n = 0;
/** a write as a slice makes it, through the door, with content that is nowhere else */
const write = (content = `the lab sheet, ${++n}`) => door().append({ project: "lab", by: { person: ME }, kind: "item", item: `it-${n}`, value: { title: content } });

test("6. the frame off (no kernel): a write to the trail with the switch on throws nothing and makes no log folder", async () => {
  switchTo(true);
  assert.equal(kernelNow(), null);
  const e = write();
  const r = await answerV3({ type: "team.v3.append", rid: 1, project: "lab", kind: "item", item: "x-1", value: { title: "off" } }, ME);
  assert.ok(e.id && (r.event as { id: string }).id, "both writes are on the trail");
  assert.equal(existsSync(LOG), false, "no log folder");
  switchTo(false);
});

test("the switch is on unless SOL_COWORK_V3_POINTER says off; its kind is registered, its value fits on the line", () => {
  delete process.env[POINTER_ENV];
  assert.equal(pointerOn(), true, "on by default (#691)");
  for (const on of ["on", "1", "true", " ON ", "", "yes"]) { process.env[POINTER_ENV] = on; assert.equal(pointerOn(), true, on); }
  for (const off of ["off", "0", "false", " OFF "]) { process.env[POINTER_ENV] = off; assert.equal(pointerOn(), false, off); }
  switchTo(false);
  const row = kindRow("team.pointer");
  assert.ok(row, "team.pointer has its row in contract/kinds.ts");
  assert.deepEqual([row.family, row.who, row.carries, row.hear], ["team", "shell", { project: "name", kind: "name" }, undefined], "written by the shell, never handed to a block");
  assert.equal(placeOf("team.pointer", { project: "lab", kind: "item" }), "line", "no free text: on the day's line, no value file");
});

test("1, 2, 7. the switch and the frame on: one write through the door, one pointer line; it points at the trail's event and carries nothing else", async () => {
  await syncKernel(home, true);
  assert.ok(kernelNow(), "the frame is on");
  switchTo(true);
  const secret = "Marco's private note about the lab, 7f3a";
  const values = () => (existsSync(join(LOG, "values")) ? readdirSync(join(LOG, "values")).sort() : []);
  const valuesBefore = values();
  let e!: ReturnType<typeof write>;
  const got = await during(() => { e = write(secret); });
  assert.equal(got.length, 1, `the log gained exactly one line: ${JSON.stringify(got)}`);
  const p = got[0];
  assert.equal(p.kind, "team.pointer");
  assert.equal(p.item, e.id, "its item is the trail event's id");
  // 2: the value is { project, kind } and nothing else; the content is nowhere on the log, its old place or a value file
  assert.deepEqual(Object.keys(p.value as object).sort(), ["kind", "project"]);
  assert.deepEqual(p.value, { project: "lab", kind: "item" });
  assert.deepEqual(p.by, { person: "person" });
  assert.equal(everything(LOG).includes(secret), false, "the content is not in the log folder");
  assert.equal(everything(join(home, "log")).includes(secret), false, "nor at the old place");
  assert.deepEqual(values(), valuesBefore, "no value file was made: the pointer is all on its line");
  assert.ok("value" in (JSON.parse(readFileSync(join(LOG, readdirSync(LOG).filter((f) => f.endsWith(".jsonl")).sort().pop()!), "utf8").trim().split("\n").pop()!) as object));
  // 7: the pointer really points
  const at = v3().trail.get(p.item!);
  assert.ok(at, "trail.get finds the event");
  assert.equal(at.id, e.id);
  assert.equal(at.project, (p.value as { project: string }).project);
  assert.equal(at.kind, (p.value as { kind: string }).kind);
  assert.equal((at.value as { title: string }).title, secret, "the content is in the team trail, the one book that keeps it");
  switchTo(false);
});

test("the other door: team.v3.append from the face writes one pointer line too, an agent's write said as the agent's", async () => {
  switchTo(true);
  let r!: Record<string, unknown>;
  const got = await during(async () => { r = await answerV3({ type: "team.v3.append", rid: 2, project: "lab", kind: "loose", item: "l-1", value: { text: "a poll card" }, agent: "claude" }, ME); });
  const ev = r.event as { id: string; project: string; kind: string };
  assert.ok(ev?.id, JSON.stringify(r));
  assert.deepEqual(got.map((l) => [l.kind, l.item, l.value, l.by]), [["team.pointer", ev.id, { project: "lab", kind: "loose" }, { person: "person", agent: "claude" }]]);
  assert.ok(v3().trail.get(got[0].item!));
  switchTo(false);
});

test("3. three writes, three pointer lines, in their order", async () => {
  switchTo(true);
  const ids: string[] = [];
  const got = await during(async () => {
    ids.push(write().id);
    ids.push(((await answerV3({ type: "team.v3.append", rid: 3, project: "lab", kind: "item", item: "it-x", value: { title: "second" } }, ME)).event as { id: string }).id);
    ids.push(write().id);
  });
  assert.deepEqual(got.map((l) => l.kind), ["team.pointer", "team.pointer", "team.pointer"]);
  assert.deepEqual(got.map((l) => l.item), ids);
  assert.ok(got[0].seq < got[1].seq && got[1].seq < got[2].seq);
  switchTo(false);
});

test("4. what came from a teammate's Sol (Trail.merge) gets no pointer line", async () => {
  switchTo(true);
  const frank = new Trail({ file: ":memory:", keys: new Keys(join(root, "frank-keys"), "frank-mac") });
  const theirs = [
    frank.append({ project: "lab", by: { person: "franktsai2008-eng", machine: "frank-mac" }, kind: "item", item: "f-1", value: { title: "from Frank" } }),
    frank.append({ project: "lab", by: { person: "franktsai2008-eng", machine: "frank-mac" }, kind: "item", item: "f-1", field: "due", value: "2026-11-12" }),
  ];
  let added = 0;
  const got = await during(() => { added = v3().trail.merge(theirs).added.length; });
  assert.equal(added, 2, "the trail took both");
  assert.deepEqual(got, [], "the log took none");
  frank.close();
  switchTo(false);
});

test("5. the switch off: writes through both doors put no new line on the log", async () => {
  switchTo(false);
  const got = await during(async () => {
    write();
    await answerV3({ type: "team.v3.append", rid: 5, project: "lab", kind: "item", item: "it-off", value: { title: "off" } }, ME);
  });
  assert.deepEqual(got, []);
});

test("a pointer that cannot be written never undoes the trail's write", async () => {
  switchTo(true);
  const k = kernelNow()!;
  const was = k.append.bind(k);
  const err = console.error;
  const said: string[] = [];
  k.append = (() => { throw new Error("the disk is full"); }) as typeof k.append;
  console.error = (...a: unknown[]) => { said.push(a.join(" ")); };
  try {
    const e = write();
    assert.ok(v3().trail.get(e.id), "the event is on the trail");
    assert.ok(said.some((s) => /the log: the disk is full/.test(s)), "and the trouble is said");
  } finally { k.append = was; console.error = err; switchTo(false); }
});
