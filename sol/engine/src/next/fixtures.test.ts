// next/fixtures (#1617 Harmony slice S30): the five persona months and three nights every Harmony slice's test reads.
// make.mjs makes each one again byte-for-byte; the people are the panel's only (docs/marketing/brand/pack/panel.md), never
// a real person's data; each month holds the acts named for its person; the relevance order is port S7's needs.ts rank.
// Signed: franktsai2008-eng's agent, Harmony slice S30 (#1617).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankNeeds } from "./needs.js";
// @ts-expect-error make.mjs is plain JavaScript, kept beside its fixtures
import { FILES, HERE, MONTHS, NAMED, make, needsIn, openAsks, read, relevance } from "./fixtures/make.mjs";

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const engine = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const all = (): { file: string; text: string }[] => FILES.map((file: string) => ({ file, text: readFileSync(join(HERE, file), "utf8") }));

test("make.mjs makes every fixture again byte-for-byte, run as a script and as a module", () => {
  const out = mkdtempSync(join(tmpdir(), "sol-next-fixtures-"));
  dirs.push(out);
  execFileSync(join(engine, "node_modules", ".bin", "tsx"), [join(HERE, "make.mjs"), "--out", out], { cwd: engine, stdio: "pipe" });
  assert.deepEqual(readdirSync(out).sort(), [...FILES].sort());
  const made = make();
  for (const { file, text } of all()) {
    assert.ok(readFileSync(join(out, file)).equals(Buffer.from(text)), `${file}: the script's run differs from the committed file`);
    assert.equal(made[file], text, `${file}: make() differs from the committed file`);
  }
  assert.deepEqual(readdirSync(HERE).filter((f) => f.endsWith(".jsonl")).sort(), [...FILES].sort(), "no fixture the script does not make");
});

test("only the panel's people: no quoted source's name, no address, no path, no key", () => {
  // the real people the panel quotes (panel.md): their words anchor a persona, their names never enter a fixture
  const sources = /doremi|yureki|kyle-reese|\b(Victoria|Livingstone|Shondale|Atkinson|Carlos|Outeiral|Rubiera|Tatsuya|Amano|Myoyoung|Kim|Jessica|Tarriela|Abisoye|Otusanya|Azzan|Taylor|Arndt|Werner|Sarah|Rickwood|Larissa|Suzuki|Zack|Proser)\b/i;
  const panel = new Set(["Maya", "Dev", "Jayden", "Ruth", "Nora", "Denise", "Lucía", "Min-ji", "Joy", "Tomás", "Lucy", "Sam"]);
  for (const { file, text } of all()) {
    assert.doesNotMatch(text, sources, `${file} names a quoted source`);
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/|\/Users\/|\/home\/|sk-[A-Za-z0-9]{8}|ghp_/, `${file} holds an address, a path or a key`);
    const { acts } = read(file);
    for (const a of acts) {
      if (!/^(ai:|sol$)/.test(a.who)) assert.ok(panel.has(a.who), `${file} ${a.id}: ${a.who} is not on the panel`);
      for (const p of a.parts ?? []) if (p.kind === "person") assert.ok(panel.has(p.hands), `${file} ${a.id}: a person part held by ${p.hands}`);
    }
  }
});

test("each month is its panel person's, over 30 days, and holds the acts named for that person", () => {
  for (const name of MONTHS) {
    const { head, acts, ends } = read(`${name}-month.jsonl`);
    assert.equal(head.fixture, `${name}-month`);
    assert.ok(Number.isInteger(head.panel) && head.from[0].startsWith(`panel.md #${head.panel} `), `${name}: from the panel`);
    assert.deepEqual(head.named, NAMED[name]);
    const kinds = new Set(acts.map((a: any) => a.act));
    for (const k of NAMED[name]) assert.ok(kinds.has(k), `${name}-month holds no ${k}`);
    assert.ok(acts.every((a: any) => a.day >= 1 && a.day <= 30), `${name}: days 1 to 30`);
    assert.ok(acts.every((a: any, i: number) => i === 0 || acts[i - 1].at <= a.at), `${name}: in time order`);
    assert.equal(new Set(acts.map((a: any) => a.id)).size, acts.length, `${name}: one id per act`);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].acts, acts.length);
  }
});

