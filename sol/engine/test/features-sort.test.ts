// Types of work, the nightly re-sort and its undo, the "devs" gate and "your area" (#480). GitHub is a function that
// writes down its arguments and keeps each PR's title and labels; the project's record is a fake one in memory, as in
// cowork-onboard.test.ts. Nothing reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { featuresIn, folderOf, FEATURES_PATH } = await import("../src/team/features.ts");
const { typeOfWork, typeOfFile, moveOf, titled, typeSaid, missingLabel } = await import("../src/team/worktype.ts");
const { planResort, proposeFor, agentProposals, resortLine, resort, undo, resortsStore, parseResorts, applyResorts, stateOf, lastResort, devsOnGithub, RESORTS_PATH } = await import("../src/team/resort.ts");
const { devsIn, areaOf, areaLine, areaLineFor, useArea, areaSettled, featuresData, mapRoot } = await import("../src/team/area.ts");
const { gate, openTool, cleanTool, defineTool } = await import("../src/team/teamtool.ts");

const F = (id: string, slug: string, type: string, paths: string[], o: Record<string, unknown> = {}) => ({ id, name: slug, slug, type, label: "base", where: "the window: x", lead: "marco", support: [], dependsOn: [], paths, off: null, ...o });
const MAP = featuresIn({ features: [
  F("fr-07", "session", "product", ["sol/engine/src/work/", "sol/mac/src/work/"], { label: "work" }),
  F("fr-08", "side-copies", "product", ["sol/engine/src/work/copies.ts"], { label: "work" }),
  F("fr-26", "website", "marketing", ["site/"], { label: "product", lead: "isaac" }),
  F("fr-27", "the-nights", "internal", ["sol/engine/src/team/tonight.ts", "sol/release"], { label: "cowork" }),
  F("fr-20", "cowork", "product", ["sol/engine/src/team/", "sol/mac/src/cowork/"], { label: "cowork", lead: "frank" }),
] });

test("a file's type: its feature's, else the path rules, else product under sol/", () => {
  assert.equal(typeOfFile(MAP, "sol/engine/src/team/tonight.ts").type, "internal", "the nights are how Sol developers build");
  assert.equal(typeOfFile(MAP, "sol/engine/src/team/pages.ts").type, "product");
  assert.equal(typeOfFile(MAP, "site/index.html").type, "marketing");
  assert.equal(typeOfFile(MAP, ".github/workflows/ci.yml").type, "internal");
  assert.equal(typeOfFile(MAP, "sol/take").type, "internal");
  assert.equal(typeOfFile(MAP, "sol/engine/src/voice.ts").type, "product");
  assert.equal(typeOfFile(MAP, "docs/how-we-work/PRD.md").type, "internal");
});

test("a PR's type: most of its own files, the shared ones only when alone; ties go product", () => {
  assert.equal(typeOfWork(MAP, ["sol/engine/src/work/runs.ts", "now.md", "sol/README.md", "sol/engine/test/x.test.ts"]).type, "product");
  assert.equal(typeOfWork(MAP, ["sol/engine/src/team/tonight.ts", "sol/release", "sol/mac/src/cowork/Night.tsx"]).type, "internal");
  assert.equal(typeOfWork(MAP, ["site/index.html", "site/text.css", "GLOSSARY.md"]).type, "marketing");
  assert.equal(typeOfWork(MAP, ["site/index.html", "sol/engine/src/work/runs.ts"]).type, "product", "a tie");
  assert.equal(typeOfWork(MAP, ["now.md"]).type, "internal");
  assert.equal(typeOfWork(MAP, []).type, "internal");
  const t = typeOfWork(MAP, ["sol/engine/src/work/copies.ts", "sol/engine/src/work/runs.ts"]);
  assert.match(t.why, /^2 of 2 files product \((side-copies, session|session, side-copies)\)$/);
  assert.deepEqual(t.features.sort(), ["fr-07", "fr-08"]);
});

