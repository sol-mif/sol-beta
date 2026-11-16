// The hand-in session (#420, team/handin.ts): at the rhythm's hand-in hour each developer's Sol opens one session in
// their folder for the project, a list of their own open PRs: what goes in tonight and what is held, with state, clashes
// and what each misses for the review; it asks nothing (#476). Handed in = ready, on the default branch, by the review
// hour, and the 9pm summary says which came in during the hand-in. Only the person's press on the hand-in card (#476)
// hands a change in: the agent may only take one back to draft, where the project lets agents pick (off by default);
// a shell's gh pr ready is refused by the guard.
// GitHub and git are functions that answer from a small made-up repo and write down their arguments; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-handin-")), "work.json");
const H = await import("../src/team/handin.ts");
const T = await import("../src/team/tonight.ts");
const N = await import("../src/team/night.ts");
type Deps = import("../src/team/handin.ts").HandInDeps;

const ME = "marcocyl04-ux", FRANK = "franktsai2008-eng";
const RHYTHM = JSON.stringify({ handIn: "20:00", review: "21:00", release: "09:00", zone: "America/New_York", dev: [ME], beta: [FRANK] });
const body = (tryLine: string, felt = "felt") => `What changed.\n\n**What to try** ${tryLine}\n**Felt or silent:** ${felt}.\n\n— someone's agent`;
const green = [{ status: "COMPLETED", conclusion: "SUCCESS" }];
const OPEN = [
  { number: 430, title: "Onboarding, with skip", url: "https://github.com/o/r/pull/430", body: body("Open Cowork fresh; press skip."), isDraft: false, headRefName: "marco/a-430", baseRefName: "main", author: { login: ME }, statusCheckRollup: green },
  { number: 431, title: "The used-Cowork mark", url: "https://github.com/o/r/pull/431", body: "No note yet.", isDraft: true, headRefName: "marco/b-431", baseRefName: "main", author: { login: ME }, statusCheckRollup: [{ status: "COMPLETED", conclusion: "FAILURE" }] },
  { number: 432, title: "Stacked on 431", url: "https://github.com/o/r/pull/432", body: body("Read it."), isDraft: true, headRefName: "marco/c-432", baseRefName: "marco/b-431", author: { login: ME }, statusCheckRollup: [{ status: "IN_PROGRESS" }] },
  { number: 401, title: "Browser: a typed dot", url: "https://github.com/o/r/pull/401", body: body("Type a dot."), isDraft: false, headRefName: "frank/dot-401", baseRefName: "main", author: { login: FRANK }, statusCheckRollup: green },
  { number: 402, title: "Frank's other", url: "https://github.com/o/r/pull/402", body: body("x"), isDraft: false, headRefName: "frank/x-402", baseRefName: "main", author: { login: FRANK }, statusCheckRollup: green },
];
// git merge-tree: 430 and 401 both change the same file; 401 and 402 clash too (two other people's: never asked)
const CLASH: Record<string, string[]> = { "origin/marco/a-430|origin/frank/dot-401": ["sol/engine/src/browser.ts"], "origin/frank/dot-401|origin/frank/x-402": ["x.ts"] };

