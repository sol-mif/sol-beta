// Scoped and Approve (#482, team/checkpoint.ts): the two presses of a feature's life. The agent shows the card (the tool
// `checkpoint`); only the Sol developer's press, from Sol's own window with the card's key, writes the Status line.
// Scoped is refused while the PRD has an open question, a missing section or a `<...>`; Approve until the PRD is
// scoped and every eval line has its check. The templates in specs/templates are the shapes read here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-checkpoint-")), "work.json");
const C = await import("../src/team/checkpoint.ts");
const { WORK_TOOLS } = await import("../src/work/tools.ts");

const { devOnly, ROOT } = await import("./dev-copy.ts");
// the templates are the dev's (specs/ never reaches a Sol tester's copy): the tests that read them skip there (#300)
const TEMPLATES = devOnly("specs/templates/prd.md", "specs/templates/eval.md");
const template = (f: string) => readFileSync(join(ROOT, "specs/templates", f), "utf8");

const PRD = `# fr-12 · Open Sol: PRD

Status: draft
<!-- Only the Sol developer's Scoped press changes the line above. -->

## What it is
The window opens.

## Who it is for
Sol users.

## What a Sol user does and sees
They click the icon and the window is there.

## Decisions
- One window.

## What it must not break
- fr-03: the notch.

## Off-switch
None: it is the window.

## Open questions
<!-- One line a question: "- <question>". -->
- Does it open on login?
`;
const EVAL = `# fr-12 · Open Sol: evals

Status: draft
<!-- Only the Sol developer's press changes the line above to "Status: Approved by <login> on YYYY-MM-DD".
     An agent never writes it: the guard refuses it (rule eval-sealed). -->

## Ways to use it
- [E1] The Sol user opens Sol and sees the window · check: \`true\`

## Ways it can fail
- [F1] The engine is away: the window says so · check: \`true\`

## Must not break
- [N1] fr-03 the notch still opens · check: manual (persona: first Mac)

## Releases
<!-- the verifier adds one line per release, nothing else -->
`;
const answered = (prd: string) => prd.replace("- Does it open on login?\n", "None.\n");

function folder(prd = PRD, ev: string | null = EVAL) {
  const cwd = mkdtempSync(join(tmpdir(), "sol-feature-"));
  const dir = join(cwd, "specs/features/fr-12-open-sol");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "prd.md"), prd);
  if (ev !== null) writeFileSync(join(dir, "eval.md"), ev);
  return { cwd, dir };
}
const world = (me = "marcocyl04-ux") => {
  const said: any[] = [];
  return { said, d: { me: () => me, today: () => "2026-10-31", bus: (m: object) => said.push(m) } };
};
let n = 0;
const session = () => `s-${++n}`;

test("a PRD's open questions, sections and placeholders, read as the template writes them", () => {
  assert.deepEqual(C.openQuestions(PRD), ["Does it open on login?"], "the comment is not a question");
  assert.deepEqual(C.openQuestions(answered(PRD)), [], "None. is no question");
  assert.deepEqual(C.openQuestions(PRD.replace("- Does it open on login?\n", "")), [], "an empty section is no question");
  assert.deepEqual(C.openQuestions("# x\n## Open questions\n1. Why?\n* And how?\nNothing left? no: this is one\nNone, but ask Isaac\n- None.\nnothing\n"),
    ["Why?", "And how?", "Nothing left? no: this is one", "None, but ask Isaac"], "only a bare None. or Nothing. is no question");
  assert.match(C.scopedRefusal(PRD)!, /1 open question: Does it open on login\?/);
  assert.equal(C.scopedRefusal(answered(PRD)), null);
  assert.match(C.scopedRefusal(answered(PRD).replace("## Off-switch\n", "## Off\n"))!, /no section "Off-switch"/);
  assert.match(C.scopedRefusal(answered(PRD).replace("One window.", "<decision>"))!, /still says <decision>/);
  assert.deepEqual(C.placeholders("a <b>bold</b> <kbd>x</kbd> and <login> and fr-NN <!-- <hidden> -->"), ["<login>", "fr-NN"], "HTML and comments are not placeholders");
});