test("title and labels: the type as the first word and the one type label, type: and all", () => {
  assert.equal(titled("Night buttons (#477)", "internal"), "internal: Night buttons (#477)");
  assert.equal(titled("product: Night buttons", "internal"), "internal: Night buttons");
  assert.equal(titled("Marketing:  the site", "marketing"), "marketing: the site");
  assert.equal(typeSaid({ title: "x", labels: ["cowork", "type:internal"] }), "internal");
  assert.equal(typeSaid({ title: "marketing: x", labels: [] }), "marketing");
  assert.equal(typeSaid({ title: "x", labels: ["type:product", "type:internal"] }), "", "two type labels say nothing");
  assert.equal(typeSaid({ title: "x", labels: ["product"] }), "", "the area label product is no type of work");
  assert.equal(moveOf({ number: 1, title: "internal: x", labels: ["type:internal", "cowork"] }, "internal"), null);
  assert.deepEqual(moveOf({ number: 1, title: "x", labels: ["type:product", "cowork"] }, "internal"), { type: "internal", add: "type:internal", remove: ["type:product"], title: "internal: x" });
  assert.deepEqual(moveOf({ number: 1, title: "x", labels: ["product", "cowork"] }, "internal"), { type: "internal", add: "type:internal", remove: [], title: "internal: x" }, "the area label product is never taken off (B1)");
  assert.match(missingLabel(new Error("could not add label: 'type:product' not found"), "type:product"), /not on GitHub yet/);
  assert.equal(missingLabel(new Error("HTTP 502"), "type:product"), "HTTP 502");
});

test("proposals: the one feature sharing the deepest folder, else a lead decides; the agent's lines read", () => {
  const small = featuresIn({ features: [F("fr-10", "notch", "product", ["sol/mac/src/notch/*.tsx"]), F("fr-11", "anticipate", "product", ["sol/engine/src/anticipate.ts"]), F("fr-12", "grab", "product", ["sol/engine/src/grab.ts"])] });
  assert.equal(proposeFor(small, "sol/mac/src/notch/lib/moon.ts").feature, "fr-10");
  assert.equal(proposeFor(small, "sol/engine/src/voice.ts").feature, "", "two features share that folder: a lead decides");
  assert.equal(proposeFor(MAP, "sol/phone/x.swift").feature, "", "only sol/ in common: no proposal");
  const said = agentProposals("sol/phone/x.swift -> fr-07\n- `sol/a.ts` -> fr-99\nnoise\nsol/other.ts -> none", ["sol/phone/x.swift", "sol/a.ts"], MAP);
  assert.deepEqual(said, [{ path: "sol/phone/x.swift", feature: "fr-07", name: "session", by: "agent" }]);
});

