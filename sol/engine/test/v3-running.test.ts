// Cowork v3 slice 3 (fr-30 E10, #556): Running. One now-line (red, running, next) from the record and today's run
// state; in SOL's project the dev face lists drafts with today's presses, and every press names a handler that exists
// today (a team.* case of wire.ts, the review card's verdicts, the review opener). With the switch off, no v3 case answers.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as P from "../src/team/v3/people.ts";
import { nowLine, nextMoment, devFace, isDevProject, minutesIn, URGENT_WORDS, type PrLike } from "../src/team/v3/running.ts";
import { handleV3, type V3Deps } from "../src/team/v3/peopleWire.ts";

const WIRE = readFileSync(fileURLToPath(new URL("../src/team/wire.ts", import.meta.url)), "utf8");
const at = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(2026, 10, 1, h, m); return d; };
const rhythm = { handIn: "20:00", review: "21:00", release: "06:00", dev: ["marcocyl04-ux"], devBackup: ["isaac"] };

test("running: one now-line, red at the left with its one press, what runs, the next moment of the rhythm", () => {
  const l = nowLine({ now: at("10:12"), role: "editor", rhythm,
    reds: [{ title: "Drive", whose: "frank", place: "drive", line: "sign-in expired" }],
    runs: [{ title: "Friday summary", whose: "frank", agent: true, line: "gathering the week" }] });
  assert.deepEqual(Object.keys(l), ["red", "running", "next"]);
  assert.equal(l.red[0].press!.label, "Sign in again");
  assert.equal(l.running[0].title, "Friday summary");
  assert.equal(l.next!.label, "Hand-in");
  assert.equal(l.next!.at, "20:00");
  assert.equal(l.next!.inMinutes, 20 * 60 - (10 * 60 + 12));
});

test("running: the next moment wraps past midnight; no rhythm says none", () => {
  assert.equal(nextMoment(rhythm, at("22:30"))!.label, "Release");
  assert.equal(nextMoment(rhythm, at("22:30"))!.inMinutes, 7 * 60 + 30);
  assert.equal(nextMoment(null, at("10:00")), null);
  assert.equal(minutesIn(at("10:12")), 612);
});

const prs: PrLike[] = [
  { repo: "sol-mif/sol-dev", number: 556, title: "fr-30 People", draft: true, state: "open", author: "marcocyl04-ux", url: "u556", mark: "felt" },
  { repo: "sol-mif/sol-dev", number: 554, title: "fr-30 crossing", draft: false, state: "open", author: "frank", url: "u554" },
  { repo: "sol-mif/sol-dev", number: 500, title: "old", draft: true, state: "closed", author: "x", url: "u500" },
];

test("running: SOL's project is the dev project; any other is not unless the dev module is on", () => {
  assert.equal(isDevProject(["sol-mif/sol-dev"]), true);
  assert.equal(isDevProject(["anna/lea-trip"]), false);
  assert.equal(isDevProject(["anna/lea-trip"], ["dev"]), true);
});

test("running: the dev face lists the open drafts, the reads, the versions and the night", () => {
  const d = devFace({ repo: "sol-mif/sol-dev", me: "marcocyl04-ux", role: "owner", prs, rhythm, reviewOpen: null,
    waiting: [{ number: 554, title: "fr-30 crossing", author: "frank" }],
    releases: [{ tag: "dev-20261031", at: "2026-10-31T10:00:00Z", kind: "dev", changes: [{ number: 1 }] }], people: [{ login: "frank", on: "dev-20261031", behind: 0 }] });
  assert.deepEqual(d.drafts.map((c) => c.number), [556]);
  assert.deepEqual(d.reads.map((c) => c.number), [554]);
  assert.equal(d.versions.releases[0].changes, 1);
  assert.equal(d.night.review, "21:00");
  assert.equal(d.reviewer, true);
  assert.deepEqual(d.drafts[0].presses.map((p) => p.label), ["Try it", "Urgent"]);
  assert.deepEqual(d.night.presses.map((p) => p.label), ["Start the review"]);
});

test("running: with the review open, a read carries Into sol-dev and Send back on the review's own card", () => {
  const d = devFace({ repo: "sol-mif/sol-dev", me: "marcocyl04-ux", role: "owner", prs, rhythm, reviewOpen: "rev-1", waiting: [{ number: 554, title: "c" }], releases: [], people: [] });
  const ps = d.reads[0].presses;
  assert.deepEqual(ps.map((p) => p.label), ["Try it", "Into sol-dev", "Send back", "Urgent"]);
  assert.deepEqual(ps[1].body, { verdict: "fold", number: 554, sessionId: "rev-1" });
  assert.deepEqual(d.night.presses, [], "the review is open: nothing to start");
});