function world(o: { me?: string; now?: string; open?: unknown[]; project?: string | null; present?: boolean; fetchFails?: boolean; view?: Record<number, object> } = {}) {
  const calls: string[][] = [], gits: string[][] = [], started: { cwd: string; repo: string; title: string; text: string }[] = [];
  let n = 0;
  const open = (o.open ?? OPEN) as any[];
  const d: Deps = {
    me: () => o.me ?? ME,
    present: () => o.present ?? true,
    folders: async () => ({ "o/r": "/work/r" }),
    now: () => new Date(o.now ?? "2026-10-30T00:05:00Z"),   // 20:05 New York, Oct 29
    gh: async (args) => {
      calls.push(args);
      const s = args.join(" ");
      if (s.includes(".sol/rhythm.json")) return RHYTHM;
      if (s.includes(".sol/project.json")) { if (o.project == null) throw new Error("gh: Not Found (HTTP 404)"); return o.project; }
      if (s.startsWith("api repos/") && s.includes(".default_branch")) return "main\n";
      if (s.startsWith("pr list")) return JSON.stringify(open);
      if (s.startsWith("pr view")) {
        const p = open.find((x) => x.number === Number(args[2]));
        return JSON.stringify({ state: "OPEN", isDraft: p?.isDraft, author: p?.author, baseRefName: p?.baseRefName, url: p?.url, ...(o.view?.[Number(args[2])] ?? {}) });
      }
      return "";
    },
    git: async (cwd, args) => {
      gits.push([cwd, ...args]);
      if (args[0] === "fetch") return { code: o.fetchFails ? 128 : 0, out: "" };
      if (args[0] === "rev-parse") return { code: open.some((p) => `origin/${p.headRefName}` === args[3]) ? 0 : 1, out: "" };
      if (args[0] === "merge-tree") {
        const files = CLASH[`${args[4]}|${args[5]}`] ?? CLASH[`${args[5]}|${args[4]}`] ?? [];
        return files.length ? { code: 1, out: `abc123\n${files.join("\n")}\n\n` } : { code: 0, out: "abc123\n" };
      }
      return { code: 0, out: "" };
    },
    start: async (a) => { started.push(a); return `handin-${++n}`; },
    bus: () => {},
  };
  return { d, calls, gits, started };
}
const fresh = () => { H.forgetHandIn(); T.forgetTonight(); T.forgetRhythms(); };

test("handInDay: from the hand-in hour to the review hour, in the rhythm's zone; not before, not after", () => {
  const r = T.parseRhythm(RHYTHM)!;
  assert.equal(H.handInDay(r, new Date("2026-10-29T23:59:00Z")), null);           // 19:59 New York
  assert.equal(H.handInDay(r, new Date("2026-10-30T00:00:00Z")), "2026-10-29");   // 20:00
  assert.equal(H.handInDay(r, new Date("2026-10-30T00:59:00Z")), "2026-10-29");   // 20:59
  assert.equal(H.handInDay(r, new Date("2026-10-30T01:00:00Z")), null);           // 21:00: the review has begun
  assert.equal(H.handInDay(r, new Date("2026-11-03T01:30:00Z")), "2026-11-02");   // 20:30 after the clocks went back
  assert.deepEqual([H.hourWords("20:00"), H.hourWords("20:30"), H.hourWords("09:00"), H.hourWords("00:00")], ["8pm", "8:30pm", "9am", "12am"]);
});

test("what handed in means for the 9pm summary: the last ready after the last draft, else opened ready; during the hand-in, earlier, or late", () => {
  const r = T.parseRhythm(RHYTHM)!;
  assert.equal(H.readyAt([{ event: "ready_for_review", at: "2026-10-29T10:00:00Z" }, { event: "convert_to_draft", at: "2026-10-29T12:00:00Z" }, { event: "ready_for_review", at: "2026-10-30T00:20:00Z" }], "2026-10-28T00:00:00Z"), "2026-10-30T00:20:00Z");
  assert.equal(H.readyAt([], "2026-10-28T00:00:00Z"), "2026-10-28T00:00:00Z");                 // opened ready
  assert.equal(H.readyAt([{ event: "convert_to_draft", at: "2026-10-29T12:00:00Z" }], "2026-10-28T00:00:00Z"), "");   // a draft since
  assert.equal(H.handInOf("2026-10-30T00:20:00Z", r, "2026-10-29"), "session");   // 20:20
  assert.equal(H.handInOf("2026-10-29T15:00:00Z", r, "2026-10-29"), "earlier");   // 11:00
  assert.equal(H.handInOf("2026-10-30T01:10:00Z", r, "2026-10-29"), "late");      // 21:10
  assert.equal(H.handInOf("", r, "2026-10-29"), undefined);
});