test("the templates: every section there, the CONTRACTS shape, and neither can be pressed as it is", { skip: TEMPLATES }, () => {
  const prd = template("prd.md"), ev = template("eval.md");
  for (const h of C.PRD_SECTIONS) assert.notEqual(C.sectionOf(prd, h), null, `the PRD template has "${h}"`);
  assert.equal(C.statusOf(prd), "draft");
  assert.match(C.scopedRefusal(prd)!, /open question: <question>/);
  for (const h of C.EVAL_SECTIONS) assert.notEqual(C.sectionOf(ev, h), null, `the eval template has "${h}"`);
  assert.equal(C.statusOf(ev), "draft");
  assert.match(ev, /^- \[E1\] .* · check: `<command an agent can run, exit 0 = pass>`$/m);
  assert.match(ev, /^- \[N1\] fr-NN /m, "a must-not-break line starts with the feature it protects");
  const scoped = C.withStatus(answered(PRD), C.scopedLine("marcocyl04-ux", "2026-10-31"));
  assert.match(C.approveRefusal(scoped, ev)!, /still says/, "the template's placeholders refuse it");
});

test("Approve waits for Scoped and a check on every line", () => {
  const scoped = C.withStatus(answered(PRD), C.scopedLine("marcocyl04-ux", "2026-10-31"));
  assert.ok(C.isScoped(scoped));
  assert.match(C.approveRefusal(PRD, EVAL)!, /not scoped yet/);
  assert.equal(C.approveRefusal(scoped, EVAL), null);
  assert.match(C.approveRefusal(scoped, EVAL.replace(" · check: `true`\n\n## Ways it can fail", "\n\n## Ways it can fail"))!, /1 eval line has no check: \[E1\]/);
  assert.match(C.approveRefusal(scoped, EVAL.replace("check: manual (persona: first Mac)", "check: manual"))!, /no check: \[N1\]/, "manual needs its persona");
  assert.match(C.approveRefusal(scoped, EVAL.replace(/- \[E1\].*\n/, ""))!, /no way to use it/);
});

test("the Status line: replaced where it is, put under the title when there is none", () => {
  assert.equal(C.withStatus("# t\n\nStatus: draft\nx\n", "Approved by a on 2026-10-31"), "# t\n\nStatus: Approved by a on 2026-10-31\nx\n");
  assert.equal(C.withStatus("# t\nx\n", "Scoped by a on 2026-10-31"), "# t\n\nStatus: Scoped by a on 2026-10-31\nx\n");
  assert.equal(C.statusOf("# t\n\nStatus:   Approved by a on 2026-10-31  \n"), "Approved by a on 2026-10-31");
});

test("the feature's folder: by its id, in the session's folder", () => {
  const { cwd } = folder();
  assert.deepEqual(C.featureFolder(cwd, "fr-12"), { folder: "specs/features/fr-12-open-sol" });
  assert.deepEqual(C.featureFolder(cwd, "FR-12"), { folder: "specs/features/fr-12-open-sol" });
  assert.match((C.featureFolder(cwd, "fr-13") as any).error, /no folder specs\/features\/fr-13-<slug>/);
  assert.match((C.featureFolder(cwd, "../etc") as any).error, /fr-NN/);
  mkdirSync(join(cwd, "specs/features/fr-12-again"));
  assert.match((C.featureFolder(cwd, "fr-12") as any).error, /two folders/);
});

