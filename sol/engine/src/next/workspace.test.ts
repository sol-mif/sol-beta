// Workspace changes (next/workspace.ts, parts/next-workspace.ts; #1615 BR1), on a temp SOL_HOME with real Home folders and
// stickies.md files and a temp Build state: a preview changes nothing; a keep applies only the accepted operations, all
// or none, and refuses a stale plan; nothing of the person's is replaced; undo takes back only what the keep made and
// refuses over the person's later work; discard touches nothing; the kinds Sol can't make yet are refused at keep until
// skipped. With ui.next off the part answers nothing and writes nothing; another connection is refused.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-ws-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
process.env.SOL_STATE = join(tmp, "work.json");
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });
const W = await import("./workspace.js");
const St = await import("../agent/stickies.js");
const { workState, groupOp, mark } = await import("../work/state.js");
const part = (await import("../parts/next-workspace.js")).default;

let n = 0;
/** a Sol home with one Home folder, "notes", holding the person's reviewed context as a sticky */
const home = () => {
  const h = join(tmp, `h${++n}`);
  mkdirSync(join(h, "notes"), { recursive: true });
  St.change(join(h, "notes"), (l) => St.make(l, "Project context — the facts I keep for this project"));
  return h;
};
const ctx = { kind: "sticky", folder: "notes", key: "Project context" } as const;
const spec = () => ({
  title: "A place for the trip", reason: "Keep the trip's notes and list together",
  evidence: [{ ref: ctx, claim: "You keep project facts in one note", type: "inference" }],
  operations: [
    { key: "trip", op: "create_folder", name: "Trip", type: "home", reason: "Keep this together" },
    { key: "brief", op: "create_piece", kind: "note", region: "$trip", name: "Brief", text: "What the trip is for", reason: "Make the agreed context usable" },
    { key: "pack", op: "create_piece", kind: "checklist", region: "$trip", name: "Packing", items: ["Passport", "Charger"], reason: "Nothing forgotten" },
  ],
});
const ok = <T,>(r: { ok: true } & T | { ok: false; why: string }): T => { assert.ok(r.ok, (r as { why?: string }).why); return r as T; };
const files = (h: string) => JSON.stringify(readdirSync(h, { recursive: true }).sort().map((f) => [f, String(f).endsWith(".md") ? readFileSync(join(h, String(f)), "utf8") : ""]).filter(([f]) => !String(f).startsWith("next")));
const titles = (h: string, folder: string) => St.read(join(h, folder)).items.map((x) => x.t);

test("a preview changes nothing; a keep applies only what was accepted, with the person's corrections; undo takes it back", () => {
  const h = home(), before = files(h);
  const { plan } = ok(W.propose(h, spec(), "a conversation"));
  assert.equal(plan.source, "a conversation");
  assert.equal(plan.evidence[0].label, "Project context");
  const { preview } = ok(W.preview(h, plan.id));
  assert.equal(preview.ready, true);
  assert.equal(preview.says, "Nothing changes until you keep it.");
  assert.deepEqual(preview.rows.map((r) => r.says), ["Make the Home folder “Trip”", "Add the note “Brief”", "Add the checklist “Packing” (2 items)"]);
  assert.equal(files(h), before, "a preview writes nothing");
  const kept = ok(W.keep(h, plan.id, { revision: 1, decisions: [{ key: "brief", patch: { name: "My brief", text: "Corrected by me" } }, { key: "pack", keep: false }] })).plan;
  assert.equal(kept.status, "kept");
  assert.deepEqual(titles(h, "Trip"), ["My brief"]);
  assert.equal(St.read(join(h, "Trip")).items[0].s, "Corrected by me");
  assert.deepEqual(kept.decisions, [{ key: "pack", keep: false }, { key: "brief", patch: { name: "My brief", text: "Corrected by me" } }]);
  ok(W.undo(h, plan.id));
  assert.equal(existsSync(join(h, "Trip")), false, "the folder it made is gone");
  assert.equal(files(h), before, "and nothing else moved");
  assert.equal(W.plansOf(h)[0].status, "undone");
});