test("checks and what a PR misses for the review", () => {
  assert.equal(H.checksOf(green), "passing");
  assert.equal(H.checksOf([...green, { status: "COMPLETED", conclusion: "FAILURE" }]), "failing");
  assert.equal(H.checksOf([...green, { status: "IN_PROGRESS" }]), "pending");
  assert.equal(H.checksOf([{ state: "SUCCESS" }]), "passing");
  assert.equal(H.checksOf(undefined), "none");
  const ok = H.mineOf(OPEN[0] as any, "main", []);
  assert.deepEqual([ok.draft, ok.handedIn, ok.checks, ok.missing, ok.try], [false, true, "passing", [], "Open Cowork fresh; press skip."]);
  const bad = H.mineOf(OPEN[1] as any, "main", []);
  assert.equal(bad.handedIn, false);
  assert.ok(bad.missing.some((m) => m.includes("What to try")) && bad.missing.some((m) => m.includes("Felt or silent")) && bad.missing.includes("its checks are red"));
  const stacked = H.mineOf(OPEN[2] as any, "main", []);
  assert.ok(stacked.missing[0].startsWith("it is based on marco/b-431, not main") && stacked.missing.includes("its checks are still running"));
});

test("findClashes: only the clashes that touch my PRs, against the default branch; the pair of two other people's is never merged", async () => {
  const w = world();
  const prs = (OPEN as any[]).map((p) => ({ number: p.number, branch: p.headRefName, login: p.author.login, title: p.title, body: p.body, isDraft: p.isDraft }));
  const mine = new Set([430, 431, 432]);
  const cs = await N.findClashes({ git: (a: string[]) => w.d.git("/work/r", a) }, prs, { base: "trunk", only: (p) => mine.has(p.number) });
  assert.deepEqual(cs.map((c) => [c.a.number, c.b?.number ?? null, c.files]), [[401, 430, ["sol/engine/src/browser.ts"]]]);
  assert.ok(w.gits.some((g) => g[1] === "merge-tree" && g[5] === "origin/trunk"));
  assert.ok(!w.gits.some((g) => g[1] === "merge-tree" && g.includes("origin/frank/dot-401") && g.includes("origin/frank/x-402")));
  // no options: the night job's own behaviour, every pair against main
  const all = await N.findClashes({ git: (a: string[]) => w.d.git("/work/r", a) }, prs);
  assert.equal(all.length, 2);
});