test("the tool is for sol-dev's feature folders: found from a subfolder, never in a copy without them (a Sol tester's) or another project", () => {
  const { cwd } = folder();
  mkdirSync(join(cwd, ".git")); mkdirSync(join(cwd, "sol/engine"), { recursive: true });
  assert.equal(C.featuresRoot(cwd), null, "specs/features alone is any project's: not sol-dev");
  mkdirSync(join(cwd, "docs/how-we-work"), { recursive: true });   // sol-dev's own (the beta export never ships it)
  assert.equal(C.featuresRoot(join(cwd, "sol/engine")), cwd);
  assert.equal(C.featuresRoot(cwd), cwd);
  const byRemote = mkdtempSync(join(tmpdir(), "sol-dev-remote-"));
  execFileSync("git", ["init", "-q"], { cwd: byRemote }); execFileSync("git", ["remote", "add", "origin", "git@github.com:sol-mif/sol-dev.git"], { cwd: byRemote });
  mkdirSync(join(byRemote, "specs/features"), { recursive: true });
  assert.equal(C.featuresRoot(byRemote), byRemote, "a checkout whose remote is sol-dev");
  const beta = mkdtempSync(join(tmpdir(), "sol-beta-copy-"));
  mkdirSync(join(beta, ".git")); mkdirSync(join(beta, "sol/engine"), { recursive: true });
  assert.equal(C.featuresRoot(join(beta, "sol/engine")), null, "the search stops at the copy's own top");
  assert.equal(C.featuresRoot(""), null);
});

test("Scoped: the agent shows the card, Sol refuses the press while a question is open, then only the press writes the line", async () => {
  const { cwd, dir } = folder();
  const { said, d } = world();
  const id = session();
  const ans = await C.askPress(d, { sessionId: id, cwd, feature: "fr-12", press: "scoped", after: "u1" });
  assert.match(ans, /Sol refuses the press until .*open question/, "the agent hears why");
  const [card] = C.checkpointsOf(id);
  assert.equal(card.kind, "checkpoint"); assert.equal(card.press, "scoped"); assert.equal(card.title, "fr-12 · Open Sol");
  assert.match(String(card.why), /Does it open on login/);
  assert.equal(said.at(-1).type, "work.item");
  // the agent has no key and no window: the press is refused, nothing written
  assert.match((await C.pressCheckpoint(d, { sessionId: id, id: card.id, key: "guess", window: true })).error!, /opened again/);
  const key = C.checkpointKey(id);
  assert.match((await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: false })).error!, /Sol's own window/);
  // the person's press with a question open: refused, said on the card
  const r1 = await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: true });
  assert.match(r1.error!, /Sol refuses Scoped: 1 open question/);
  assert.equal(C.statusOf(readFileSync(join(dir, "prd.md"), "utf8")), "draft");
  // answered in the file: the same card's press now goes, the files read again at the press
  writeFileSync(join(dir, "prd.md"), answered(PRD));
  const r2 = await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: true });
  assert.deepEqual(r2, { ok: true, line: "Status: Scoped by marcocyl04-ux on 2026-10-31" });
  const prd = readFileSync(join(dir, "prd.md"), "utf8");
  assert.equal(C.statusOf(prd), "Scoped by marcocyl04-ux on 2026-10-31");
  assert.equal(prd, answered(PRD).replace("Status: draft", "Status: Scoped by marcocyl04-ux on 2026-10-31"), "nothing else changed");
  assert.equal(C.checkpointsOf(id)[0].state, "done"); assert.equal(C.checkpointsOf(id)[0].by, "marcocyl04-ux");
  assert.match((await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: true })).error!, /pressed already, by marcocyl04-ux on 2026-10-31/);
  // the press keeps what it wrote, where the guard's commit check reads it (sol/harness/guard, eval-sealed)
  const kept = readFileSync(C.PRESSED(), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(kept.some((r) => r.file === "specs/features/fr-12-open-sol/prd.md" && r.line === "Status: Scoped by marcocyl04-ux on 2026-10-31" && r.by === "marcocyl04-ux"));
  assert.equal(C.PRESSED(), join(process.env.SOL_STATE!, "..", "checkpoint", "pressed.jsonl"));
});

