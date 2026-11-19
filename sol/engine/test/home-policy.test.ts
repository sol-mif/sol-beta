// Home 4 (#828): sources and the policy paragraph (src/home/sources.ts, policy.ts, rung-reader.ts, source-files.ts).
// The engine's half of Marco's Sources tests: his 20 sentences, his parse, "drop Mail to read", his undo, his learned
// lines and his "sign in again", replayed against the engine's handlers with fake faces, a real kernel's log
// (test/fixtures/home/rig.ts) and fake doors for his five sources (test/fixtures/home/policy.ts), since the engine has
// no Mail, Calendar, Canvas or GitHub and his face does not reach the socket yet. Tests 1 to 13 are the plan's (specs
// home-plan §6 Home 4); test 8 is where the engine and his stub part: a wider reading is a proposal that needs a press.
// Every home.sources and home.today sent is checked against its strict schema as it arrives.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rig, cleanup, SCHEMAS } from "./fixtures/home/rig.ts";
import { NOW, WORDS as FACE_WORDS, SEED_TEXT, SEED_FOLDERS, SEED_LEARNED, SEED_RUNGS, PARSED_SEED, READ_LINE, MAIL_PROPOSE, MAIL_READ, MAIL_DRAFT, DROP_MAIL_LINE, CALENDAR_HELD, A_RULE, fake, type Fake } from "./fixtures/home/policy.ts";
import { SourcesMsg, SOURCE_IDS, RUNGS, type SourceId } from "../src/contract/home/policy.ts";
import { WORDS, folderRung, parse, readLine, readSentence, rewrite } from "../src/home/rung-reader.ts";
import { registerFolder, registerSource, rungOf, setRung, sourcesMsg } from "../src/home/sources.ts";
import { filesSource } from "../src/home/source-files.ts";
import { policyText, policyVer, putPolicy } from "../src/home/policy.ts";
import { ENGINE, YOU } from "../src/home/log.ts";
import { handleHome } from "../src/home/wire.ts";

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = (() => { throw new Error("no network in Home 4"); }) as typeof fetch; });
after(() => { globalThis.fetch = realFetch; cleanup(); });

const schemas = { ...SCHEMAS, "home.sources": SourcesMsg };
const last = (ms: any[], type = "home.sources") => ms.filter((m) => m.type === type).at(-1);
const src = (m: any, id: SourceId) => m.sources.find((s: any) => s.id === id);
const sentence = (m: any, id: SourceId) => m.policy.sentences.find((s: any) => s.source === id);
const folder = (m: any, name: string) => m.folders.find((f: any) => f.name === name);
const homeKinds = (evs: any[]) => evs.filter((e) => /^(policy|source|rung|thing|today)\./.test(e.kind));

/** his scene: the five fakes (Canvas signed out), his two folders, his rungs and his paragraph, set by the engine */
function scene(o: { broken?: boolean } = {}) {
  const r = rig({ now: NOW, schemas });
  const fakes = {} as Record<SourceId, Fake>;
  for (const id of SOURCE_IDS) { fakes[id] = fake(id, NOW, id === "canvas" && o.broken !== false ? { broken: "signed out" } : {}); registerSource(r.ctx, fakes[id]); }
  for (const f of SEED_FOLDERS) registerFolder(r.ctx, f);
  for (const [id, rung] of SEED_RUNGS) setRung(r.ctx, id, rung, undefined, ENGINE);
  putPolicy(r.ctx, SEED_TEXT);
  return { r, fakes };
}

test("1. the 20: every rung's words read back as that rung of that source, and they are his words", () => {
  assert.deepEqual(WORDS, FACE_WORDS, "the engine's 20 are the face's, word for word");
  let n = 0;
  for (const id of SOURCE_IDS) for (const rung of RUNGS) { assert.deepEqual(readSentence(FACE_WORDS[id][rung]), { span: FACE_WORDS[id][rung], source: id, rung }, `${id} ${rung}`); n++; }
  assert.equal(n, 20);
});

test("2. a source no sentence names gets one, at the end", () => {
  const p = rewrite(parse("Read Canvas for due dates."), "github", "draft");
  assert.equal(p.sentences.at(-1)!.span, FACE_WORDS.github.draft);
  assert.equal(p.text, `Read Canvas for due dates. ${FACE_WORDS.github.draft}`);
});