test("a skipped folder its pieces need, or a malformed change, applies nothing", () => {
  const h = home(), { plan } = ok(W.propose(h, spec())), before = files(h);
  const r = W.keep(h, plan.id, { revision: 1, decisions: [{ key: "trip", keep: false }] });
  assert.equal(r.ok, false);
  assert.match((r as { why: string }).why, /folder it goes in was skipped/);
  assert.equal(files(h), before);
  assert.match((W.propose(h, { operations: [{ key: "unsafe", op: "run_command", reason: "Run something" }] }) as { why: string }).why, /doesn't make that kind of change/);
  assert.match((W.propose(h, { ...spec(), evidence: [{ ref: { kind: "sticky", folder: "notes", key: "not real" } }] }) as { why: string }).why, /isn't in your Sol/);
  assert.match((W.propose(h, { operations: [{ key: "a", op: "create_folder", name: "A", type: "home" }] }) as { why: string }).why, /reason/);
  assert.equal(existsSync(W.workspaceFile(h)), true);
  assert.equal(W.plansOf(h).length, 1, "a refused proposal is not stored");
});

test("evidence that changed since makes the plan stale: preview and keep refuse, nothing written", () => {
  const h = home(), { plan } = ok(W.propose(h, spec()));
  St.change(join(h, "notes"), (l) => St.edit(l, "Project context", "Project context", "revised facts"));
  const before = files(h);
  const p = ok(W.preview(h, plan.id)).preview;
  assert.equal(p.ready, false);
  assert.match(p.why!, /changed since/);
  assert.match((W.keep(h, plan.id, { revision: 1 }) as { why: string }).why, /changed since/);
  assert.equal(files(h), before);
});

test("a keep needs the revision reviewed; an update needs its sticky unchanged; undo refuses over later edits", () => {
  const h = home(), { plan } = ok(W.propose(h, { operations: [{ key: "edit", op: "update_piece", ref: ctx, name: "Context", reason: "A shorter title" }] }));
  assert.match((W.keep(h, plan.id, { revision: 7 }) as { why: string }).why, /changed since you looked/);
  St.change(join(h, "notes"), (l) => St.done(l, "Project context", true));
  assert.match((W.keep(h, plan.id, { revision: 1 }) as { why: string }).why, /changed since this was suggested/);
  const h2 = home(), p2 = ok(W.propose(h2, spec())).plan;
  ok(W.keep(h2, p2.id, { revision: 1 }));
  St.change(join(h2, "Trip"), (l) => St.edit(l, "Brief", "Brief", "my own words now"));
  const before = files(h2);
  assert.match((W.undo(h2, p2.id) as { why: string }).why, /edited or moved since/);
  assert.equal(files(h2), before, "a refused undo writes nothing");
});

test("an update kept and undone, field by field: the person's other edits stand", () => {
  const h = home();
  St.change(join(h, "notes"), (l) => St.make(l, "Other — untouched"));
  const { plan } = ok(W.propose(h, { operations: [{ key: "edit", op: "update_piece", ref: ctx, text: "the facts, sharper", reason: "Clearer" }] }));
  ok(W.keep(h, plan.id, { revision: 1 }));
  assert.equal(St.read(join(h, "notes")).items[0].s, "the facts, sharper");
  St.change(join(h, "notes"), (l) => St.edit(l, "Other", "Other", "edited by me"));
  ok(W.undo(h, plan.id));
  assert.deepEqual(St.read(join(h, "notes")).items.map((x) => [x.t, x.s]), [["Project context", "the facts I keep for this project"], ["Other", "edited by me"]]);
});

test("new work in a folder it made stops the undo; discard touches nothing and the plan is closed", () => {
  const h = home(), { plan } = ok(W.propose(h, spec()));
  ok(W.keep(h, plan.id, { revision: 1 }));
  St.change(join(h, "Trip"), (l) => St.make(l, "Book the train"));
  assert.match((W.undo(h, plan.id) as { why: string }).why, /other stickies/);
  St.change(join(h, "Trip"), (l) => ({ items: l.filter((x) => x.t !== "Book the train") }));
  writeFileSync(join(h, "Trip", "tickets.pdf"), "x");
  assert.match((W.undo(h, plan.id) as { why: string }).why, /holds other work/);
  const h2 = home(), q = ok(W.propose(h2, spec())).plan, before = files(h2);
  const d = ok(W.discard(h2, q.id)).plan;
  assert.equal(d.status, "discarded");
  assert.equal(files(h2), before);
  assert.match((W.keep(h2, q.id, { revision: d.revision }) as { why: string }).why, /answered already/);
});

test("nothing of the person's is replaced: a taken folder name or sticky title is refused, never written over", () => {
  const h = home();
  mkdirSync(join(h, "Trip"));
  St.change(join(h, "Trip"), (l) => St.make(l, "Brief — mine"));
  const r = W.propose(h, spec());
  assert.match((r as { why: string }).why, /already have a folder named “Trip”/);
  const s = ok(W.propose(h, { operations: [{ key: "n", op: "create_piece", kind: "note", region: "notes", name: "Second", text: "beside", reason: "Beside yours" }] })).plan;
  St.change(join(h, "notes"), (l) => St.make(l, "Second — the person's own"));
  assert.match((W.keep(h, s.id, { revision: 1 }) as { why: string }).why, /already a sticky "Second"/);
  assert.equal(St.read(join(h, "notes")).items.find((x) => x.t === "Second")!.s, "the person's own");
  assert.equal(St.read(join(h, "Trip")).items[0].s, "mine");
});

test("the kinds Sol can't make yet are kept as suggestions and refused at keep until skipped", () => {
  const h = home(), sp = spec();
  sp.operations.push({ key: "chat", op: "create_piece", kind: "session", region: "$trip", name: "Plan the trip", reason: "A conversation to start from" } as never);
  sp.operations.push({ key: "tool", op: "create_piece", kind: "custom-tool", region: "$trip", name: "Budget", reason: "Add up costs" } as never);
  const { plan } = ok(W.propose(h, sp));
  assert.deepEqual(plan.operations.filter((o) => o.cant).map((o) => o.key), ["chat", "tool"]);
  const p = ok(W.preview(h, plan.id)).preview;
  assert.equal(p.ready, false);
  assert.equal(p.rows.find((r) => r.key === "chat")!.cant, "Sol can't make this kind yet. Skip it to keep the rest.");
  const before = files(h);
  assert.match((W.keep(h, plan.id, { revision: 1 }) as { why: string }).why, /can't make this kind yet/);
  assert.equal(files(h), before);
  ok(W.keep(h, plan.id, { revision: 1, decisions: [{ key: "chat", keep: false }, { key: "tool", keep: false }] }));
  assert.deepEqual(titles(h, "Trip"), ["Brief", "Passport", "Charger"]);
});

test("a sticky moved to a new folder and back; a Build folder made and taken back, refused once used", () => {
  const h = home(), { plan } = ok(W.propose(h, { operations: [
    { key: "work", op: "create_folder", name: "Client work", type: "build", reason: "Sessions for this client together" },
    { key: "trip", op: "create_folder", name: "Trip", type: "home", reason: "Its own place" },
    { key: "mv", op: "move_piece", ref: ctx, region: "$trip", reason: "The context belongs with the trip" },
  ] }));
  const kept = ok(W.keep(h, plan.id, { revision: 1 })).plan;
  const gid = kept.applied!.made.find((m) => m.kind === "group")!;
  assert.ok(workState().groups.some((g) => g.id === (gid as { id: string }).id && g.name === "Client work"));
  assert.deepEqual(titles(h, "notes"), []);
  assert.deepEqual(titles(h, "Trip"), ["Project context"]);
  assert.deepEqual(W.foldersOf(kept).sort(), ["Trip", "notes"]);
  ok(W.undo(h, plan.id));
  assert.deepEqual(titles(h, "notes"), ["Project context"]);
  assert.equal(existsSync(join(h, "Trip")), false);
  assert.equal(workState().groups.some((g) => g.id === (gid as { id: string }).id), false);
  // used since: a session filed in the Build folder it made
  const h2 = home(), p2 = ok(W.propose(h2, { operations: [{ key: "w", op: "create_folder", name: "Ops", type: "build", reason: "Ops sessions" }] })).plan;
  const id = (ok(W.keep(h2, p2.id, { revision: 1 })).plan.applied!.made[0] as { id: string }).id;
  mark("session-1", { group: id });
  assert.match((W.undo(h2, p2.id) as { why: string }).why, /was used since/);
  assert.ok(workState().groups.some((g) => g.id === id));
  groupOp("delete", { id });
});

test("the part: off answers nothing and writes nothing; another connection is refused; on, the round trip", async () => {
  const hs = new Map<string, (m: any, h: any) => unknown>(), sent: any[] = [], told: any[] = [];
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const h = home();
  const conn = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send() {}, everyone: (m: object) => told.push(m), face: { send: (m: object) => sent.push(m) }, conn: { chars: 0 }, fromSol, fromApp: fromSol });
  const ask = async (m: any, fromSol = true) => { sent.length = 0; await hs.get(m.type)!(m, conn(fromSol)); return sent.at(-1); };
  process.env.SOL_UI_NEXT = "off";
  assert.equal(await ask({ type: "next.workspace.propose", spec: spec() }), undefined);
  assert.equal(existsSync(W.workspaceFile(h)), false, "off: nothing written");
  process.env.SOL_UI_NEXT = "on";
  assert.deepEqual(await ask({ type: "next.workspace", rid: 1 }, false), { type: "next.workspace", rid: 1, ok: false, why: "only Sol's own windows" });
  const pr = await ask({ type: "next.workspace.propose", rid: 2, spec: spec(), source: "a conversation" });
  assert.equal(pr.ok, true);
  const list = await ask({ type: "next.workspace" });
  assert.equal(list.waiting, 1);
  assert.equal((await ask({ type: "next.workspace.preview", id: pr.plan.id })).preview.ready, true);
  const k = await ask({ type: "next.workspace.keep", id: pr.plan.id, revision: 1 });
  assert.equal(k.ok, true);
  assert.deepEqual(told.filter((m) => m.type === "agent.changed").map((m) => m.folder), ["Trip"]);
  assert.equal((await ask({ type: "next.workspace.undo", id: pr.plan.id })).plan.status, "undone");
  assert.equal((await ask({ type: "next.workspace" })).waiting, 0);
});

test("suggest_setup: an AI's suggestion waits for review, every window asks again, nothing changes; refused while ui.next is off", async () => {
  const T = await import("./workspace-tool.js");
  const h = home(), told: any[] = [];
  T.setWorkspaceTool(h, (m) => told.push(m));
  process.env.SOL_UI_NEXT = "off";
  assert.equal(T.workspaceToolsNow().length, 0);
  assert.ok((await T.runWorkspaceTool("suggest_setup", spec(), h)).isError);
  process.env.SOL_UI_NEXT = "on";
  assert.deepEqual(T.workspaceToolsNow().map((t) => t.name), ["suggest_setup", "what_sol_knows", "open_piece", "take_to_tab", "put_back", "make_automation", "canvas_read", "canvas_place", "canvas_fold", "canvas_arrange", "canvas_open"]);   // with the canvas's three verbs (tabs-tool.ts), a session's automation (automation-tool.ts) and the bar agent's canvas tools (canvas-tool.ts)
  // an agent's move carries its because (one store, #1615): none, refused and nothing stored
  const none = await T.runWorkspaceTool("suggest_setup", { title: spec().title, reason: spec().reason, operations: spec().operations });
  assert.ok(none.isError);
  assert.match(none.content[0].text, /^not suggested: an agent's move carries its because/);
  assert.equal(ok(W.listPlans(h)).plans.length, 0);
  // the session's first turn told it a fact: that key is its because, kept on the plan
  const K = await import("./you-known.js");
  K.rememberTold({ sol: h, user: h }, "s-told", null, [{ k: "talk", fact: "Sol talks to you: plain words", place: null }] as never);
  const r = await T.runWorkspaceTool("suggest_setup", { title: spec().title, reason: spec().reason, operations: spec().operations, because: ["made:up"] }, h, "s-told");
  assert.ok(!r.isError, r.content[0].text);
  assert.deepEqual(ok(W.listPlans(h)).plans[0].because, ["talk"], "a key Sol doesn't know is dropped; the told one stands");
  assert.match(r.content[0].text, /waiting in Settings › Your setup/);
  const plans = ok(W.listPlans(h)).plans;
  assert.equal(plans.length, 1);
  assert.equal(plans[0].status, "proposed");
  assert.equal(plans[0].source, "a conversation");
  assert.ok(!existsSync(join(h, "Trip")), "nothing is made until the person keeps it");
  assert.equal(told.at(-1).type, "next.workspace.changed");
  const bad = await T.runWorkspaceTool("suggest_setup", { title: "x", reason: "y", operations: [] }, h);
  assert.ok(bad.isError);
  assert.match(bad.content[0].text, /^not suggested: /);
});