test("what the slices' checks lean on is there", () => {
  const dev = read("dev-month.jsonl").acts, kinds = (as: any[], k: string) => as.filter((a) => a.act === k);
  // S13: a piece split into a sticky part and session parts; both seats' plans, as each seat writes them; an undo of a split
  assert.ok(kinds(dev, "piece.split").some((a) => a.parts.some((p: any) => p.kind === "sticky") && a.parts.some((p: any) => p.kind === "session")));
  assert.ok(kinds(dev, "plan").some((a) => Array.isArray(a.todos)) && kinds(dev, "plan").some((a) => Array.isArray(a.plan)));
  const splits = new Set(kinds(dev, "piece.split").map((a) => a.id));
  assert.ok(kinds(dev, "undo").every((a) => splits.has(a.of)));
  // S13: runs point at parts that exist; the state line is the lead's
  const parts = new Set(kinds(dev, "piece.split").flatMap((a) => a.parts.map((p: any) => p.id)));
  assert.ok(kinds(dev, "run.start").every((a) => parts.has(a.part)));
  const lead = new Map(kinds(dev, "piece.lead").map((a) => [a.piece, a.ai]));
  assert.ok(kinds(dev, "piece.state").every((a) => lead.get(a.piece) === a.who));
  // S22: a person part in Min-ji's launch; S28: a way made and given
  const minji = read("minji-month.jsonl").acts;
  assert.ok(kinds(minji, "piece.split").some((a) => a.parts.some((p: any) => p.kind === "person")));
  assert.ok(kinds(minji, "way.give").every((g) => kinds(minji, "way.make").some((m) => m.way === g.way && m.at <= g.at)));
  // S15: a Sol fit backed by Tomás; S24: the four kinds of upkeep, one blocked, an update before each finding about it
  const tomas = read("tomas-month.jsonl").acts;
  assert.ok(kinds(tomas, "fit.set").some((f) => f.author === "sol" && kinds(tomas, "fit.back").some((b) => b.knob === f.knob && b.scope === f.scope && b.at > f.at)));
  assert.deepEqual([...new Set(kinds(tomas, "upkeep").map((a) => a.kind))].sort(), ["adaptive", "corrective", "perfective", "preventive"]);
  assert.ok(kinds(tomas, "upkeep").some((a) => a.blocked));
  // S16: weekly structure offers, at most one per mode a week, every one answered by the person
  for (const name of MONTHS) {
    const as = read(`${name}-month.jsonl`).acts, offers = kinds(as, "offer").filter((a) => a.structural);
    const weeks = offers.map((o) => `${o.mode}:${Math.floor((o.day - 1) / 7)}`);
    assert.equal(new Set(weeks).size, weeks.length, `${name}: one structural offer per mode a week`);
    for (const o of offers) assert.ok(as.some((a) => (a.act === "keep" || a.act === "notnow") && a.offer === o.offer && a.who !== "sol"), `${name}: ${o.offer} answered by the person`);
    const declined = new Set(kinds(as, "notnow").map((n) => offers.find((o) => o.offer === n.offer)).filter(Boolean).map((o) => `${o.knob}@${o.scope}@${o.day}`));
    for (const d of declined) { const [knob, scope, day] = d.split("@"); assert.ok(!offers.some((o) => o.knob === knob && o.scope === scope && o.day > Number(day)), `${name}: ${knob} offered again after a Not now`); }
    // S15: every fit Sol writes has a reason with a count from the person's history
    for (const f of kinds(as, "fit.set").filter((a) => a.author === "sol")) assert.ok(typeof f.reason === "string" && Number.isInteger(f.count) && f.count > 0, `${name} ${f.id}: a Sol fit with a reason and a count`);
  }
  // S18/S29: 50 off-limits facts in Denise's scope, every fact with a source, one fact replaced (stale ground)
  const denise = read("denise-month.jsonl").acts;
  assert.equal(kinds(denise, "fact").filter((f) => f.offLimits).length, 50);
  for (const name of MONTHS) assert.ok(kinds(read(`${name}-month.jsonl`).acts, "fact").every((f) => typeof f.source === "string" && f.source));
  assert.ok(kinds(denise, "fact").some((f) => f.replaces));
  // S20: Dev's plan use rises toward the limit; a seat Sol cannot price reports none
  const usage = kinds(dev, "usage");
  assert.ok(usage.some((u) => u.seat === "claude" && u.used / u.of >= 0.9) && usage.some((u) => u.used === null));
});