test("3. his paragraph read into rungs; a sentence that names no rung sets nothing, and says so", () => {
  const p = parse(SEED_TEXT);
  assert.deepEqual(p.sentences.map((s) => [s.source ?? s.folder, s.rung]), PARSED_SEED);
  assert.equal(readLine(p), READ_LINE);
});

test("4. a held-back clause holds it back; a sentence that names nothing is a rule of yours", () => {
  assert.deepEqual(readSentence(CALENDAR_HELD), { span: CALENDAR_HELD, source: "calendar", rung: "propose" });
  assert.equal(readSentence(A_RULE).rule, true);
  assert.equal(readSentence(A_RULE).rung, null);
});

test("5. drop Mail to read: its sentence rewrites itself in place, jobs held at read; source.set, policy.write, rung.ceiling", async () => {
  const { r } = scene();
  const f = r.face();
  const b = last(await r.ask(f, { type: "home.sources" }));
  assert.equal(src(b, "mail").rung, "propose");
  assert.equal(sentence(b, "mail").span, MAIL_PROPOSE);
  const n = r.events().length;
  const a = last(await r.ask(f, { type: "home.source.set", id: "mail", rung: "read" }));
  assert.equal(src(a, "mail").rung, "read");
  assert.equal(sentence(a, "mail").span, MAIL_READ);
  assert.equal(a.policy.sentences.indexOf(sentence(a, "mail")), b.policy.sentences.indexOf(sentence(b, "mail")), "in the same place");
  assert.deepEqual(parse(a.policy.text).sentences.find((s) => s.source === "mail"), { span: MAIL_READ, source: "mail", rung: "read" });
  for (const id of ["calendar", "files", "canvas", "github"] as SourceId[]) assert.equal(sentence(a, id).span, sentence(b, id).span, `${id} untouched`);
  assert.deepEqual([folder(a, "jobs").asked, folder(a, "jobs").rung], ["propose", "read"]);
  assert.equal(a.done.line, DROP_MAIL_LINE);
  const added = r.events().slice(n);
  assert.deepEqual(added.map((e) => e.kind), ["source.set", "policy.write", "rung.ceiling"]);
  const [set, pw, rc] = added;
  assert.equal(a.done.ledgerId, set.id, "the receipt's ledgerId is the act's id");
  assert.deepEqual(set.value, { from: "propose", to: "read" });
  assert.deepEqual([pw.cause, rc.cause], [set.id, set.id]);
  assert.deepEqual(rc.value, { from: "propose", to: "read", policy: policyVer(a.policy.text) });
  assert.equal(pw.value.ver, policyVer(a.policy.text));
  assert.ok(readFileSync(join(r.home, "policy.md"), "utf8").includes(MAIL_READ), "policy.md on the disk has the new sentence");
  // the asker's last home.sources carries the receipt; every other window gets the state with none
  const g = r.face();
  await r.ask(f, { type: "home.source.set", id: "mail", rung: "propose" });
  assert.equal(last(g.got).done, null);
  assert.ok(last(f.got).done.line.startsWith("Mail: propose now"));
  // the same rung, an unknown source, an ask that does not parse: the plain state, nothing written
  const m = r.events().length;
  for (const ask of [{ type: "home.source.set", id: "mail", rung: "propose" }, { type: "home.source.set", id: "slack", rung: "read" }, { type: "home.source.set", id: "mail" }]) {
    const got = await r.ask(f, ask);
    assert.equal(got.length, 1);
    assert.equal(got[0].done, null);
  }
  assert.equal(r.events().length, m);
});

