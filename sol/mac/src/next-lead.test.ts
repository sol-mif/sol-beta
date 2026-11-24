// node --test src/*.test.ts: one lead per piece (round 7, #1615; merge/lead.js, NOTES.md "Round 7" and round 8's H2):
// the lead and its line, the said line and its change, a hand-off out and back (never in the count), the joined blocker
// (one ask, first, counted once; signed in, the runs resume with one Diary line), the 80-AI scenario, needWords' forms and
// partsSum, and live: every lead move answers "not yet". Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { STEP } from "./next/lead/fixture.ts";
import { joined, leadBits, leadOf, multi, partsOf, partsSum, changedWords, saidWords, talkWords, waitsOn, withs } from "./next/lead/rules.ts";
import { items, needsCount } from "./next/people/queue.ts";
import { lines } from "./next/diary/book.ts";

const job = () => CV.D.pieces["launch-job"];

test("a run's face line says its files only when it has a count: never undefined, never a made-up 0 (#1615)", () => {
  assert.equal(talkWords(7), "talk · change 7 files");
  assert.equal(talkWords(0), "talk · change 0 files", "a count of none is still a count");
  assert.equal(talkWords(undefined), "talk");
  assert.equal(talkWords(NaN), "talk");
  assert.equal(changedWords(40), "changed 40 files", "the Diary's headline and line");
  assert.equal(changedWords(undefined), "worked", "a live session carries no count: no number at all");
});

test("a job of two parts by one AI: no lead yet, one line by it; a second AI joins and the first leads, said once", () => {
  CV.load("dev-launch");
  assert.ok(CV.BUILD_KINDS.has("job"), "a job is a build thing");
  assert.ok(multi(job()));
  assert.equal(leadOf(job()), null);
  assert.deepEqual(leadBits(job()), ["One on it", "2 parts", "1 ask"]);   // BR1 (#1615): a lead reads as its part, never its AI
  const r = STEP.join() as CV.Done;
  assert.ok(r.ok);
  assert.equal(leadOf(job()), "Ada");
  assert.deepEqual(leadBits(job()), ["“book the venue” leads", "3 parts", "1 ask"]);
  assert.deepEqual(saidWords(job()), { words: "“the landing page” joined; “book the venue” leads, first on it.", other: "Kai" });
  assert.equal(lines(0).filter((l) => l.key === "lead:launch-job:Kai").length, 1, "one Diary line");
  const c = CV.M.change_lead("launch-job", "Kai");
  assert.ok(c.ok);
  assert.equal(leadOf(job()), "Kai");
  assert.equal(saidWords(job())!.words, "“the landing page” leads now, by you.");
  assert.equal(lines(0).filter((l) => l.key === "lead-set:launch-job:Kai").length, 1);
  c.undo();
  assert.equal(leadOf(job()), "Ada");
  r.undo();
  assert.equal(partsOf(job()).length, 2);
  assert.equal(job().leadSaid, undefined);
});

test("a hand-off: on Joon's wait, never in Dev's count; it comes back signed, one Diary line each way", () => {
  CV.load("dev-launch");
  STEP.join();
  const n0 = needsCount(), a0 = CV.above();
  const h = CV.M.hand_part("launch-job", "launch-job.p2", "Joon");
  assert.ok(h.ok);
  assert.equal(waitsOn("Joon"), 1);
  assert.equal(needsCount(), n0, "kind 'with' is not an ask");
  assert.equal(CV.above(), a0);
  assert.ok(leadBits(job()).includes("1 with Joon"));
  const back = CV.M.part_returns("launch-job", "launch-job.p2", "tightened the opening");
  assert.ok(back.ok);
  const x = partsOf(job()).find((p) => p.id === "launch-job.p2")!;
  assert.equal((x.back as { by: string }).by, "Joon");
  assert.equal(waitsOn("Joon"), 0);
  const ls = lines(0);
  assert.equal(ls.filter((l) => l.key === "hand:launch-job:launch-job.p2").length, 1);
  assert.equal(ls.filter((l) => l.key === "back:launch-job:launch-job.p2" && l.who === "Joon").length, 1);
  // take it back: off the wait again, no line
  CV.load("dev-launch");
  CV.M.hand_part("launch-job", "launch-job.p2", "Joon");
  assert.ok(CV.M.take_part_back("launch-job", "launch-job.p2").ok);
  assert.equal(withs().length, 0);
});

test("dev-80: 80 AIs under 5 leads and one alone; 12 held by one sign-in join into one ask, first, counted once", () => {
  CV.load("dev-80");
  assert.equal(CV.D.ais.length, 80);
  assert.equal(CV.D.ais.filter((a) => !a.under).length, 6);
  const j = joined();
  assert.equal(j.length, 1);
  assert.equal(j[0].n, 12);
  assert.deepEqual(j[0].by, { api: 7, web: 5 });
  assert.equal(items()[0].id, "join:gh");
  assert.equal(CV.above(), CV.open().length + 1);
  CV.M.sign_in("gh", "wait");
  assert.equal(joined().length, 0, "while GitHub's page is open the ask leaves");
  CV.M.sign_in("gh", "done");
  assert.equal(joined().length, 0);
  assert.equal(Object.values(CV.D.pieces).flatMap(partsOf).filter((x) => x.blocked).length, 0, "the 12 pick up again");
  assert.equal(lines(0).filter((l) => l.key === "resume:gh").length, 1);
  CV.load("dev-morning");
  assert.ok(!items().some((x) => x.id === "join:gh"), "no lapse, no asker");
});

test("needWords: bare only when it is the badge's; a part names itself and the parts add up (round 8 · H2, F1)", () => {
  CV.load("dev-morning");
  const n = CV.above(), b = needsCount(), p = b - n;
  assert.ok(p > 0, "Dev has people's waits");
  assert.equal(CV.needWords(n), `${n} asks need you, and ${p} from people`);
  assert.equal(CV.needWords(n, "chip"), `${n} asks · ${p} from people`);
  assert.equal(CV.needWords(n, "chip", "2 from life"), `${n} asks (2 from life) · ${p} from people`);
  assert.equal(partsSum(CV.needWords(n, "chip", "2 from life")), b);
  assert.equal(partsSum("One thing here needs you; 10 more asks outside, and 7 from people"), 18);
  assert.equal(partsSum("17"), 17);
  CV.load("fresh");
  const f = CV.above();
  if (f === needsCount()) assert.match(CV.needWords(Math.max(f, 1), "chip"), /need/);
});

test("live: every lead move answers not yet, and the AI is refused a hand-off", () => {
  CV.load("dev-launch");
  CV.setMode("live");
  try {
    for (const m of ["join_piece", "change_lead", "hand_part", "take_part_back", "part_returns", "sign_in", "see_seat"]) {
      const r = CV.M[m]("launch-job", "launch-job.p2", "Joon");
      assert.equal(r.ok, false, m);
      assert.equal(r.why, "not yet", m);
    }
  } finally { CV.setMode("fixture"); }
  const A = (CV.hooks as unknown as { agent: { PERSON_ONLY: Record<string, string>; REFUSE: Record<string, string>; MOVE_FN: Record<string, string> } }).agent;
  for (const m of ["hand_part", "take_part_back", "part_returns"]) assert.equal(A.REFUSE[A.PERSON_ONLY[m]], "Handing work to a person, or taking it back, is yours; I can propose it.");
  for (const m of ["join_piece", "change_lead", "hand_part", "take_part_back", "part_returns", "see_seat", "sign_in"]) assert.ok(A.MOVE_FN[m], m);
});