test("Lucy's month is the demand before any gate: the same asks a day in both halves, so only S21's gate can lower them", () => {
  const { acts } = read("lucy-month.jsonl");
  assert.equal(acts.find((a: any) => a.act === "fit.set")?.take, "only what needs me today");
  const span = (lo: number, hi: number) => ({ asks: acts.filter((a: any) => a.act === "ask" && a.day >= lo && a.day <= hi).length, done: acts.filter((a: any) => a.act === "done" && a.day >= lo && a.day <= hi).length });
  const early = span(1, 15), late = span(16, 30);
  assert.equal(early.asks, late.asks, "asks are not already lower in days 16–30");
  assert.ok(Math.abs(late.done - early.done) <= 3, `finished pieces steady: ${early.done} then ${late.done}`);
  for (let day = 1; day <= 30; day++) {
    const asks = acts.filter((a: any) => a.act === "ask" && a.day === day);
    assert.equal(asks.filter((a: any) => a.blocking).length, 1, `day ${day}: one blocking ask`);
    assert.ok(asks.every((a: any) => acts.some((r: any) => r.act === "run.start" && r.run === a.run && r.at < a.at)), `day ${day}: every ask comes from a run`);
  }
  assert.ok(acts.some((a: any) => a.act === "run.start" && a.likelyToAsk) && acts.some((a: any) => a.act === "pause"));
});

test("the three nights hold 3, 40 and 400 acts; on the 400 night one lapsed sign-in stops 12 runs", () => {
  const { acts, ends } = read("nights-3-40-400.jsonl");
  assert.deepEqual(ends.map((e: any) => [e.end, e.acts]), [["3", 3], ["40", 40], ["400", 400]]);
  for (const n of ["3", "40", "400"]) assert.equal(acts.filter((a: any) => a.night === n).length, Number(n));
  const lapsed = openAsks(acts.filter((a: any) => a.night === "400")).filter((a: any) => a.cause === "signin:claude");
  assert.equal(lapsed.length, 12);
  assert.equal(new Set(lapsed.map((a: any) => a.run)).size, 12, "12 different runs");
});

test("the relevance order is port S7's needs.ts rank of each place, then its count of acts", () => {
  const files: [string, string, (a: any) => boolean][] = [
    ...MONTHS.map((m: string): [string, string, (a: any) => boolean] => [`${m}-month.jsonl`, "month", () => true]),
    ...["3", "40", "400"].map((n): [string, string, (a: any) => boolean] => ["nights-3-40-400.jsonl", n, (a) => a.night === n]),
  ];
  for (const [file, end, mine] of files) {
    const { acts: everyAct, ends } = read(file), acts = everyAct.filter(mine), line = ends.find((e: any) => e.end === end);
    assert.deepEqual(line.open, openAsks(acts).map((a: any) => a.ask), `${file} ${end}: the open asks`);
    assert.deepEqual(line.order, relevance(acts, rankNeeds), `${file} ${end}: the order is the rank's`);
    // read back by hand: each place's best rank among the needs open on it, in rankNeeds' own list
    const ranked = rankNeeds(needsIn(acts)), best = new Map<string, number>();
    for (const n of ranked) {
      const ask = openAsks(acts).find((a: any) => (a.need.src === "perm" ? `p:${a.need.sessionId}:${a.need.item.id}` : a.need.src === "thing" ? `t:${a.need.id}` : a.need.src === "stage" ? `s:${a.need.project}/${a.need.id}` : `d:${a.need.folder}:${a.need.sticky}`) === n.id);
      assert.ok(ask, `${file} ${end}: ${n.id} comes from an open ask`);
      if (!best.has(ask.place)) best.set(ask.place, n.rank);
    }
    const ranks = line.order.map((p: string) => best.get(p) ?? Infinity);
    assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y), `${file} ${end}: places by rank`);
    const count = (p: string) => acts.filter((a: any) => a.place === p).length;
    for (let i = 1; i < line.order.length; i++) if (ranks[i] === ranks[i - 1]) assert.ok(count(line.order[i - 1]) >= count(line.order[i]), `${file} ${end}: same rank, more acts first`);
  }
  // the serious clash on Dev's last night leads his month; a permission (3) comes before a dated Thing (4)
  const dev = read("dev-month.jsonl");
  const top = rankNeeds(needsIn(dev.acts))[0];
  assert.equal(top.rank, 1);
  assert.equal(dev.ends[0].order[0], openAsks(dev.acts).find((a: any) => a.need.serious)?.place);
});