test("6. home.sources.undo: Mail back at propose, the old sentence, jobs at propose; earlier lines untouched", async () => {
  const { r } = scene();
  const f = r.face();
  const a = last(await r.ask(f, { type: "home.source.set", id: "mail", rung: "read" }));
  const bytes = r.bytes(), n = r.events().length;
  const u = last(await r.ask(f, { type: "home.sources.undo", ledgerId: a.done.ledgerId }));
  assert.equal(u.done, null);
  assert.equal(src(u, "mail").rung, "propose");
  assert.equal(sentence(u, "mail").span, MAIL_PROPOSE);
  assert.equal(folder(u, "jobs").rung, "propose");
  assert.equal(u.policy.text, SEED_TEXT);
  assert.ok(r.bytes().startsWith(bytes), "every earlier line byte-equal: the log is never edited");
  const back = r.events().slice(n);
  assert.deepEqual(back.map((e) => e.kind), ["source.set", "policy.write", "rung.ceiling"]);
  for (const e of back) { assert.equal(e.cause, a.done.ledgerId); assert.equal(e.value.undo, true); }
  assert.deepEqual([back[0].value.from, back[0].value.to], ["read", "propose"]);
  assert.deepEqual([back[2].value.from, back[2].value.to], ["read", "propose"]);
  // a second undo writes nothing and still answers
  const m = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.sources.undo", ledgerId: a.done.ledgerId })).done, null);
  assert.equal(r.events().length, m);
  // home.undo of the same kind of act is routed here too (R9), and answers home.sources
  const c = last(await r.ask(f, { type: "home.source.set", id: "github", rung: "propose" }));
  const via = await r.ask(f, { type: "home.undo", ledgerId: c.done.ledgerId });
  assert.equal(src(last(via), "github").rung, "read");
  // refused when the paragraph changed since: nothing written
  const d = last(await r.ask(f, { type: "home.source.set", id: "calendar", rung: "read" }));
  await r.ask(f, { type: "home.policy.write", text: `${SEED_TEXT} Be kind.` });
  const k = r.events().length;
  assert.equal(src(last(await r.ask(f, { type: "home.sources.undo", ledgerId: d.done.ledgerId })), "calendar").rung, "read");
  assert.equal(r.events().length, k, "the paragraph changed since: the undo is refused");
});

test("7. a folder is never above its source", async () => {
  assert.equal(folderRung("act", "read"), "read");
  assert.equal(folderRung("read", "act"), "read");
  const { r } = scene();
  // jobs (under Mail, at propose) asks draft; school is named by no known folder: under Files (draft), it asks act
  await r.ask(r.face(), { type: "home.policy.write", text: `${SEED_TEXT.replace("Be sensible with jobs.", "Write drafts for jobs.")} Put things on the shelf in school.` });
  const m = sourcesMsg(r.ctx, null);
  assert.deepEqual([folder(m, "jobs").source, folder(m, "jobs").asked, folder(m, "jobs").rung], ["mail", "draft", "propose"]);
  assert.deepEqual([folder(m, "school").source, folder(m, "school").asked, folder(m, "school").rung], ["files", "act", "draft"]);
  assert.equal(folder(m, "school › bio 201").rung, "draft");
});

test("8. the lock: a wider reading is a proposal, one rung at a time, applied only on a press", async () => {
  const { r } = scene();
  const f = r.face();
  const n = r.events().length;
  const w = last(await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace(MAIL_PROPOSE, MAIL_DRAFT) }));
  assert.equal(src(w, "mail").rung, "propose", "Mail where it was (his stub would put it at draft at once)");
  assert.equal(sentence(w, "mail").span, MAIL_DRAFT, "the paragraph is his words");
  assert.equal(folder(w, "jobs").rung, "propose");
  assert.equal(w.done.line, "your policy, read again · Mail asks to go up: press to allow");
  const added = r.events().slice(n);
  assert.equal(added.filter((e) => e.kind === "rung.ceiling").length, 0, "no rung.ceiling");
  assert.deepEqual(added.map((e) => e.kind), ["policy.write", "thing.new"]);
  assert.equal(added[0].id, w.done.ledgerId);
  const t = last(f.got, "home.today");
  assert.deepEqual(t.today.needs, ["rung-mail-draft"], "one proposed Thing in needs, pushed to every window");
  const thing = t.things.find((x: any) => x.id === "rung-mail-draft");
  assert.deepEqual([thing.state, thing.waitsOn, thing.words], ["proposed", "you", "Mail: one rung up, to draft?"]);
  // the same write again: nothing new; a wider write that is pending is not made twice
  const k = r.events().length;
  await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace(MAIL_PROPOSE, MAIL_DRAFT) });
  assert.equal(r.events().length, k);
  // the press: one rung up, one rung.ceiling, cause the answer
  const p = await r.ask(f, { type: "home.answer", thingId: "rung-mail-draft", answer: thing.card.answers[0] });
  assert.equal(src(last(p), "mail").rung, "draft");
  const ans = r.events().filter((e) => e.kind === "today.answer").at(-1);
  const rcs = r.events().slice(k).filter((e) => e.kind === "rung.ceiling");
  assert.equal(rcs.length, 1);
  assert.deepEqual([rcs[0].value.from, rcs[0].value.to, rcs[0].cause], ["propose", "draft", ans.id]);
  assert.deepEqual(last(p, "home.today").today.needs, [], "pressed: off the list, nothing more asked");
  assert.equal(p.find((m) => m.type === "home.done").ledgerId, ans.id);
  // a sentence three rungs up: one rung a press, the next proposed after each; "Not now" raises nothing
  const q = await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace("Read GitHub for issues that name me.", FACE_WORDS.github.act) });
  assert.deepEqual(last(q, "home.today").today.needs, ["rung-github-propose"]);
  const y = await r.ask(f, { type: "home.answer", thingId: "rung-github-propose", answer: "Allow" });
  assert.equal(src(last(y), "github").rung, "propose");
  assert.deepEqual(last(y, "home.today").today.needs, ["rung-github-draft"], "the next rung, proposed");
  const no = await r.ask(f, { type: "home.answer", thingId: "rung-github-draft", answer: "Not now" });
  assert.equal(src(last(no), "github").rung, "propose");
  assert.deepEqual(last(no, "home.today").today.needs, [], "not now: nothing raised, nothing asked again");
  assert.equal(src(last(q), "mail").rung, "propose", "that paragraph read Mail at propose again: narrower, applied at once");
  // a proposal pressed before is asked again by the same Thing; one no longer asked for goes
  const again = await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace(MAIL_PROPOSE, FACE_WORDS.mail.act) });
  assert.deepEqual(last(again, "home.today").today.needs, ["rung-mail-draft"]);
  assert.equal(r.events().filter((e) => e.kind === "thing.new" && e.item === "rung-mail-draft").length, 1, "the same Thing, no second thing.new");
  await r.ask(f, { type: "home.policy.write", text: SEED_TEXT });
  assert.equal(r.ctx.items.get("rung-mail-draft")?.gone, true, "the paragraph no longer asks it: gone");
  assert.equal(src(sourcesMsg(r.ctx, null), "mail").rung, "propose");
});