// GitHub: the PR list, each PR's view and edits, kept as GitHub would keep them
function fakeGh(prs: { number: number; title: string; labels: { name: string }[]; files: { path: string }[] }[], o: { refuse?: number[] } = {}) {
  const calls: string[][] = [];
  const state = new Map(prs.map((p) => [p.number, { ...p, labels: p.labels.map((l) => l.name) }]));
  const gh = async (args: string[]) => {
    calls.push(args);
    if (args[1] === "list") return JSON.stringify([...state.values()].map((p) => ({ ...p, labels: p.labels.map((name) => ({ name })) })));
    const p = state.get(Number(args[2]));
    if (!p) throw new Error("no such PR");
    if (args[1] === "view") return JSON.stringify({ number: p.number, title: p.title, labels: p.labels.map((name) => ({ name })), files: p.files });
    if (args[1] === "edit") {
      if (o.refuse?.includes(p.number)) throw new Error("GraphQL: refused");
      for (let i = 3; i < args.length; i += 2) {
        if (args[i] === "--title") p.title = args[i + 1];
        if (args[i] === "--add-label" && !p.labels.includes(args[i + 1])) p.labels.push(args[i + 1]);
        if (args[i] === "--remove-label") p.labels = p.labels.filter((l) => l !== args[i + 1]);
      }
    }
    return "";
  };
  return { gh, calls, pr: (n: number) => state.get(n)! };
}
// the project's record (the kit's store), in memory; `fail` makes the next writes refused
const ghError = (full: string) => Object.assign(new Error(full.split("\n")[0]), { full });
function fakeRecord() {
  const on = new Map<string, { text: string; sha: string }>();
  let puts = 0, fail = false, author = "marco";
  const log: string[] = [], commits: { sha: string; message: string; author: string }[] = [];
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => { const f = on.get(path); if (!f) throw ghError("gh: Not Found (HTTP 404)"); return JSON.stringify({ sha: f.sha, content: Buffer.from(f.text).toString("base64") }); },
    putBody: async (_r: string, path: string, w: { content: string; message: string }) => {
      if (fail) throw ghError("gh: Resource not accessible by integration (HTTP 403)");
      on.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${++puts}` }); log.push(w.message); commits.unshift({ sha: `c${puts}`, message: w.message, author }); return "";
    },
  } } as any;
  // writers: GitHub's commits on the file, newest first, each with its author's login (`as` sets who pushes next)
  return { things: { record: () => rec }, file: () => parseResorts(on.get(RESORTS_PATH)?.text ?? ""), log, refuse: (v: boolean) => { fail = v; }, as: (who: string) => { author = who; }, writers: async () => [...commits] };
}
let rn = 0;
const fresh = () => { resortsStore.forget(); return `sol-mif/record-${++rn}`; };
const devs = async () => ["marco", "frank"];
const PRS = [
  { number: 470, title: "Night buttons (#477)", labels: [{ name: "cowork" }], files: [{ path: "sol/engine/src/team/tonight.ts" }, { path: "sol/release" }] },
  { number: 471, title: "product: The site's footer", labels: [{ name: "type:product" }, { name: "product" }], files: [{ path: "site/index.html" }] },
  { number: 472, title: "product: Copies", labels: [{ name: "type:product" }], files: [{ path: "sol/engine/src/work/copies.ts" }] },
  { number: 473, title: "A new thing", labels: [], files: [{ path: "sol/phone/x.swift" }, { path: "now.md" }] },
];
function checkout(): string {
  const root = mkdtempSync(join(tmpdir(), "resort-"));
  mkdirSync(join(root, "specs"));
  writeFileSync(join(root, FEATURES_PATH), JSON.stringify({ version: 1, features: MAP }));
  return root;
}

test("the re-sort writes its record first, moves what is wrong, and the undo puts back exactly that", async () => {
  const root = checkout(), { gh, calls, pr } = fakeGh(PRS), rec = fakeRecord(), record = fresh();
  const now = () => new Date("2026-10-31T07:00:00Z");
  // the record is written before the first PR is touched
  const order: string[] = [];
  const gh2 = async (a: string[]) => { if (a[1] === "edit") order.push(`edit ${a[2]} (record has ${rec.file().runs.length})`); return gh(a); };
  const r = await resort({ gh: gh2, root, record, things: rec.things, by: "marco", devs, now });
  assert.deepEqual(order, ["edit 470 (record has 1)", "edit 471 (record has 1)", "edit 473 (record has 1)"]);
  assert.deepEqual(rec.log, ["features: the re-sort 20261031-0700 by marco, 3 PRs to move", "features: the re-sort 20261031-0700, 3 PRs moved"]);
  assert.deepEqual(r.moves.map((m) => [m.pr, m.to.add, !!m.done]), [[470, "type:internal", true], [471, "type:marketing", true], [473, "type:product", true]]);
  assert.match(calls[0].join(" "), /pr list --state all --search updated:>=2026-10-30/);
  assert.deepEqual(calls.find((c) => c[1] === "edit" && c[2] === "471"), ["pr", "edit", "471", "--title", "marketing: The site's footer", "--add-label", "type:marketing", "--remove-label", "type:product"]);
  assert.deepEqual(pr(471).labels, ["product", "type:marketing"], "the area label product stays");
  assert.deepEqual(r.proposals, [{ path: "sol/phone/x.swift", feature: "", name: "", by: "none" }]);
  assert.equal(resortLine(r, record), `3 PRs moved · 1 file no feature claims · undo: SOL_RECORD=${record} bash sol/features --undo 20261031-0700`);
  assert.equal((await lastResort(rec.things, record))?.id, "20261031-0700", "every Sol developer's Sol reads it from the project's record");

  // someone renames #473 by hand after the run: the undo leaves it and says so
  pr(473).title = "product: A new thing, renamed";
  calls.length = 0;
  const u = await undo({ gh, record, things: rec.things, by: "frank", devs, writers: rec.writers }, "last");
  assert.ok(!("error" in u));
  assert.deepEqual([u.back, u.already, u.left], [[470, 471], [], [473]]);
  assert.deepEqual(calls.find((c) => c[1] === "edit" && c[2] === "471"), ["pr", "edit", "471", "--title", "product: The site's footer", "--add-label", "type:product", "--remove-label", "type:marketing"]);
  assert.deepEqual(calls.find((c) => c[1] === "edit" && c[2] === "470"), ["pr", "edit", "470", "--title", "Night buttons (#477)", "--remove-label", "type:internal"]);
  assert.ok(!calls.some((c) => c[1] === "edit" && c[2] === "473"));
  assert.equal(pr(471).title, "product: The site's footer");
  assert.deepEqual([...pr(471).labels].sort(), ["product", "type:product"]);
  assert.match(resortLine(rec.file().runs[0]), /· undone by frank$/);
  assert.deepEqual(rec.file().kept, [470, 471, 473]);
  assert.deepEqual(await undo({ gh, record, things: rec.things, by: "marco", devs, writers: rec.writers }, "20261031-0700"), { error: "run 20261031-0700 was undone already" });

  // the person's word stands: a PR whose move was undone is never moved again, by any Sol reading the record
  calls.length = 0;
  const again = await resort({ gh, root, record, things: rec.things, by: "marco", devs, now: () => new Date("2026-11-01T07:00:00Z") });
  assert.deepEqual(again.moves, []);
  assert.equal(resortLine(again), "no PR moved · 1 file no feature claims");
});

test("no record that can be read and written first: nothing is moved", async () => {
  const root = checkout(), { gh, calls } = fakeGh(PRS);
  await assert.rejects(resort({ gh, root, record: "", things: null }), /set SOL_RECORD/);
  const rec = fakeRecord(), record = fresh();
  rec.refuse(true);
  await assert.rejects(resort({ gh, root, record, things: rec.things, by: "marco", devs }), /couldn't write the re-sort's record in .* first, so nothing is moved/);
  assert.ok(!calls.some((c) => c[1] === "edit"), "no PR touched");
});

test("a run cut off after its record: the undo checks each PR and puts back only what the run set", async () => {
  const root = checkout(), { gh, pr } = fakeGh(PRS, { refuse: [473] }), rec = fakeRecord(), record = fresh();
  // the second write (which landed) is refused: the record still says every planned move, state "moving"
  let writes = 0;
  const things = { record: () => ({ files: { ...rec.things.record().files, putBody: async (...a: unknown[]) => { if (++writes > 1) throw ghError("gh: Server Error (HTTP 500)"); return (rec.things.record().files.putBody as any)(...a); } } }) } as any;
  const r = await resort({ gh, root, record, things, by: "marco", devs, now: () => new Date("2026-10-31T07:00:00Z") });
  assert.equal(r.state, "moving");
  assert.equal(rec.file().runs[0].state, "moving");
  assert.equal(rec.file().runs[0].moves.length, 3, "all three planned moves are in the record");
  assert.match(resortLine(rec.file().runs[0]), /3 PRs moved \(the run stopped before it said which landed\)/);
  assert.equal(pr(473).title, "A new thing", "#473's edit was refused: it never moved");
  assert.deepEqual(r.moves.map((m) => [m.pr, !!m.done]), [[470, true], [471, true], [473, false]], "what landed, said even when the record could not be told");
  const early = await undo({ gh, record, things: rec.things, by: "marco", devs, writers: rec.writers, now: () => new Date("2026-10-31T07:05:00Z") }, "20261031-0700");
  assert.match((early as { error: string }).error, /still moving PRs/);
  const u = await undo({ gh, record, things: rec.things, by: "marco", devs, writers: rec.writers, now: () => new Date("2026-10-31T07:30:00Z") }, "20261031-0700");
  assert.ok(!("error" in u));
  assert.deepEqual([u.back, u.already, u.left], [[470, 471], [473], []]);
  assert.equal(pr(470).title, "Night buttons (#477)");
});

test("a tampered record: a foreign label, a changed title, an unknown author, a person who is no Sol developer", async () => {
  const root = checkout(), rec = fakeRecord(), record = fresh();
  // only a Sol developer runs the re-sort or undoes one; who they are unknown: nobody does
  const { gh, calls, pr } = fakeGh(PRS);
  await assert.rejects(resort({ gh, root, record, things: rec.things, by: "mallory", devs }), /only the project's Sol developers may run the re-sort, and mallory is not one/);
  await assert.rejects(resort({ gh, root, record, things: rec.things, by: "marco", devs: async () => null }), /couldn't tell who the project's Sol developers are/);
  assert.deepEqual(rec.log, [], "nothing written");
  await resort({ gh, root, record, things: rec.things, by: "marco", devs, now: () => new Date("2026-10-31T07:00:00Z") });
  assert.deepEqual((await undo({ gh, record, things: rec.things, by: "mallory", devs, writers: rec.writers }, "last") as { error: string }).error, "only the project's Sol developers may undo a re-sort, and mallory is not one (marco, frank)");

  // someone with write access to the record edits it by hand
  const f = rec.file(), run = f.runs[0];
  const forged = { ...run, id: "20261031-0800", by: "marco", undone: undefined, moves: [
    // a foreign label to add back, and an area label to take off: only type: labels survive
    { pr: 471, was: { title: "product: The site's footer", labels: ["type:product", "admin", "product"] }, to: { title: "marketing: The site's footer", type: "marketing", add: "type:marketing", remove: ["product", "cowork"] }, why: "" },
    // a title the run never set: no move
    { pr: 470, was: { title: "Owned by mallory", labels: [] }, to: { title: "internal: Night buttons (#477)", type: "internal", add: "type:internal", remove: [] }, why: "" },
    // a label to add that is not the type's: no move
    { pr: 473, was: { title: "A new thing", labels: [] }, to: { title: "product: A new thing", type: "product", add: "admin", remove: [] }, why: "" },
  ] };
  const fromMallory = { ...forged, id: "20261031-0900", by: "mallory" };
  const text = JSON.stringify({ v: 1, kept: [], runs: [run, forged, fromMallory] });
  const parsed = parseResorts(text);
  assert.deepEqual(parsed.runs[1].moves.map((m) => [m.pr, m.was.labels, m.to.remove]), [[471, ["type:product"], []]], "only type: labels and moves the run could have made");
  // (a Sol developer wrote this one, so GitHub's commits trust it: what is checked here is the record's content)
  rec.as("frank");
  await (rec.things.record().files.putBody as any)("x", RESORTS_PATH, { content: Buffer.from(text).toString("base64"), message: "features: the re-sort 20261031-0800 by marco, 3 PRs to move" });
  rec.as("marco");
  resortsStore.forget();
  assert.deepEqual(await undo({ gh, record, things: rec.things, by: "frank", devs, writers: rec.writers }, "20261031-0900"), { error: "run 20261031-0900 is not undone: the record says mallory made it, and only a run by one of the project's Sol developers is put back" });
  calls.length = 0;
  const u = await undo({ gh, record, things: rec.things, by: "frank", devs, writers: rec.writers }, "20261031-0800");
  assert.ok(!("error" in u));
  assert.deepEqual(u.back, [471]);
  const edits = calls.filter((c) => c[1] === "edit");
  assert.deepEqual(edits, [["pr", "edit", "471", "--title", "product: The site's footer", "--add-label", "type:product", "--remove-label", "type:marketing"]]);
  assert.ok(!edits.flat().some((a) => ["admin", "product", "cowork"].includes(a)), "never a label that is not a type");
  assert.equal(pr(470).title, "internal: Night buttons (#477)", "#470 keeps its title: the record's old one was never what the run set");

  // a forged by: the record says marco made the run, but GitHub says mallory pushed it (or wrote the file since)
  const forgedBy = { ...run, id: "20261031-1000", by: "marco", undone: undefined };
  const f2 = rec.file();
  rec.as("mallory");
  await (rec.things.record().files.putBody as any)("x", RESORTS_PATH, { content: Buffer.from(JSON.stringify({ ...f2, runs: [...f2.runs, forgedBy] })).toString("base64"), message: `features: the re-sort 20261031-1000 by marco, 3 PRs to move` });
  rec.as("marco");
  resortsStore.forget();
  calls.length = 0;
  const no = await undo({ gh, record, things: rec.things, by: "frank", devs, writers: rec.writers }, "20261031-1000");
  assert.match((no as { error: string }).error, /^run 20261031-1000 is not undone: the record was written since by mallory \(c\d+\), who is not one of the project's Sol developers/);
  assert.ok(!calls.some((c) => c[1] === "edit"), "nothing put back");
  assert.match((await undo({ gh, record, things: rec.things, by: "frank", devs, writers: async () => null }, "20261031-1000") as { error: string }).error, /GitHub did not say who wrote the record/);
  assert.match((await undo({ gh, record, things: rec.things, by: "frank", devs }, "20261031-1000") as { error: string }).error, /GitHub did not say who wrote the record/, "no way to ask GitHub: no undo");
  // the PR's title changed since the run: left as it is, and said
  pr(472).title = "product: Copies";
  const m = { pr: 9, was: { title: "Copies", labels: [] }, to: { title: "internal: Copies", type: "internal" as const, add: "type:internal", remove: [] }, why: "" };
  assert.equal(stateOf({ title: "internal: Copies, by hand", labels: ["type:internal"] }, m), "changed");
});

test("the Sol developers the CLI trusts: GitHub's, the record's settings first, else CODEOWNERS and the rhythm", async () => {
  const files: Record<string, string> = {
    "o/code/.github/CODEOWNERS": "# label base: x\n/sol/engine/  @marco\n# label social: y\n# leads: @isaac\n",
    "o/code/.sol/rhythm.json": JSON.stringify({ dev: ["marco"], beta: ["frank"] }),
  };
  const gh = async (a: string[]) => { const k = a[1].replace(/^repos\//, "").replace("/contents/", "/"); if (k in files) return files[k]; throw new Error("gh: Not Found (HTTP 404)"); };
  assert.deepEqual(await devsOnGithub(gh, "o/record", "o/code"), ["marco", "isaac", "frank"]);
  files["o/record/.sol/project.json"] = JSON.stringify({ v: 1, owners: { base: ["marco"] }, rhythm: { dev: ["marco"], beta: ["marco"] } });
  assert.deepEqual(await devsOnGithub(gh, "o/record", "o/code"), ["marco"], "the record's settings win");
  assert.equal(await devsOnGithub(async () => { throw new Error("HTTP 502"); }, "o/record", "o/code"), null, "not read: nobody");
});

test("the line counts only what landed once the run says so", () => {
  const mv = (pr: number, done: boolean) => ({ pr, was: { title: "x", labels: [] }, to: { title: "internal: x", type: "internal" as const, add: "type:internal", remove: [] }, why: "", ...(done ? { done: true as const } : {}) });
  assert.equal(resortLine({ id: "20261031-0700", state: "moved", moves: [mv(1, true), mv(2, false), mv(3, false)], proposals: [] }), "1 PR moved (2 not: GitHub refused) · undo: bash sol/features --undo 20261031-0700");
  assert.equal(resortLine({ id: "20261031-0700", state: "moved", moves: [mv(1, false)], proposals: [] }), "no PR moved (1 not: GitHub refused)");
});

test("the record's file: made valid, runs kept to the last 60, the kept PRs never dropped", () => {
  assert.deepEqual(parseResorts("{ nope"), { v: 1, runs: [], kept: [] });
  assert.equal(parseResorts(JSON.stringify({ v: 2, runs: [], kept: [] })).newer, true);
  const f = parseResorts(JSON.stringify({ v: 1, kept: [3, 3, -1, "x"], runs: [{ id: "bad" }, { id: "20261031-0700", at: "x", by: "m", state: "moved", moves: [{ pr: 1, was: { title: "a", labels: [] }, to: { title: "b", type: "nope", add: "type:x" } }], proposals: [] }] }));
  assert.deepEqual(f.kept, [3]);
  assert.equal(f.runs.length, 1);
  assert.deepEqual(f.runs[0].moves, [], "a move with no type of work is dropped");
  let g = parseResorts("");
  for (let i = 0; i < 65; i++) g = applyResorts(g, { start: { id: `20261031-${String(i).padStart(4, "0")}`, at: "", by: "", state: "moved", moves: [], proposals: [] } }).file;
  assert.equal(g.runs.length, 60);
  assert.equal(applyResorts(g, { start: g.runs[0] }).error, `a run ${g.runs[0].id} is in the record already`);
  const m = { pr: 9, was: { title: "x", labels: ["type:product"] }, to: { title: "internal: x", type: "internal" as const, add: "type:internal", remove: ["type:product"] }, why: "" };
  assert.equal(stateOf({ title: "x", labels: ["type:product", "cowork"] }, m), "as-was");
  assert.equal(stateOf({ title: "internal: x", labels: ["type:internal"] }, m), "as-moved");
  assert.equal(stateOf({ title: "internal: x", labels: ["type:internal", "type:product"] }, m), "changed");
});

test("a dry run moves nothing and writes no record", async () => {
  const root = checkout(), { gh, calls } = fakeGh(PRS), rec = fakeRecord(), record = fresh();
  const r = await resort({ gh, root, record, things: rec.things }, { dryRun: true });
  assert.equal(r.moves.length, 3);
  assert.equal(calls.length, 1);
  assert.deepEqual(rec.log, []);
  const noRecord = await resort({ gh, root, record: "", things: null }, { dryRun: true });
  assert.equal(noRecord.moves.length, 3, "a dry run needs no record");
  const p = planResort(MAP, PRS.map((x) => ({ number: x.number, title: x.title, labels: x.labels.map((l) => l.name), files: x.files.map((f) => f.path) })), new Set([470]));
  assert.ok(!p.moves.some((m) => m.pr === 470));
});

test("the agent pass: its proposals win over the folders' guess", async () => {
  const root = checkout(), { gh } = fakeGh(PRS);
  const r = await resort({ gh, root, record: "", things: null, agent: async (prompt) => { assert.match(prompt, /sol\/phone\/x\.swift/); return "sol/phone/x.swift -> fr-07"; } }, { dryRun: true });
  assert.deepEqual(r.proposals, [{ path: "sol/phone/x.swift", feature: "fr-07", name: "session", by: "agent" }]);
});

test("Sol developers: the leads and reviewers the project's settings name", () => {
  assert.deepEqual(devsIn({ base: ["marco"], cowork: ["marco", "frank"] }, { dev: ["Marco"], beta: ["frank", "isaac"] }), ["marco", "frank", "isaac"]);
  assert.deepEqual(devsIn({}, { dev: [], beta: [] }), []);
});

test("the devs gate: a member who is also a Sol developer, else shut", async () => {
  const w = cleanTool({ page: "features", owner: "marco", gate: "devs", reads: [{ what: "the map", from: "the checkout" }] });
  assert.equal(w?.gate, "devs");
  assert.equal(cleanTool({ page: "x", owner: "marco", gate: "anyone", reads: [{ what: "a", from: "b" }] }), null);
  defineTool("features-t", async () => ({ ok: 1 }));
  const views = [{ id: "features-t", kind: "tool", name: "features", shows: "", does: [], agents: [], start: "on" as const, with: w!, live: true, from: "code" as const, known: true }];
  assert.ok(!("error" in gate("features-t", views, "frank", ["frank", "marco"], ["marco", "Frank"])));
  const no = gate("features-t", views, "isaac", ["frank", "marco", "isaac"], ["marco", "frank"]);
  assert.ok("error" in no && no.gate === "devs" && /Sol developers only/.test(no.error));
  assert.equal((gate("features-t", views, "frank", ["frank"], null) as { gate: string }).gate, "devs", "none known: shut");
  const open = await openTool({ id: "features-t", views, me: "isaac", members: async () => ["isaac"], devs: async () => ["marco"], ctx: { key: "k", zone: "", refresh: false } });
  assert.ok("error" in open && !("data" in open));
  const yes = await openTool({ id: "features-t", views, me: "marco", members: async () => ["marco"], devs: async () => ["marco"], ctx: { key: "k", zone: "", refresh: false } });
  assert.deepEqual((yes as { data: unknown }).data, { ok: 1 });
});

test("your area: the features a lead leads, counted by approved evals", async () => {
  const root = checkout();
  const fs = featuresIn({ features: MAP });
  assert.deepEqual(areaOf(fs, { work: ["isaac"] }, "marco").map((f) => f.id), ["fr-07", "fr-08", "fr-27"]);
  assert.deepEqual(areaOf(fs, { work: ["isaac"] }, "isaac").map((f) => f.id), ["fr-07", "fr-08", "fr-26"], "the table's first lead of a label, or the map's lead");
  assert.equal(areaLine([]), "");
  assert.equal(areaLine([{ id: "fr-01", name: "Open Sol", evals: "approved" }]), "your area: 1 of 1 feature has evals");
  const f7 = fs.find((f) => f.id === "fr-07")!;
  mkdirSync(join(root, folderOf(f7)), { recursive: true });
  writeFileSync(join(root, folderOf(f7), "eval.md"), "# fr-07\n\nStatus: Approved by marco on 2026-11-02\n");
  mkdirSync(join(root, "sol", "engine"), { recursive: true });
  assert.equal(mapRoot(join(root, "sol", "engine")), root);
  assert.equal(mapRoot(mkdtempSync(join(tmpdir(), "nomap-"))), "");

  useArea({ me: () => "marco", read: async () => ({ me: "marco", owners: {}, devs: ["marco"] }) });
  await areaSettled();
  assert.equal(areaLineFor(join(root, "sol", "engine")), "your area: 1 of 3 features have evals (still without: fr-08 side-copies, fr-27 the-nights)");
  assert.equal(areaLineFor(mkdtempSync(join(tmpdir(), "elsewhere-"))), "", "no map, no line: a Sol tester's copy or any other repo");
  useArea({ me: () => "isaac", read: async () => ({ me: "isaac", owners: {}, devs: ["marco"] }) });
  await areaSettled();
  assert.equal(areaLineFor(root), "", "a person the settings do not name gets no line");

  const d = featuresData(root, { work: ["marco"] });
  assert.equal(d.features.find((f) => f.id === "fr-07")?.evals, "approved");
  assert.equal(d.features.find((f) => f.id === "fr-08")?.evals, "none");
  assert.equal(d.resort, null);
  const run = { id: "20261031-0700", at: "2026-10-31T07:00:00Z", by: "marco", state: "moved" as const, moves: [{ pr: 1, was: { title: "x", labels: [] }, to: { title: "internal: x", type: "internal" as const, add: "type:internal", remove: [] }, why: "", done: true as const }], proposals: [] };
  const withRun = featuresData(root, {}, { run, record: "sol-mif/sol-dev" });
  assert.deepEqual(withRun.resort, { line: "1 PR moved · undo: SOL_RECORD=sol-mif/sol-dev bash sol/features --undo 20261031-0700", at: run.at, undo: "SOL_RECORD=sol-mif/sol-dev bash sol/features --undo 20261031-0700" });
});