test("running: someone who is not the night's reviewer gets Try it only", () => {
  const d = devFace({ repo: "sol-mif/sol-dev", me: "frank", role: "editor", prs, rhythm, reviewOpen: "rev-1", waiting: [{ number: 554, title: "c" }], releases: [], people: [] });
  assert.deepEqual(d.drafts[0].presses.map((p) => p.label), ["Try it"]);
  assert.deepEqual(d.reads[0].presses.map((p) => p.label), ["Try it"]);
  assert.deepEqual(d.night.presses, []);
});

test("running: every dev press calls a handler that exists today, never a new one", () => {
  const d = devFace({ repo: "sol-mif/sol-dev", me: "marcocyl04-ux", role: "owner", prs, rhythm, reviewOpen: "rev-1", waiting: [{ number: 554, title: "c" }], releases: [], people: [] });
  const off = devFace({ repo: "sol-mif/sol-dev", me: "marcocyl04-ux", role: "owner", prs, rhythm, reviewOpen: null, waiting: [{ number: 554, title: "c" }], releases: [], people: [] });
  const all = [...d.drafts, ...d.reads].flatMap((c) => c.presses).concat(off.night.presses);
  const vias = new Set(all.map((p) => p.via));
  for (const v of vias) {
    if (v.startsWith("team.")) assert.ok(WIRE.includes(`case "${v}"`), `${v} is one of today's wire cases`);
    else if (v === "review-open") assert.match(WIRE, /export const tonightNow = /, "the opener the night's timer uses");
    else if (v === "review-card") assert.match(WIRE, /await tonightPress\(tonightDeps\(\)/, "the review card's own press handler");
    else assert.fail(`unknown handler ${v}`);
  }
  assert.deepEqual([...vias].sort(), ["review-card", "review-open", "team.pr.comment", "team.try"]);
  // Urgent is today's urgent OK: a dev reviewer's comment that release.ts reads
  assert.match(URGENT_WORDS, /^\*\*Urgent OK\*\*/);
});

// the wire answer, with fake reads for what wire.ts reads today
const deps = (me: string, over: Partial<V3Deps> = {}): V3Deps => ({
  me: () => me,
  project: () => ({ id: "sol", repos: ["sol-mif/sol-dev"], owners: ["marcocyl04-ux"], members: ["frank", "isaac"] }),
  roster: () => [{ who: "frank", state: "working", session: { title: "#554 crossing" } }, { who: "frank", agent: true, state: "working" }],
  prs: () => prs,
  timeline: async () => ({ waiting: [{ number: 554, title: "c" }], releases: [], people: [] }),
  rhythm: async () => rhythm,
  openReview: async () => ({ session: "rev-9" }),
  ...over,
});
beforeEach(() => P.useTrail(P.memoryTrail()));

test("running: team.v3.running answers the now-line and, in SOL's project, the dev face", async () => {
  const r = await handleV3(deps("marcocyl04-ux"), { type: "team.v3.running" }) as any;
  assert.equal(r.role, "owner");
  assert.ok(r.line.next);
  assert.deepEqual(r.dev.drafts.map((c: any) => c.number), [556]);
});

test("running: Start the review opens it only from Sol's own window", async () => {
  let opened = 0;
  const d = deps("marcocyl04-ux", { openReview: async () => { opened++; return { session: "rev-9" }; } });
  assert.ok((await handleV3(d, { type: "team.v3.running", op: "review" }) as any).error);
  assert.equal(opened, 0);
  assert.equal((await handleV3(d, { type: "team.v3.running", op: "review", fromSol: true }) as any).session, "rev-9");
  assert.equal(opened, 1);
});

test("people: team.v3.people groups people by what each is on, agents beside them", async () => {
  const r = await handleV3(deps("marcocyl04-ux"), { type: "team.v3.people" }) as P.PeopleAnswer;
  assert.equal(r.groups[0].on, "#554 crossing");
  assert.equal(r.groups[0].people[0].who, "frank");
  assert.equal(r.groups[0].people[0].agent!.busy, true);
  assert.equal(r.groups.at(-1)!.on, "nothing open");
});

test("switch off: wire.ts answers no v3 case and loads no v3 module (F7 for slice 3)", () => {
  // every team.v3.* message goes to wire.ts's one v3 block (handleV3), which reads the switch before anything loads
  assert.match(WIRE, /\[\/\^team\\\.v3\\\.\(people\|window\|running\)\$\/, "people"\]/);
  const at = WIRE.indexOf("async function handleV3(");
  assert.ok(at > 0);
  const block = WIRE.slice(at, WIRE.indexOf("// --- end Cowork v3", at));
  assert.ok(block.indexOf("if (!coworkV3()) return;") >= 0 && block.indexOf("if (!coworkV3()) return;") < block.indexOf('await import("./v3/peopleWire.js")'), "the switch is read before anything loads");
  // no static mention of v3 in wire.ts: slice 3's deps type is an inline import(), erased at build
  const statics = WIRE.split("\n").filter((l) => /^import .*\.\/v3\//.test(l));
  assert.deepEqual(statics, []);
});