test("9. a write that narrows is applied at once: one rung.ceiling a source that changed; its undo puts them back", async () => {
  const { r } = scene();
  const f = r.face();
  const n = r.events().length;
  const text = SEED_TEXT.replace(CALENDAR_HELD, FACE_WORDS.calendar.read).replace(FACE_WORDS.files.draft, FACE_WORDS.files.propose);
  const w = last(await r.ask(f, { type: "home.policy.write", text }));
  assert.deepEqual([src(w, "calendar").rung, src(w, "files").rung, src(w, "mail").rung], ["read", "propose", "propose"]);
  assert.equal(w.done.line, "your policy, read again");
  const added = r.events().slice(n);
  assert.deepEqual(added.map((e) => e.kind), ["policy.write", "rung.ceiling", "rung.ceiling"]);
  assert.deepEqual(added.slice(1).map((e) => [e.item, e.value.from, e.value.to, e.cause, e.value.policy]), [
    ["calendar", "propose", "read", w.done.ledgerId, policyVer(text)], ["files", "draft", "propose", w.done.ledgerId, policyVer(text)]]);
  assert.equal(folder(w, "school › bio 201").rung, "propose", "the folder follows its source down");
  // home.undo (Home 1's name) routed to Sources by the act's kind
  const u = last(await r.ask(f, { type: "home.undo", ledgerId: w.done.ledgerId }));
  assert.deepEqual([src(u, "calendar").rung, src(u, "files").rung], ["propose", "draft"]);
  assert.equal(u.policy.text, SEED_TEXT);
});

test("10. what Sol learned: seen counts; keep makes it the paragraph's last sentence; drop forgets it", async () => {
  const { r } = scene();
  const f = r.face();
  const [evening, notes] = SEED_LEARNED;
  for (const l of [evening, evening, notes]) r.ctx.log.write({ kind: "policy.learned", item: l.id, value: { what: "seen" }, words: { text: l.text, sentence: l.sentence } });
  const s = last(await r.ask(f, { type: "home.sources" }));
  assert.deepEqual(s.learned, [{ ...evening, seen: 2 }, { ...notes, seen: 1 }]);
  assert.ok(!r.bytes().includes("never before 9:00"), "the line's words are in a value file, not on the log's line");
  const k = last(await r.ask(f, { type: "home.learned.keep", id: "evening" }));
  assert.deepEqual(k.learned.map((l: any) => l.id), ["notes"]);
  assert.ok(k.policy.text.endsWith(evening.sentence));
  assert.equal(k.done.line, "now a sentence in your policy");
  const d = last(await r.ask(f, { type: "home.learned.drop", id: "notes" }));
  assert.deepEqual(d.learned, []);
  assert.ok(!d.policy.text.includes("headings"));
  assert.equal(d.done.line, `forgotten: ${notes.text}`);
  // undo of the keep: the line back, the paragraph as before
  const u = last(await r.ask(f, { type: "home.sources.undo", ledgerId: k.done.ledgerId }));
  assert.deepEqual(u.learned.map((l: any) => l.id), ["evening"]);
  assert.equal(u.policy.text, SEED_TEXT);
  // an unknown id: the plain state, nothing written
  const n = r.events().length;
  assert.equal(last(await r.ask(f, { type: "home.learned.keep", id: "nobody" })).done, null);
  assert.equal(r.events().length, n);
});