test("Approve: refused before Scoped, then writes 'Status: Approved by <login> on <date>' into eval.md and nothing else", async () => {
  const { cwd, dir } = folder();
  const { d } = world("franktsai2008-eng");
  const id = session();
  await C.askPress(d, { sessionId: id, cwd, feature: "fr-12", press: "approve" });
  const card = C.checkpointsOf(id)[0], key = C.checkpointKey(id);
  assert.match((await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: true })).error!, /press Scoped first/);
  writeFileSync(join(dir, "prd.md"), C.withStatus(answered(PRD), C.scopedLine("franktsai2008-eng", "2026-10-30")));
  const r = await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: true });
  assert.deepEqual(r, { ok: true, line: "Status: Approved by franktsai2008-eng on 2026-10-31" });
  assert.equal(readFileSync(join(dir, "eval.md"), "utf8"), EVAL.replace("Status: draft", "Status: Approved by franktsai2008-eng on 2026-10-31"));
});

test("the press names the person: no GitHub login, no line; a missing eval.md is said to the agent", async () => {
  const { cwd, dir } = folder(answered(PRD), null);
  const id = session();
  assert.match(await C.askPress(world().d, { sessionId: id, cwd, feature: "fr-12", press: "approve" }), /has no eval\.md/);
  assert.equal(C.checkpointsOf(id).length, 0, "no card for a press that has nothing to write");
  assert.match(await C.askPress(world().d, { sessionId: id, cwd, feature: "fr-12", press: "merge" }), /the presses are scoped and approve/);
  await C.askPress(world().d, { sessionId: id, cwd, feature: "fr-12", press: "scoped" });
  const card = C.checkpointsOf(id)[0];
  const r = await C.pressCheckpoint(world("").d, { sessionId: id, id: card.id, key: C.checkpointKey(id), window: true });
  assert.match(r.error!, /sign in to GitHub/);
  assert.equal(C.statusOf(readFileSync(join(dir, "prd.md"), "utf8")), "draft");
});

test("a card whose folder was changed on disk writes nothing outside a feature's folder", async () => {
  const { cwd } = folder(answered(PRD));
  const { d } = world();
  const id = session();
  await C.askPress(d, { sessionId: id, cwd, feature: "fr-12", press: "scoped" });
  const card = C.checkpointsOf(id)[0], key = C.checkpointKey(id);
  mkdirSync(join(cwd, "docs"), { recursive: true });
  writeFileSync(join(cwd, "docs/prd.md"), answered(PRD));
  card.folder = "docs";
  assert.match((await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: true })).error!, /not a feature's folder/);
  card.folder = "specs/features/fr-12-open-sol/../../../docs";
  assert.match((await C.pressCheckpoint(d, { sessionId: id, id: card.id, key, window: true })).error!, /not a feature's folder/);
  assert.equal(C.statusOf(readFileSync(join(cwd, "docs/prd.md"), "utf8")), "draft");
});

test("one open card per feature and press, placed after what it followed, kept on disk", async () => {
  const { cwd } = folder(answered(PRD));
  const { d } = world();
  const id = session();
  await C.askPress(d, { sessionId: id, cwd, feature: "fr-12", press: "scoped", after: "a" });
  await C.askPress(d, { sessionId: id, cwd, feature: "fr-12", press: "scoped", after: "b" });
  assert.equal(C.checkpointsOf(id).length, 1, "the older unpressed card went");
  const items = [{ id: "a", kind: "me" }, { id: "b", kind: "you" }, { id: "c", kind: "me" }];
  assert.deepEqual(C.withCheckpoints(id, items).map((x) => x.id.startsWith("checkpoint:") ? "card" : x.id), ["a", "b", "card", "c"]);
  assert.deepEqual(C.withCheckpoints("nobody", items), items);
  // kept beside the transcript, so an opened session shows it after a restart
  const file = join(process.env.SOL_STATE!, "..", "checkpoint", `${id}.json`);
  assert.equal(JSON.parse(readFileSync(file, "utf8"))[0].id, C.checkpointsOf(id)[0].id);
});

test("the tool's words say the agent never writes the line (it is offered only where featuresRoot finds a folder)", () => {
  const t = WORK_TOOLS.find((x) => x.name === "checkpoint");
  assert.ok(t, "the checkpoint tool exists");
  assert.match(t!.description, /Only their press writes the `Status:` line; never write or change that line yourself/);
});
