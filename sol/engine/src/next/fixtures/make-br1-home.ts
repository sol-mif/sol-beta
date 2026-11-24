// Makes the frozen BR1 home (fixtures/br1-home/) again: a studio and a calm home moved into, then one session of presses,
// all through the writers BR1 ships. Run by hand, only to regenerate: `npx tsx src/next/fixtures/make-br1-home.ts <out dir>`.
// The golden copy is NOT regenerated when a writer changes: it stands for what a BR1 person's disk holds, and upgrade.test.ts
// reads it through every later engine. Invented people only, paths under /Users/someone. Signed: marcocyl04-ux's agent (versions helper).
import fs from "node:fs";
import { dirname, join } from "node:path";
import type { Place, Reader } from "../carry.js";
import { judge, keepPlaces } from "../movein-place.js";
import { keepMoveIn, markBatch, readMoveIn, setLead } from "../movein.js";
import { considered } from "../tidy.js";
import { runSetup, setField, dropLine } from "../setup.js";
import { startIn, tell } from "../folders.js";
import { forgetKnown, noteFix } from "../you-known.js";
import { pressPart } from "../look.js";
import { setPos } from "../pos.js";
import { openTab, frontTab } from "../tabs.js";
import { judge as raiseJudge } from "../raise.js";
import { write as writeNote } from "../notes.js";
import { pauseDiary } from "../diary.js";
import { goBack } from "../seats.js";
import { make as makeAuto } from "../automations.js";
import { propose as proposePlan } from "../plans.js";
import { notedClaude } from "../pace.js";
import { recordHomeOf, type Where } from "../you.js";

export const NOW = Date.parse("2026-11-22T09:00:00Z");
const DAY = 86_400_000, at = (n: number) => NOW - n * DAY;

function disk(files: Record<string, number>): Reader {
  const dirs = new Set<string>();
  for (const f of Object.keys(files)) for (let d = dirname(f); d !== "/"; d = dirname(d)) dirs.add(d);
  return {
    text: () => null, head: () => null, time: (p) => files[p] ?? null,
    list: (p) => {
      if (!dirs.has(p)) return null;
      const out = new Map<string, boolean>();
      for (const x of [...Object.keys(files), ...dirs]) if (dirname(x) === p) out.set(x.slice(p.length + 1), dirs.has(x));
      return [...out].map(([name, dir]) => ({ name, dir }));
    },
  };
}
const pl = (path: string, o: Partial<Place> = {}): Place => ({ id: path, name: path.split("/").pop()!, path, from: "claude", kind: null, holds: { repo: false, stickies: 0, things: 0, agent: false }, ...o });

export async function makeHome(sol: string): Promise<void> {
  fs.mkdirSync(sol, { recursive: true });
  const w: Where = { sol, user: sol, rec: recordHomeOf(sol, sol) };
  const r = disk({
    "/Users/someone/studio/site/index.html": at(2), "/Users/someone/studio/site/menu.html": at(3),
    "/Users/someone/studio/menus/lunch.pdf": at(9), "/Users/someone/studio/menus/dinner.pdf": at(8),
    "/Users/someone/calm/journal/today.md": at(1), "/Users/someone/calm/garden/plan.md": at(20),
  });
  const places = [
    pl("/Users/someone/studio/site", { sessions: { claude: 6 }, first: at(30) }), pl("/Users/someone/studio/menus", { sessions: { claude: 2 }, first: at(40) }),
    pl("/Users/someone/calm/journal", { sessions: { codex: 3 }, first: at(25) }), pl("/Users/someone/calm/garden", { sessions: { claude: 1 }, first: at(50) }),
  ];
  // the move-in: judged, kept, placed in one batch, weighed, a lead chosen
  const j = judge({ places, order: [] }, r, { now: NOW, stop: ["/Users/someone"] });
  const keep = j.map((x) => x.folder);
  const before = readMoveIn(sol);
  keepMoveIn(sol, { keep }, NOW);
  const { batch } = keepPlaces(w, j, keep, NOW);
  markBatch(sol, batch, before);
  considered(sol, j, keep, NOW);
  setLead(sol, { lead: "both" }, NOW + 1);
  for (const f of keep) runSetup(sol, f, { job: "build", look: "workbench" }, "moving in", NOW + 2);

  // a session of presses
  const studio = "w:/Users/someone/studio/site", calm = "w:/Users/someone/calm/journal";
  const hands = { start: async () => {}, status: () => "idle" as never, lastWords: () => null as never, say: async () => {} };
  await startIn(sol, { folder: studio, text: "Fix the lunch menu on the site" }, hands as never, NOW + 10);
  const t = tell(sol, { folder: calm, text: "Evenings only, nothing before six" }, "you told this folder", NOW + 11);
  const made = tell(sol, { folder: studio, text: "Prices are in euros" }, "you told this folder", NOW + 12);
  if (t.ok && made.ok) { forgetKnown(w, { k: `fact:${made.id}` }, NOW + 13); forgetKnown(w, { k: `fact:${made.id}`, back: true }, NOW + 14); }
  noteFix(w, { how: "keep", what: "the studio's setup", place: studio, reason: `setup:${studio}` }, NOW + 15);
  const prev: any = setField(w, { folder: calm, field: "look", take: "paper" }, NOW + 16);
  if (prev.ok && prev.preview) setField(w, { folder: calm, token: prev.preview.token, keep: true }, NOW + 17);
  dropLine(sol, { folder: studio, line: "looks" });
  pressPart(sol, { folder: studio, part: "changed" }, NOW + 18); pressPart(sol, { folder: studio, part: "changed" }, NOW + 19); pressPart(sol, { folder: studio, part: "coming" }, NOW + 20);
  setPos(sol, { id: studio, x: 120, y: 80, w: 320, h: 200, by: "person" }, NOW + 21);
  setPos(sol, { id: calm, x: 520, y: 80, w: 320, h: 200, by: "person", in: null }, NOW + 22);
  openTab(sol, { id: "s-note-1", by: "person", kind: "note", front: true }, NOW + 23);
  openTab(sol, { id: "s-doc-2", by: "ai", kind: "doc" }, NOW + 24);
  frontTab(sol, { id: "s-note-1" });
  writeNote(sol, { id: "n-1", text: "ring the florist", x: 40, y: 40, folder: calm }, NOW + 25);
  await raiseJudge(sol, [{ id: "a1", folder: studio, words: "Approve the new menu page", from: "a block on the stage asks", stopped: false }], { now: NOW + 26, lines: {}, bar: "usual" },
    async () => JSON.stringify({ id: "a1", care: true, level: "line", because: "the lunch menu goes live today" }));
  makeAuto(sol, { name: "Weekly menu", does: "Send the weekly menu to the regulars", when: "every day at 08:00" }, NOW + 26);
  proposePlan(sol, { title: "Open the new menu", why: "the lunch menu goes live today", steps: [{ name: "Check prices", does: "Read the prices page" }, { name: "Publish", does: "Publish the menu", after: [1] }] }, { by: { who: "you" }, now: NOW + 26 });
  notedClaude(sol, { rateLimitType: "five_hour", status: "allowed", utilization: 0.4 }, NOW + 26);
  pauseDiary(sol, true, NOW + 27);
  goBack(sol, NOW + 28, true, () => {});
}

if (process.argv[1]?.endsWith("make-br1-home.ts") && process.argv[2]) await makeHome(process.argv[2]);