test("11. health: Canvas signed out; sign in again; one source.health", async () => {
  const { r, fakes } = scene();
  const f = r.face();
  assert.deepEqual(src(last(await r.ask(f, { type: "home.sources" })), "canvas").health, { state: "broken", lastRead: NOW - 120 * 60_000, why: "signed out" });
  const n = r.events().length;
  const a = last(await r.ask(f, { type: "home.source.repair", id: "canvas" }));
  assert.equal(src(a, "canvas").health.state, "ok");
  assert.equal(a.done.line, "Canvas: signed in again, reading");
  const added = r.events().slice(n);
  assert.deepEqual(added.map((e) => [e.kind, e.item, e.value.state]), [["source.health", "canvas", "ok"]]);
  assert.equal(a.done.ledgerId, added[0].id);
  // already ok: nothing; signed out again later: it shows
  assert.equal(last(await r.ask(f, { type: "home.source.repair", id: "canvas" })).done, null);
  fakes.mail.signOut("password changed");
  assert.equal(src(last(await r.ask(f, { type: "home.sources" })), "mail").health.why, "password changed");
  assert.equal(r.events().length, n + 1);
});

test("12. the files source alone: one source, files, at read; it reads its folders and never the ones it never reads", async () => {
  const r = rig({ now: NOW, schemas });
  const s = last(await r.ask(r.face(), { type: "home.sources" }));
  assert.deepEqual(s.sources.map((x: any) => [x.id, x.rung, x.name]), [["files", "read", "Files"]]);
  assert.deepEqual(s.policy, { text: "", sentences: [] }, "no paragraph yet: the empty one");
  assert.ok(!existsSync(join(r.home, "policy.md")), "asking writes nothing");
  assert.ok(!existsSync(join(r.home, "sources")));
  // the door over a person's folder of a test's own
  const user = mkdtempSync(join(tmpdir(), "sol-user-"));
  try {
    mkdirSync(join(user, "School", "bio 201"), { recursive: true });
    mkdirSync(join(user, "Downloads", "x"), { recursive: true });
    const d = filesSource(r.home, user);
    assert.deepEqual(d.scope(), { reads: ["~/School"], never: ["~/Desktop", "~/Downloads"] }, "the default: ~/School and ~/Jobs that exist");
    assert.equal(d.health(NOW).state, "ok");
    assert.deepEqual(d.read(), [{ folder: "~/School", names: ["bio 201"] }]);
    mkdirSync(join(r.home, "sources"), { recursive: true });
    writeFileSync(join(r.home, "sources", "files.json"), JSON.stringify({ reads: ["~/School", "~/Gone", "~/Downloads/x"], never: ["~/Downloads"] }));
    assert.deepEqual([d.health(NOW).state, d.health(NOW).why], ["stale", "~/Gone not there"]);
    assert.deepEqual((d.read() as any[]).map((x) => x.folder), ["~/School"], "a folder under one it never reads is not read");
    rmSync(join(user, "School"), { recursive: true });
    assert.equal(d.health(NOW).state, "broken");
  } finally { rmSync(user, { recursive: true, force: true }); }
});

test("13. a source of a refused kind is not registered: one rung.refused { why: never }", async () => {
  const r = rig({ now: NOW, schemas });
  const n = r.events().length;
  assert.equal(registerSource(r.ctx, fake("mail", NOW, { kind: "Chase Bank" })), false);
  assert.equal(registerSource(r.ctx, { ...fake("github", NOW), kind: "1Password", name: "Password manager" }), false);
  assert.equal(registerSource(r.ctx, fake("canvas", NOW)), true);
  const refused = r.events().slice(n);
  assert.deepEqual(refused.map((e) => [e.kind, e.item, e.value.why]), [["rung.refused", "mail", "never"], ["rung.refused", "github", "never"]]);
  const s = last(await r.ask(r.face(), { type: "home.sources" }));
  assert.deepEqual(s.sources.map((x: any) => x.id), ["files", "canvas"]);
});

