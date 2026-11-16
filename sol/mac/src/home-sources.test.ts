// node --test src/*.test.ts (npm test here): Sources and the policy paragraph (#796, plan Part C slice 33;
// home/whole/policy.ts, sourcesStore.ts, Sources.tsx; the stub of #828). The Try line: drop Mail to read: its policy
// sentence rewrites itself. And the rules under it: the paragraph read into rungs, a sentence that sets nothing, the
// folder never above its source, "what Sol learned" a rule only on a press, "sign in again", and undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RUNGS, WORDS, folderRung, parse, readLine, readSentence, rewrite, sourcesLine, stub, wouldLine, SEED_TEXT, type SourceId } from "./home/whole/policy.ts";

const NOW = new Date(2026, 10, 9, 8, 40).getTime();
const mailOf = (m: ReturnType<ReturnType<typeof stub>>) => m.sources.find((s) => s.id === "mail")!;
const sentenceOf = (m: ReturnType<ReturnType<typeof stub>>, id: SourceId) => m.policy.sentences.find((s) => s.source === id)!;

test("drop Mail to read: its policy sentence rewrites itself", () => {
  const ask = stub(() => NOW), before = ask({ type: "home.sources" });
  assert.equal(mailOf(before).rung, "propose");
  assert.equal(sentenceOf(before, "mail").span, "Suggest replies to my mail, send nothing.");
  const after = ask({ type: "home.source.set", id: "mail", rung: "read" });
  assert.equal(mailOf(after).rung, "read");
  assert.equal(sentenceOf(after, "mail").span, "Send nothing from my mail unless I say so.", "the sentence rewritten in its place");
  assert.equal(after.policy.sentences.indexOf(sentenceOf(after, "mail")), before.policy.sentences.indexOf(sentenceOf(before, "mail")), "in the same place in the paragraph");
  assert.ok(after.policy.text.includes("Send nothing from my mail unless I say so."));
  assert.deepEqual(parse(after.policy.text).sentences.find((s) => s.source === "mail"), { span: "Send nothing from my mail unless I say so.", source: "mail", rung: "read" }, "read back, the new words set read");
  for (const id of ["calendar", "files", "canvas", "github"] as SourceId[]) assert.equal(sentenceOf(after, id).span, sentenceOf(before, id).span, `${id}'s sentence untouched`);
  // a folder never above its source: jobs (under Mail) asked propose, now held at read
  const jobs = after.folders.find((f) => f.name === "jobs")!;
  assert.deepEqual([jobs.asked, jobs.rung], ["propose", "read"]);
  assert.equal(after.done?.line, "Mail: read now · its sentence rewritten · jobs held at read");
  // what did I just do, and undo it
  const back = ask({ type: "home.sources.undo", ledgerId: after.done!.ledgerId });
  assert.equal(mailOf(back).rung, "propose");
  assert.equal(sentenceOf(back, "mail").span, "Suggest replies to my mail, send nothing.");
  assert.equal(back.folders.find((f) => f.name === "jobs")!.rung, "propose");
});

test("every rung's words read back as that rung of that source (the rewrite and the parse agree)", () => {
  for (const [id, by] of Object.entries(WORDS)) for (const r of RUNGS) assert.deepEqual(readSentence(by[r]), { span: by[r], source: id, rung: r }, `${id} ${r}`);
  const p = rewrite(parse("Read Canvas for due dates."), "github", "draft");
  assert.equal(p.sentences.at(-1)!.span, WORDS.github.draft, "a source no sentence names gets one");
});

test("the paragraph read into rungs; a sentence that names no rung sets nothing, and says so", () => {
  const p = parse(SEED_TEXT);
  assert.deepEqual(p.sentences.map((s) => [s.source ?? s.folder, s.rung]), [["calendar", "propose"], ["files", "draft"], ["mail", "propose"], ["canvas", "read"], ["github", "read"], ["jobs", null]]);
  assert.equal(readLine(p), "Read: 5 sentences set rungs · 1 sets nothing (“Be sensible with jobs” names no rung: say how far) · above each rung, Sol writes what it would have done");
  assert.deepEqual(readSentence("Look at my calendar and suggest times, but only I put things on it."), { span: "Look at my calendar and suggest times, but only I put things on it.", source: "calendar", rung: "propose" }, "“only I put” holds it back");
  assert.equal(readSentence("Plan study in the evening, never before 9:00.").rule, true, "names nothing: a rule of yours, not a rung");
});

test("writing the policy sets the rungs; the folders follow; a learned line joins only on “make it a rule”", () => {
  const ask = stub(() => NOW);
  const w = ask({ type: "home.policy.write", text: SEED_TEXT.replace("Suggest replies to my mail, send nothing.", "Draft my replies and hold them for me.") });
  assert.equal(mailOf(w).rung, "draft");
  assert.equal(w.folders.find((f) => f.name === "jobs")!.rung, "propose", "a folder keeps what it asked while its source is higher");
  assert.equal(folderRung("act", "read"), "read"); assert.equal(folderRung("read", "act"), "read");
  const learned = ask({ type: "home.sources" }).learned.length;
  const k = ask({ type: "home.learned.keep", id: "evening" });
  assert.equal(k.learned.length, learned - 1);
  assert.ok(k.policy.text.endsWith("Plan study in the evening, never before 9:00."), "now a sentence in your policy");
  assert.equal(k.done?.line, "now a sentence in your policy");
  const d = ask({ type: "home.learned.drop", id: "notes" });
  assert.ok(!d.policy.text.includes("headings"), "wrong: forgotten, never a sentence");
});

test("health: Canvas signed out, “sign in again” in its row; the one line says who needs you", () => {
  const ask = stub(() => NOW), s = ask({ type: "home.sources" });
  assert.deepEqual(sourcesLine(s.sources), ["Five sources.", "Canvas needs you: it signed out."]);
  const r = ask({ type: "home.source.repair", id: "canvas" });
  assert.equal(r.sources.find((x) => x.id === "canvas")!.health.state, "ok");
  assert.deepEqual(sourcesLine(r.sources), ["Five sources.", "All of them reading."]);
  assert.equal(wouldLine(mailOf(s)), "would have: 2 today");
});

test("the store fills from the stub, and the seams are small and marked", async () => {
  const st = await import("./home/whole/sourcesStore.ts");
  st.send({ type: "home.sources" });
  st.setRung("mail", "read");
  assert.equal(st.sourcesNow()!.policy.sentences.find((s) => s.source === "mail")!.span, "Send nothing from my mail unless I say so.");
  const modes = readFileSync(new URL("./spine/Modes.tsx", import.meta.url), "utf8");
  assert.match(modes, /place === "sources" \? <SourcesView \/> :[^}]*<Today \/>/);   // C34 added the fold between them
  assert.match(modes, /useHomeWhole\(\) \? \{ where: (place|whereWord\(place)/, "only with the switch on");   // C36 names a folder by its name
  const first = readFileSync(new URL("./home/whole/First.tsx", import.meta.url), "utf8");
  assert.match(first, /C33[\s\S]*onClick=\{\(\) => goTo\("sources"\)\}/);
});