test("tick: at the hand-in hour my hand-in opens once, in my folder, a list of my PRs only: going in, held, nothing asked", async () => {
  fresh();
  const w = world();
  const ids = await H.tick(w.d);
  assert.equal(ids.length, 1);
  assert.equal(w.started.length, 1);
  const s = w.started[0];
  assert.deepEqual([s.cwd, s.repo, s.title], ["/work/r", "o/r", "hand-in · 2026-10-29"]);
  assert.match(s.text, /hand-in for o\/r, 2026-10-29/);
  assert.match(s.text, /8pm, America\/New_York time/);
  assert.match(s.text, /#430 Onboarding, with skip\n  ready · based on main · checks passing · handed in/);
  assert.match(s.text, /#431 The used-Cowork mark\n  draft · based on main · checks failing · held: a draft, its checks are red/);
  assert.match(s.text, /#432 Stacked on 431\n  draft · based on marco\/b-431/);
  assert.match(s.text, /clashes: #401 \(franktsai2008-eng\) on sol\/engine\/src\/browser\.ts/);
  assert.ok(!s.text.includes("#401 Browser") && !s.text.includes("#402"));                // others' PRs are not listed
  assert.match(s.text, /<room-content [0-9a-f]+>/);                                       // the titles are the team's words
  assert.match(s.text, /Going in tonight \(1\):\n\n#430/);
  assert.match(s.text, /Held \(2\):\n\n#431[\s\S]*#432/);
  assert.match(s.text, /held: based on marco\/b-431, not main/);
  assert.ok(!s.text.includes("what goes in tonight?"));                                   // it asks nothing: each card asks
  assert.match(s.text, /Ask nothing about what goes in/);
  assert.match(s.text, /Only marcocyl04-ux's press hands a change in: Bring it in/);
  assert.match(s.text, /You never hand a change in or mark one ready/);
  assert.match(s.text, /"Convert to draft" under Reviewers/);                              // agents may not pick: off by default
  assert.ok(!/\bfold/i.test(s.text));
  assert.ok(w.gits.some((g) => g[0] === "/work/r" && g[1] === "fetch"));
  // once a day
  assert.deepEqual(await H.tick(w.d), []);
  assert.equal(w.started.length, 1);
  assert.equal(H.handInOfSession(ids[0])?.numbers.join(","), "430,431,432");
});

test("tick: no hand-in before the hour, after the review hour, with my window elsewhere, or with no open change of mine", async () => {
  fresh();
  for (const now of ["2026-10-29T23:30:00Z", "2026-10-30T01:05:00Z"]) { const w = world({ now }); assert.deepEqual(await H.tick(w.d), []); assert.equal(w.started.length, 0); }
  const away = world({ present: false });
  assert.deepEqual(await H.tick(away.d), []);
  const none = world({ open: OPEN.filter((p) => p.author.login === FRANK) });
  assert.deepEqual(await H.tick(none.d), []);
  assert.equal(none.started.length, 0);
  // a folder whose origin cannot be fetched still opens, its clashes said as not checked
  fresh();
  const off = world({ fetchFails: true });
  await H.tick(off.d);
  assert.match(off.started[0].text, /clashes: not checked/);
});

test("a hand-in opened by hand inside the hour: the tick opens no second one that day", async () => {
  fresh();
  const w = world();
  const r = await H.openHandInNow(w.d, {});
  assert.ok(r.session);
  assert.deepEqual(await H.tick(w.d), []);
  assert.equal(w.started.length, 1);
});

test("pick: an agent never hands a change in, whatever the project says; the setting off means it is told what the person presses", async () => {
  fresh();
  const w = world();
  const [id] = await H.tick(w.d);
  const said = await H.pick(w.d, { sessionId: id, number: 431, ready: true });
  assert.match(said, /^not done: only marcocyl04-ux's press hands a change in, never an agent: Bring it in on its card/);
  assert.match(said, /"Ready for review" at the foot of https:\/\/github\.com\/o\/r\/pull\/431/);
  assert.match(await H.pick(w.d, { sessionId: id, number: 430, ready: false }), /^not done: o\/r does not let agents pick.*"Convert to draft" under Reviewers/);
  assert.ok(!w.calls.some((c) => c[0] === "pr" && (c[1] === "ready" || c[1] === "merge")));
  // a word that is not true, or a file that is not JSON, is off too
  for (const project of ['{"agents":{"pick":"yes"}}', "nope"]) {
    H.forgetHandIn();
    const x = world({ project });
    assert.equal(await H.agentsMayPick(x.d, "o/r"), false);
  }
});

test("pick: where the project lets agents pick, the agent takes the person's own listed PRs back to draft, and never hands one in", async () => {
  fresh();
  const w = world({ project: JSON.stringify({ agents: { pick: true } }) });
  const [id] = await H.tick(w.d);
  assert.match(w.started[0].text, /This project lets agents take a change back to draft/);
  assert.match(await H.pick(w.d, { sessionId: id, number: 431, ready: true }), /^not done: only marcocyl04-ux's press hands a change in/);
  assert.ok(!w.calls.some((c) => c[0] === "pr" && c[1] === "ready" && !c.includes("--undo")));
  assert.equal(await H.pick(w.d, { sessionId: id, number: 430, ready: false }), "#430 is a draft again: not handed in tonight");
  assert.ok(w.calls.some((c) => c.join(" ") === "pr ready 430 --repo o/r --undo"));
  assert.match(await H.pick(w.d, { sessionId: id, number: 431, ready: false }), /is a draft already/);
  assert.match(await H.pick(w.d, { sessionId: id, number: 401, ready: false }), /not one of marcocyl04-ux's changes/);
  assert.match(await H.pick(w.d, { sessionId: "some-other-session", number: 430, ready: false }), /only in a hand-in session/);
  const closed = world({ project: JSON.stringify({ agents: { pick: true } }), view: { 430: { state: "MERGED" } } });
  assert.match(await H.pick(closed.d, { sessionId: id, number: 430, ready: false }), /is merged on GitHub/);
  const other = world({ me: FRANK, project: JSON.stringify({ agents: { pick: true } }) });
  assert.match(await H.pick(other.d, { sessionId: id, number: 430, ready: false }), /this hand-in is marcocyl04-ux's/);
  assert.ok(!w.calls.some((c) => c[1] === "merge"));
});

test("the 9pm summary says which changes came in during the hand-in; one marked ready after the review hour waits", async () => {
  fresh();
  const PRS = [
    { number: 430, title: "In at the hand-in", url: "u", body: body("x"), isDraft: false, headRefOid: "a", baseRefName: "main", author: { login: ME }, labels: [], files: [], additions: 1, deletions: 0, createdAt: "2026-10-28T00:00:00Z" },
    { number: 431, title: "In since Monday", url: "u", body: body("x"), isDraft: false, headRefOid: "b", baseRefName: "main", author: { login: FRANK }, labels: [], files: [], additions: 1, deletions: 0, createdAt: "2026-10-27T00:00:00Z" },
    { number: 433, title: "Too late", url: "u", body: body("x"), isDraft: false, headRefOid: "c", baseRefName: "main", author: { login: FRANK }, labels: [], files: [], additions: 1, deletions: 0, createdAt: "2026-10-27T00:00:00Z" },
  ];
  const EVENTS: Record<number, string> = { 430: "convert_to_draft 2026-10-29T12:00:00Z\nready_for_review 2026-10-30T00:30:00Z\n", 431: "", 433: "convert_to_draft 2026-10-29T12:00:00Z\nready_for_review 2026-10-30T01:20:00Z\n" };
  const started: { text: string }[] = [], items: any[] = [];
  const d: import("../src/team/tonight.ts").TonightDeps = {
    me: () => ME, folders: async () => ({ "o/r": "/work/r" }), now: () => new Date("2026-10-30T01:30:00Z"),   // 21:30 New York
    gh: async (args) => {
      const s = args.join(" ");
      if (s.includes(".sol/rhythm.json")) return RHYTHM;
      if (s.includes("CODEOWNERS")) return "";
      if (s.includes(".default_branch")) return "main";
      if (s.includes("/timeline")) return EVENTS[Number(/issues\/(\d+)\//.exec(s)![1])];
      if (s.startsWith("pr list")) return JSON.stringify(PRS);
      return "";
    },
    start: async (a) => { started.push(a); return "review-1"; },
    bus: (m) => items.push(m),
  };
  const [id] = await T.tick(d);
  const card = T.cardsOf(id)[0];
  assert.deepEqual(card.changes.map((c) => [c.number, c.handIn]), [[430, "session"], [431, "earlier"]]);
  assert.deepEqual([card.handInAt, card.late], ["20:00", 1]);
  assert.match(started[0].text, /#430 In at the hand-in\n.*handed in at the 8pm hand-in/);
  assert.match(started[0].text, /#431 In since Monday\n.*handed in before the hand-in/);
  assert.match(started[0].text, /1 more was marked ready after the review hour/);
  assert.ok(!started[0].text.includes("#433"));
  assert.equal(T.handInWord({}), "");
});

test("the guard refuses a shell that marks a PR ready or draft, and the hand-in opened by hand", async () => {
  const { execFileSync } = await import("node:child_process");
  const { resolve } = await import("node:path");
  const guard = resolve(import.meta.dirname, "../../harness/guard");
  const dir = mkdtempSync(join(tmpdir(), "handin-guard-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q", "-b", "marco/mine"); g("config", "sol.login", ME); g("remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git");   // a sol-dev checkout (#479)
  const run = (command: string) => execFileSync("node", [guard], { cwd: dir, encoding: "utf8", input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: dir }) });
  const refused = (out: string) => out.includes('"deny"') ? (out.match(/harness \(([a-z-]+)\)/)?.[1] ?? "?") : "";
  assert.equal(refused(run("gh pr ready 431")), "hand-in");
  assert.equal(refused(run("gh pr ready 431 --undo --repo o/r")), "hand-in");
  assert.equal(refused(run("cd x && gh pr ready 1")), "hand-in");
  assert.equal(refused(run(`gh api graphql -f query='mutation { markPullRequestReadyForReview(input:{pullRequestId:"x"}) { clientMutationId } }'`)), "hand-in");
  assert.equal(refused(run(`curl -s -X POST -H 'content-type: application/json' -d '{"role":"hand-in"}' 127.0.0.1:7777/tonight`)), "tonight");
  assert.equal(refused(run("gh pr view 431 --json isDraft")), "");
  assert.equal(refused(run("gh pr merge 431")), "merge");
});

test("the guard refuses the hand-in card's key and press from a shell or a script (rule hand-in-card); Sol's own source may name them", async () => {
  const { execFileSync } = await import("node:child_process");
  const { resolve } = await import("node:path");
  const guard = resolve(import.meta.dirname, "../../harness/guard");
  const dir = mkdtempSync(join(tmpdir(), "handin-card-guard-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q", "-b", "marco/mine"); g("config", "sol.login", ME); g("remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git");   // a sol-dev checkout: the team's rules hold (#479)
  const call = (tool_name: string, tool_input: object) => execFileSync("node", [guard], { cwd: dir, encoding: "utf8", input: JSON.stringify({ tool_name, tool_input, cwd: dir }) });
  const run = (command: string) => call("Bash", { command });
  const refused = (out: string) => out.includes('"deny"') ? (out.match(/harness \(([a-z-]+)\)/)?.[1] ?? "?") : "";
  // the review's repro, with a faked Origin: asking for the key, then pressing
  assert.equal(refused(run(`node -e "const W=require('ws');const s=new W('ws://127.0.0.1:7777',{headers:{Origin:'tauri://localhost'}});s.on('open',()=>s.send(JSON.stringify({type:'team.handin.key',sessionId:'x'})))"`)), "hand-in-card");
  assert.equal(refused(run(`node -e 's.send(JSON.stringify({type:"team.handin.press",choice:"in",key:k}))'`)), "hand-in-card");
  assert.equal(refused(run(`echo '{"type":"team.handin.key"}' | websocat ws://127.0.0.1:7777`)), "hand-in-card");
  assert.equal(refused(run(`node -e 'ws.send(JSON.stringify({type:"team."+"handin.press"}))'`)), "hand-in-card");
  assert.equal(refused(call("Write", { file_path: "/tmp/p.mjs", content: `const t = "team" + "." + "handin" + ".press"; ws.send(JSON.stringify({ type: t }));` })), "hand-in-card");
  assert.equal(refused(call("Write", { file_path: "/tmp/p.mjs", content: `ws.send(JSON.stringify({ type: "team.handin.key" }))` })), "hand-in-card");
  assert.equal(refused(call("MultiEdit", { file_path: "/tmp/p.mjs", edits: [{ old_string: "a", new_string: "x.handin.press" }] })), "hand-in-card");
  // the tonight rule is still its own
  assert.equal(refused(run(`node -e 'ws.send(JSON.stringify({type:"team.tonight.key"}))'`)), "tonight");
  // Sol's own source and docs, and the tests by name, are not refused
  assert.equal(refused(call("Edit", { file_path: join(dir, "sol/engine/src/team/wire.ts"), old_string: "x", new_string: `case "team.handin.press":` })), "");
  assert.equal(refused(call("Write", { file_path: join(dir, "sol/PROTOCOL.md"), content: "`team.handin.key` and `team.handin.press`" })), "");
  assert.equal(refused(run(`npx tsx --test test/together-handin-card.test.ts`)), "");
  assert.equal(refused(run(`cat sol/engine/src/team/handin.ts`)), "");
  // the hand-in refusal says the buttons that do hand in (#579): the card's Bring it in, the wrap-up box's merge; never a
  // Terminal line for the person to type
  const why = run("gh pr ready 431");
  assert.match(why, /press Bring it in there/);
  assert.match(why, /a merge button naming the PR/);
  assert.match(why, /No Terminal line/);
  assert.ok(!/hand_in does it/.test(why));
});

test("the project's rhythm says the hand-in hour: 20:00 New York time", async () => {
  const { readFileSync } = await import("node:fs");
  const r = T.parseRhythm(readFileSync(new URL("../../../.sol/rhythm.json", import.meta.url), "utf8"))!;
  assert.deepEqual([r.handIn, r.review, r.zone], ["20:00", "21:00", "America/New_York"]);
});

test("no word fold in handin.ts or the hand_in tool's description (the session text is checked above)", async () => {
  const { readFileSync } = await import("node:fs");
  const { WORK_TOOLS } = await import("../src/work/tools.ts");
  const fold = /\bfold(?!er)/i;   // "folder" is a folder, not the old night word
  const src = readFileSync(new URL("../src/team/handin.ts", import.meta.url), "utf8");
  assert.ok(!fold.test(src), "handin.ts says fold");
  const tool = WORK_TOOLS.find((t) => t.name === "hand_in")!;
  assert.ok(tool && !fold.test(tool.description), "hand_in's description says fold");
});