test("for Home 6: setRung with a cause and rungOf; the state computed twice is the same, and the same after a restart", async () => {
  const { r } = scene();
  const why = r.ctx.log.write({ kind: "rung.would", item: "it-0123456789ab", value: { act: "a".repeat(64), rung: "propose", at: "read", source: "canvas" }, mode: "record" });
  assert.equal(src(sourcesMsg(r.ctx, null), "canvas").would, 1, "a would-have of today counts on its source");
  const act = setRung(r.ctx, "canvas", "propose", why.id)!;
  assert.deepEqual([act.kind, act.cause, act.value], ["source.set", why.id, { from: "read", to: "propose" }]);
  assert.equal(rungOf(r.ctx, "canvas"), "propose");
  assert.equal(sentence(sourcesMsg(r.ctx, null), "canvas").span, FACE_WORDS.canvas.propose);
  assert.equal(setRung(r.ctx, "canvas", "propose"), null, "the same rung: nothing");
  assert.equal(JSON.stringify(sourcesMsg(r.ctx, null)), JSON.stringify(sourcesMsg(r.ctx, null)));
  const r2 = r.restart();
  for (const id of SOURCE_IDS) assert.equal(rungOf(r2.ctx, id), rungOf(r.ctx, id), `${id} after a restart`);
  // a policy.md behind its last policy.write (a stop between the two) is put back at start
  const text = policyText(r.home);
  unlinkSync(join(r.home, "policy.md"));
  const r3 = r.restart();
  assert.equal(policyText(r3.home), "");
  await r3.ask(r3.face(), { type: "home.sources" });
  assert.equal(policyText(r3.home), text);
  assert.ok(text.includes(FACE_WORDS.canvas.propose));
});

test("with Home off nothing answers and nothing is written", async () => {
  const was = process.env.SOL_HOME_WHOLE;
  process.env.SOL_HOME_WHOLE = "off";
  try {
    const got: any[] = [];
    await handleHome({ send: (m) => got.push(m) }, { type: "home.sources" });
    await handleHome({ send: (m) => got.push(m) }, { type: "home.policy.write", text: SEED_TEXT });
    assert.deepEqual(got, []);
  } finally { if (was === undefined) delete process.env.SOL_HOME_WHOLE; else process.env.SOL_HOME_WHOLE = was; }
});

test("every Sources event is a registered kind whose free text is never on the line", async () => {
  const { r } = scene();
  const f = r.face();
  await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace(MAIL_PROPOSE, MAIL_DRAFT) });
  await r.ask(f, { type: "home.answer", thingId: "rung-mail-draft", answer: "Allow" });
  await r.ask(f, { type: "home.source.repair", id: "canvas" });
  const line = r.bytes();
  assert.ok(!line.includes("Draft my replies"), "the paragraph's words live in policy.md, never on the log");
  for (const e of homeKinds(r.events())) assert.ok(!JSON.stringify(e.value ?? {}).includes(" my "), `${e.kind}: no sentence inline`);
});

test("the undo of a write that proposed takes the proposal away with the paragraph; a press after it raises nothing", async () => {
  const { r } = scene();
  const f = r.face();
  const w = last(await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace(MAIL_PROPOSE, MAIL_DRAFT) }));
  assert.equal(r.ctx.items.get("rung-mail-draft")?.state, "proposed");
  const u = await r.ask(f, { type: "home.sources.undo", ledgerId: w.done.ledgerId });
  assert.equal(last(u).policy.text, SEED_TEXT);
  assert.equal(r.ctx.items.get("rung-mail-draft")?.gone, true);
  assert.deepEqual(last(u, "home.today").today.needs, [], "Today pushed to every window: the proposal is off the list");
  const n = r.events().length;
  await r.ask(f, { type: "home.answer", thingId: "rung-mail-draft", answer: "Allow" });
  assert.equal(r.events().length, n, "a gone Thing is no Thing of the list: nothing written");
  assert.equal(rungOf(r.ctx, "mail"), "propose");
});

