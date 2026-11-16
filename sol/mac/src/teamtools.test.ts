// node --test src/*.test.ts (npm test here): team tools' pure parts (#436, cowork/teamtools/tool.ts). A team tool is a
// block of kind "tool" whose `with` names its page, what it reads and from where, its owner and the members gate; Sol's
// own project tools are none. This week's nights said in a line and its days headed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teamToolOf, teamToolLine, gateWord, featuresOf, featuresLine, placeOf, rowOf, builtGroups, foldsOf, weekLine, dayHead, analyticsOf, analyticsLine, compact, md, releaseWord, onNewest, liveOf, liveLine, devWord } from "./cowork/teamtools/tool.ts";
import type { Block } from "./cowork/blocks/live.ts";

const OWN: Block[] = JSON.parse(readFileSync(new URL("./cowork/blocks/blocks.json", import.meta.url), "utf8")).blocks;

test("blocks.json: this week's nights, analytics, features and live are the team tools, members only, saying what they read and from where", () => {
  assert.deepEqual(OWN.filter((b) => teamToolOf(b)).map((b) => b.id), ["folds", "analytics", "features", "live"]);
  const t = teamToolOf(OWN.find((b) => b.id === "folds")!)!;
  assert.equal(t.gate, "members");
  assert.ok(t.reads.every((r) => r.what && r.from));
  assert.match(teamToolLine(t), /^members only · reads the review session's words/);
  const words = (({ name, shows, with: w }: any) => JSON.stringify([name, shows, w?.reads]))(OWN.find((b) => b.id === "folds"));
  assert.doesNotMatch(words, /\bfold(ed|s)?\b|passed to beta/);   // #477: the night's words on screen, never "fold"
  assert.equal(teamToolOf({ kind: "tool", with: { page: "x", reads: [], owner: "a", gate: "members" } }), null);
  assert.equal(teamToolOf({ kind: "tool", with: { page: "x", reads: [{ what: "a", from: "b" }], owner: "a", gate: "anyone" } }), null);
});

test("the week in a line, its days headed, a bad answer refused", () => {
  const c = { folded: 3, rechecked: 1, "sent-back": 2, broke: 0, passed: 1, held: 0, landed: 1 };
  assert.equal(weekLine({ counts: c }), "4 into dev · 2 sent back · into beta once · 1 landed outside the review");
  assert.equal(weekLine({ counts: { folded: 0, rechecked: 0, "sent-back": 0, broke: 0, passed: 0, held: 2, landed: 0 } }), "held 2 times");
  assert.equal(weekLine({ counts: { folded: 0, rechecked: 0, "sent-back": 0, broke: 0, passed: 0, held: 0, landed: 0 } }), "nothing went in yet this week");
  assert.equal(dayHead("2026-10-30", "2026-10-30"), "today");
  assert.equal(dayHead("2026-10-29", "2026-10-30"), "yesterday");
  assert.equal(dayHead("2026-10-27", "2026-10-30"), "tue 10/27");
  assert.equal(foldsOf(null), null);
  assert.equal(foldsOf({ since: "2026-10-26" }), null);
  assert.ok(foldsOf({ since: "2026-10-26", zone: "", days: [], counts: c }));
});

test("analytics (#437): says plainly that track data is not anonymous, off until the project turns it on, its numbers in words", () => {
  const b = OWN.find((x) => x.id === "analytics")!;
  const t = teamToolOf(b)!;
  assert.equal(b.start, "off");
  assert.equal(t.gate, "members");
  assert.equal(t.page, "analytics");
  assert.match(t.reads[0].what, /not anonymous/);
  assert.match(t.reads[0].from, /Sol's cloud/);
  assert.ok(t.reads.every((r) => r.what.length <= 160 && r.from.length <= 160), "the engine keeps 160 characters a line");
  assert.equal(analyticsOf(null), null);
  assert.equal(analyticsOf({ window: {}, total: {}, days: [] }), null);
  const a = { window: { days: 30, from: "2026-10-01", to: "2026-10-30" }, total: { events: 1240, testers: 3 }, days: [], names: [], modes: [], parts: [], active: [], releases: [], read: "",
    versions: [{ release: "main", sols: ["c81fa20"], testers: 1, events: 1 }, { release: "dev-2026-10-29", sols: ["a710886"], testers: 2, events: 9 }, { release: "", sols: ["x"], testers: 0, events: 1 }] };
  assert.ok(analyticsOf(a));
  assert.equal(analyticsLine(a), "3 testers · 1,240 events over 30 days");
  assert.equal(analyticsLine({ ...a, total: { events: 0, testers: 0 } }), "nothing counted in the last 30 days");
  assert.deepEqual(onNewest(a), { release: "dev-2026-10-29", testers: 2 });
  assert.equal(onNewest({ versions: [] }), null);
  assert.equal(releaseWord("dev-2026-10-29"), "dev 10/29");
  assert.equal(releaseWord("main"), "main, not released yet");
  assert.equal(releaseWord(""), "a build of its own");
  assert.equal(compact(940), "940");
  assert.equal(compact(1200), "1.2k");
  assert.equal(compact(2000), "2k");
  assert.equal(compact(12_400), "12k");
  assert.equal(md("2026-10-05"), "10/5");
});

test("the Features page (#480): Sol developers only, off until the project turns it on, two views of one map", () => {
  const b = OWN.find((x) => x.id === "features")!;
  const t = teamToolOf(b)!;
  assert.equal(b.start, "off");
  assert.equal(t.gate, "devs");
  assert.equal(t.page, "features");
  assert.match(teamToolLine(t), /^Sol developers only · reads /);
  assert.equal(gateWord({ gate: "members" }), "members only");
  const f = (id: string, where: string, label: string, evals: string) => ({ id, name: id, slug: id, type: "product", label, where, lead: "marco", support: [], dependsOn: [], paths: ["sol/x"], off: null, evals });
  const d = featuresOf({ features: [f("fr-01", "the window: launch", "base", "approved"), f("fr-04", "Home: past conversations", "life", "draft"), f("fr-26", "the website: the page", "", "none"), { id: "bad" }], owners: { life: ["frank", "marco"], product: ["marco"] }, resort: { line: "2 PRs moved · undo: SOL_RECORD=o/r bash sol/features --undo x", at: "2026-10-31T07:00:00Z", undo: "SOL_RECORD=o/r bash sol/features --undo x" }, read: "" })!;
  assert.equal(d.features.length, 3, "a feature without its parts is left out");
  assert.equal(featuresOf({ features: [] }), null);
  assert.equal(featuresLine(d), "3 features · 1 with evals approved · 1 drafted");
  assert.equal(featuresLine({ features: [] }), "no feature map in the checkout this Sol runs from");
  assert.equal(placeOf({ where: "the notch: answers" }), "the notch");
  assert.equal(rowOf(d.features[1]).place, "Home");
  assert.deepEqual(builtGroups(d).map((g) => [g.label, g.leads, g.features.map((x) => x.id)]), [["base", [], ["fr-01"]], ["life", ["frank", "marco"], ["fr-04"]], ["no area yet", [], ["fr-26"]]], "the old area label product is no group (decision 18)");
  assert.equal(d.resort?.undo, "SOL_RECORD=o/r bash sol/features --undo x");
  assert.equal(featuresOf({ features: [], owners: {}, resort: { line: "no PR moved" } })?.resort?.undo, "", "an older engine's line: no undo");
  const old = featuresOf({ features: [f("fr-28", "a session: take", "product", "none")], owners: {} })!;
  assert.equal(builtGroups(old)[0].label, "no area yet", "a map that still says product reads as no area");
});

test("the live block (#485): off until the project turns it on, members only, saying it never reads what failed; its line in words", () => {
  const b = OWN.find((x) => x.id === "live")!;
  const t = teamToolOf(b)!;
  assert.equal(b.start, "off");
  assert.equal(t.gate, "members");
  assert.equal(t.page, "live");
  assert.match(t.reads[0].what, /never what failed/);
  assert.ok(t.reads.every((r) => r.what.length <= 160 && r.from.length <= 160), "the engine keeps 160 characters a line");
  assert.equal(liveOf(null), null);
  assert.equal(liveOf({ notes: [], read: "x", errors: { features: "no" } }), null);
  const l = { release: { tag: "dev-20261031", at: "2026-10-31T13:00:00Z", sha: "a" }, read: "x", notes: [],
    morning: { head: "h", tag: "dev-20261031", at: "", green: true, findings: 2 },
    errors: { window: { days: 30, from: "2026-10-02", to: "2026-10-31" }, total: 12, mapped: true, features: [{ id: "fr-07", name: "p", events: 12, testers: 2, onNewest: 5, types: [], releases: [] }] } };
  assert.ok(liveOf(l));
  assert.equal(liveLine(l), "dev 10/31 is the newest dev release · the gate green · 12 errors in 30 days, 5 on it");
  assert.equal(liveLine({ ...l, morning: { ...l.morning, tag: "dev-20261030" }, errors: null }), "dev 10/31 is the newest dev release · no morning run on it yet");
  assert.equal(liveLine({ release: null, morning: null, errors: { ...l.errors, total: 0 } }), "no dev release yet · no errors in 30 days");
  assert.equal(devWord("dev-20261031"), "dev 10/31");
  assert.equal(devWord("dev-20261031-1400"), "dev 10/31 14:00");
});