// ── after review, round 1 ──────────────────────────────────────────────────────────────────────────────────────────
/** the same Home after a stop: a new kernel over the same home and log, the fakes and folders registered again */
function again(r: ReturnType<typeof rig>) {
  const r2 = r.restart();
  for (const id of SOURCE_IDS) registerSource(r2.ctx, fake(id, NOW, id === "canvas" ? { broken: "signed out" } : {}));
  for (const f of SEED_FOLDERS) registerFolder(r2.ctx, f);
  return r2;
}

test("a stop between a write's policy.write and its rung.ceiling: at start the rung comes down to the paragraph, and the act still undoes", async () => {
  const { r } = scene();
  // what applyPolicy writes first, then the stop: the paragraph asks Mail at read, Mail is still at propose
  const pw = putPolicy(r.ctx, parse(SEED_TEXT.replace(MAIL_PROPOSE, MAIL_READ)).text, { by: YOU })!;
  assert.equal(rungOf(r.ctx, "mail"), "propose");
  const r2 = again(r);
  const f = r2.face();
  const m = last(await r2.ask(f, { type: "home.sources" }));
  assert.deepEqual([src(m, "mail").rung, sentence(m, "mail").span], ["read", MAIL_READ], "the rung is what the paragraph says");
  const rc = r2.events().filter((e) => e.kind === "rung.ceiling").at(-1);
  assert.deepEqual([rc.item, rc.value.from, rc.value.to, rc.cause, rc.by.person], ["mail", "propose", "read", pw.id, "engine"]);
  // a second start writes nothing more
  const n = r2.events().length;
  const r3 = again(r2);
  await r3.ask(r3.face(), { type: "home.sources" });
  assert.equal(r3.events().length, n);
  // the act undoes whole: the text and the rung back
  const u = last(await r3.ask(r3.face(), { type: "home.sources.undo", ledgerId: pw.id }));
  assert.deepEqual([u.policy.text, src(u, "mail").rung], [SEED_TEXT, "propose"]);
});

test("a stop in the middle of a press on the ladder: at start the press is finished, and it undoes", async () => {
  // narrowing: source.set and policy.write on the log, no rung.ceiling
  const { r } = scene();
  const s = r.ctx.log.write({ kind: "source.set", item: "mail", value: { from: "propose", to: "read" }, by: YOU });
  putPolicy(r.ctx, rewrite(parse(SEED_TEXT), "mail", "read").text, { cause: s.id, by: YOU });
  const r2 = again(r);
  const f = r2.face();
  const m = last(await r2.ask(f, { type: "home.sources" }));
  assert.deepEqual([src(m, "mail").rung, sentence(m, "mail").span], ["read", MAIL_READ]);
  const rc = r2.events().filter((e) => e.kind === "rung.ceiling").at(-1);
  assert.deepEqual([rc.item, rc.value.from, rc.value.to, rc.cause], ["mail", "propose", "read", s.id]);
  const u = last(await r2.ask(f, { type: "home.sources.undo", ledgerId: s.id }));
  assert.deepEqual([u.policy.text, src(u, "mail").rung], [SEED_TEXT, "propose"], "the torn act undoes whole");
  // widening, stopped right after source.set: its sentence and its rung.ceiling are written at start
  const { r: w } = scene();
  const s2 = w.ctx.log.write({ kind: "source.set", item: "github", value: { from: "read", to: "draft" }, by: YOU });
  const w2 = again(w);
  const g = last(await w2.ask(w2.face(), { type: "home.sources" }));
  assert.deepEqual([src(g, "github").rung, sentence(g, "github").span], ["draft", FACE_WORDS.github.draft]);
  assert.deepEqual(w2.events().filter((e) => e.cause === s2.id).map((e) => e.kind), ["policy.write", "rung.ceiling"]);
  // a press that is whole is not pressed again at start
  const k = w2.events().length;
  const w3 = again(w2);
  await w3.ask(w3.face(), { type: "home.sources" });
  assert.equal(w3.events().length, k);
});

test("a stop in the middle of an undo that lowers: at start the rung comes down to the paragraph put back", async () => {
  const { r } = scene();
  const f = r.face();
  const a = last(await r.ask(f, { type: "home.source.set", id: "github", rung: "propose" }));
  // what undoSources writes first, then the stop: the source.set reversed and the paragraph back, the rung still up
  r.ctx.log.write({ kind: "source.set", item: "github", value: { from: "propose", to: "read", undo: true }, by: YOU, cause: a.done.ledgerId });
  putPolicy(r.ctx, SEED_TEXT, { cause: a.done.ledgerId, by: YOU, undo: true });
  assert.equal(rungOf(r.ctx, "github"), "propose");
  const r2 = again(r);
  const m = last(await r2.ask(r2.face(), { type: "home.sources" }));
  assert.deepEqual([m.policy.text, src(m, "github").rung], [SEED_TEXT, "read"]);
  const rc = r2.events().at(-1);
  assert.deepEqual([rc.kind, rc.cause, rc.value.undo], ["rung.ceiling", a.done.ledgerId, true]);
});

test("the undo of a write puts every rung under the paragraph it puts back, a raise by a press included", async () => {
  const { r } = scene();
  const f = r.face();
  // narrows Calendar and asks Mail at draft; "Allow" raises Mail; undo of the write brings back Mail at propose
  const w = last(await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace(CALENDAR_HELD, FACE_WORDS.calendar.read).replace(MAIL_PROPOSE, MAIL_DRAFT) }));
  await r.ask(f, { type: "home.answer", thingId: "rung-mail-draft", answer: "Allow" });
  assert.equal(rungOf(r.ctx, "mail"), "draft");
  const u = last(await r.ask(f, { type: "home.sources.undo", ledgerId: w.done.ledgerId }));
  assert.equal(u.policy.text, SEED_TEXT);
  assert.deepEqual([src(u, "calendar").rung, src(u, "mail").rung], ["propose", "propose"]);
  const rc = r.events().filter((e) => e.kind === "rung.ceiling").at(-1);
  assert.deepEqual([rc.item, rc.value.from, rc.value.to, rc.cause, rc.value.undo], ["mail", "draft", "propose", w.done.ledgerId, true]);
});

test("the refuse-before-load list catches a refused kind inside a word, and Apple's own calendar still loads", () => {
  const r = rig({ now: NOW, schemas });
  for (const kind of ["PasswordManager", "1Password", "OnlineBanking", "HealthKit", "Apple ID", "PayPal", "Google Account", "iCloud Keychain"])
    assert.equal(registerSource(r.ctx, fake("github", NOW, { kind })), false, kind);
  assert.equal(registerSource(r.ctx, fake("calendar", NOW)), true, "Apple Calendar is not an Apple account");
});

test("a policy.md edited by hand is put back at start, and its words are kept, not lost", async () => {
  const { r } = scene();
  writeFileSync(join(r.home, "policy.md"), "Mail may do anything it likes.");
  const r2 = again(r);
  await r2.ask(r2.face(), { type: "home.sources" });
  assert.equal(policyText(r2.home), SEED_TEXT);
  assert.equal(readFileSync(join(r2.home, "sources", "policy", `${policyVer("Mail may do anything it likes.")}.md`), "utf8"), "Mail may do anything it likes.");
});

test("a press on the ladder takes away a proposal it answered; a would-have counts only today; a drop undoes once", async () => {
  const { r } = scene();
  const f = r.face();
  await r.ask(f, { type: "home.policy.write", text: SEED_TEXT.replace(MAIL_PROPOSE, MAIL_DRAFT) });
  assert.equal(r.ctx.items.get("rung-mail-draft")?.state, "proposed");
  await r.ask(f, { type: "home.source.set", id: "mail", rung: "draft" });
  assert.equal(r.ctx.items.get("rung-mail-draft")?.gone, true, "Mail is at draft: the proposal is no longer asked");
  r.ctx.log.write({ kind: "rung.would", item: "it-0123456789ab", value: { act: "a".repeat(64), rung: "propose", at: "read", source: "canvas" }, mode: "record" });
  assert.equal(src(sourcesMsg(r.ctx, null), "canvas").would, 1);
  r.clock.now += 24 * 3600_000;
  assert.equal(src(sourcesMsg(r.ctx, null), "canvas").would, 0, "yesterday's would-have is not today's");
  r.ctx.log.write({ kind: "policy.learned", item: "notes", value: { what: "seen" }, words: { text: SEED_LEARNED[1].text } });
  const d = last(await r.ask(f, { type: "home.learned.drop", id: "notes" }));
  const n = r.events().length;
  await r.ask(f, { type: "home.sources.undo", ledgerId: d.done.ledgerId });
  assert.equal(r.events().length, n + 1);
  await r.ask(f, { type: "home.sources.undo", ledgerId: d.done.ledgerId });
  assert.equal(r.events().length, n + 1, "a second undo of a drop writes nothing");
});
