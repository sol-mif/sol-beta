// Quiet (#1293, src/quiet.ts): one switch, SOL_QUIET, and every outward call in src/ asks it first. The pure parts, the
// named switches, and a scan of the source: a gh call, a git push or a fetch to another machine that neither asks the
// switch nor sits on the allow-list below turns this red. A new outward feature: call isQuiet(), quietGh(args),
// quietPush() or quietFetch(url) before it, or, for a read or a call that never leaves this Mac, add it below with why.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isQuiet, ghWrites, isLocal, quietGh, quietPush, quietFetch, QuietError } from "../src/quiet.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const Q = { SOL_QUIET: "1" }, LOUD = {};

test("isQuiet: SOL_QUIET says so; anything else is not quiet", () => {
  for (const v of ["1", "on", "true", "yes", " ON "]) assert.equal(isQuiet({ SOL_QUIET: v }), true, v);
  for (const v of ["", "0", "off", "false", "no"]) assert.equal(isQuiet({ SOL_QUIET: v }), false, v);
  assert.equal(isQuiet(LOUD), false);
});

test("ghWrites: a verb that writes, gh api with a method or a field; reads and the sign-in do not", () => {
  const writes = [
    ["issue", "create", "-R", "o/r", "--title", "t"], ["issue", "comment", "3", "--body-file", "b"], ["pr", "create", "--draft", "--fill"],
    ["pr", "merge", "5"], ["pr", "ready", "5"], ["pr", "edit", "5", "--add-label", "x"], ["pr", "review", "5", "--approve"],
    ["issue", "edit", "4", "--add-label", "now"], ["label", "create", "x"], ["secret", "set", "K"], ["release", "create", "v1"],
    ["api", "-X", "POST", "repos/o/r/issues"], ["api", "--method", "PATCH", "x"], ["api", "--method=DELETE", "x"], ["api", "-XPUT", "x"],
    ["api", "repos/o/r/issues", "-f", "title=t"], ["api", "repos/o/r/labels", "-F", "n=1"], ["api", "x", "--input", "f.json"], ["api", "x", "--raw-field", "a=b"],
    ["api", "graphql", "-f", "query=mutation { addComment(input: {}) { clientMutationId } }"], ["api", "graphql", "--input", "-"], ["-R", "o/r", "pr", "merge", "5"],
  ];
  const reads = [
    ["pr", "view", "5", "--json", "state"], ["issue", "list", "--state", "open"], ["pr", "checks", "5"], ["pr", "diff", "5"], ["search", "issues", "x"],
    ["api", "user", "--jq", ".login"], ["api", "repos/o/r/contents/x"], ["api", "-X", "GET", "search/issues", "-f", "q=x"], ["auth", "token"],
    ["auth", "login", "--web"], ["auth", "status"], ["run", "list"], ["repo", "view", "o/r"],
    ["api", "graphql", "-f", "query=query { repository(owner: \"o\", name: \"r\") { id } }"], ["-R", "o/r", "pr", "view", "5"], ["--version"], [],
  ];
  for (const a of writes) assert.equal(ghWrites(a), true, a.join(" "));
  for (const a of reads) assert.equal(ghWrites(a), false, a.join(" "));
});

test("quietGh, quietPush, quietFetch: refuse only when quiet, and only what leaves", () => {
  assert.throws(() => quietGh(["issue", "comment", "1"], Q), QuietError);
  assert.doesNotThrow(() => quietGh(["pr", "view", "1"], Q));
  assert.doesNotThrow(() => quietGh(["issue", "comment", "1"], LOUD));
  assert.throws(() => quietPush(Q), QuietError);
  assert.doesNotThrow(() => quietPush(LOUD));
  assert.throws(() => quietFetch("https://hub.example/relay", Q), QuietError);
  assert.doesNotThrow(() => quietFetch("http://127.0.0.1:7777/health", Q));
  assert.doesNotThrow(() => quietFetch("https://hub.example/relay", LOUD));
  for (const u of ["http://localhost:1420/", "http://127.0.0.1:9/x", "http://[::1]:3/"]) assert.equal(isLocal(u), true, u);
  for (const u of ["https://api.github.com/x", "wss://hub/relay", "not a url"]) assert.equal(isLocal(u), false, u);
});

// ---- the named switches: each outward clock or connection asks isQuiet() where it starts ----
const src = (f: string) => readFileSync(join(SRC, f), "utf8");
test("the named switches ask isQuiet(): renew, the update check, the relay, the hub and its ticket, track, the model list, the folder agents, the night tick, wake, reach, Jev", () => {
  const must: [string, RegExp][] = [
    ["renew.ts", /SOL_NO_RENEW/],                          // no self-update: renew on build
    ["team/ship.ts", /SOL_NO_SHIP_CHECK/],                 // no self-update: the update check
    ["team/relay.ts", /export function startRelayClient/], // no relay: presence, pings, talk
    ["team/settings.ts", /process\.env\.SOL_HUB \?\?/],    // no hub
    ["index.ts", /const TRACK_OFF =/],                     // no usage sent
    ["index.ts", /SOL_AGENT_CLOCK \?\? ""\)\);/],          // no folder agent wakes itself
    ["team/wake.ts", /SOL_WAKE \?\?/],                     // no session a GitHub comment wakes
    ["team/reach.ts", /export const answering =/],         // no answer to a teammate's agent
    ["team/wire.ts", /present: \(\) => process\.env\.SOL_TONIGHT/],   // no review session
    ["team/relay.ts", /export const hubTicket =/],          // no hub ticket: no proof, no cloud asked as the person
    ["agent/jev.ts", /^export function jevKey/],            // (the line after) no paid Jev call
    ["index.ts", /if \(!process\.env\.SOL_NO_RENEW/],       // no Claude CLI started for the model list
  ];
  // the line itself or the one after (a function whose first line asks)
  const near = (f: string, re: RegExp) => { const l = src(f).split("\n"), i = l.findIndex((x) => re.test(x)); return i < 0 ? "" : l.slice(i, i + 2).join("\n"); };
  for (const [f, re] of must) assert.match(near(f, re), /isQuiet\(\)/, `${f}: ${re} asks isQuiet()`);
  const wire = src("team/wire.ts");
  const tick = wire.slice(wire.indexOf("const nightTick = () => {"));
  assert.match(tick.split("\n")[1], /if \(isQuiet\(\)\) return;/, "the night tick (review, hand-in, send-back) stops first on a quiet Sol");
});

// ---- the scan ----
type Kind = "gh" | "push" | "fetch";
/** an outward call that is not guarded and is fine: a read, this Mac, or not the engine at all. `n` is how many such
 *  lines the file has, exactly: one more is a new call that has to ask the switch (or be added here with its reason) */
const ALLOWED: { file: string; kind: Kind; n: number; why: string }[] = [
  { file: "bigroom.ts", kind: "fetch", n: 1, why: "a big room's page's own fetch, handed through; the page runs because the person opened it" },
  { file: "voice.ts", kind: "fetch", n: 1, why: "a read: the speech model's download, asked by the person" },
  { file: "team/runners.ts", kind: "fetch", n: 1, why: "a read, and not the engine: CI's runner list (.github/workflows/runners.yml)" },
  { file: "team/try.ts", kind: "fetch", n: 1, why: "this Mac: waits for the try's own engine to answer" },
  { file: "team/v3/places-wire.ts", kind: "fetch", n: 1, why: "a read: a Drive folder's file list" },
  { file: "work/background.ts", kind: "fetch", n: 1, why: "a read: a background's source" },
  { file: "work/blocks.ts", kind: "fetch", n: 1, why: "a read: a block's source" },
  { file: "work/pieces.ts", kind: "fetch", n: 1, why: "a read: a piece's source" },
  { file: "hub/proof.ts", kind: "fetch", n: 1, why: "the proof a hub asks for: reached only through hubTicket (team/relay.ts), which asks nothing on a quiet Sol" },
  { file: "team/cloud.ts", kind: "fetch", n: 1, why: "a read: the cloud's sign-in settings, when the person signs in" },
  { file: "team/grant.ts", kind: "fetch", n: 1, why: "a read: a connection's status" },
  { file: "team/record/drive.ts", kind: "fetch", n: 2, why: "reads: a Drive folder's members and its own state" },
  { file: "team/talk.ts", kind: "fetch", n: 1, why: "a read: older lines of a thread, with a hub ticket a quiet Sol never has" },
  { file: "agent/doneJev.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "agent/jev.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "agent/jobs/applications.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "agent/opensJev.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "agent/tiedJev.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "agent/whereJev.ts", kind: "fetch", n: 3, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "screensAsk.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "work/pieceJev.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
  { file: "work/yoursJev.ts", kind: "fetch", n: 1, why: "Jev: the key is jevKey()'s, null on a quiet Sol (agent/jev.ts)" },
];

const GUARD = /\b(isQuiet|quietGh|quietPush|quietFetch)\(/;
const GH = /\b(execFile|spawn|run|sh)\(\s*"gh"/;
const GH_READ = /"gh",\s*\[\s*[^,\]]+,\s*"(view|list)"|\["auth", "token"\]/;   // the verb itself, the second word
const PUSH = /\[[^\]]*"push"/;   // any git args array with push in it (["-C", dir, "push"], [...helper, "push"])
const FETCH = /(^|[^\w])fetch\(|\?\?\s*(globalThis\.)?fetch\)\(/;   // a call, or (d.fetch ?? fetch)(…)
const FETCH_DEF = /^\s*(async\s+)?fetch\((url|input)\s*[:,)]|fetch\(url: string, opts: unknown\)/;   // a method's definition, not a call
const LOCAL = /127\.0\.0\.1|localhost|\[::1\]|\$\{engine\}/;
// where a declaration starts: a line at the left edge (not a comment, not a closing bracket), or an object's entry
const START = /^(?![\s}\])\/*]|$)|^ {2}[\w$]+: /;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) && !/\.d\.ts$/.test(n) ? [p] : [];
  });
}

/** the outward lines of one file that ask nothing (pure on the text): the guard counts when it is in the same
 *  declaration, at most 40 lines above, or on the line itself */
export function unguarded(text: string): { kind: Kind; line: number; text: string }[] {
  const lines = text.split("\n"), out: { kind: Kind; line: number; text: string }[] = [];
  // fetch under another name: `const f = d.fetch ?? globalThis.fetch`, then f(…)
  const aliases = [...text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*[^;\n]*\bfetch\s*;?\s*$/gm)].map((m) => m[1]).filter((n) => n !== "fetch");
  const ALIAS = aliases.length ? new RegExp(`(^|[^\\w.])(${aliases.join("|")})\\(`) : null;
  lines.forEach((l, i) => {
    if (/^\s*(\/\/|\*)/.test(l)) return;
    const kind: Kind | null = GH.test(l) ? (GH_READ.test(l) ? null : "gh") : PUSH.test(l) ? "push" : (FETCH.test(l) || ALIAS?.test(l)) && !FETCH_DEF.test(l) ? (LOCAL.test(l) ? null : "fetch") : null;
    if (!kind) return;
    for (let j = i; j >= Math.max(0, i - 40); j--) {
      if (GUARD.test(lines[j])) return;
      if (j < i && START.test(lines[j])) break;
    }
    out.push({ kind, line: i + 1, text: l.trim().slice(0, 140) });
  });
  return out;
}

test("the scan finds what it should: an unguarded write, and not one that asks first", () => {
  assert.deepEqual(unguarded(`export const a = () => execFile("gh", args, {});`).map((x) => x.kind), ["gh"]);
  assert.deepEqual(unguarded(`export const a = (args) => {\n  quietGh(args);\n  execFile("gh", args, {});\n};`), []);
  assert.deepEqual(unguarded(`const v = () => execFile("gh", ["pr", "view", n]);`), []);
  assert.deepEqual(unguarded(`async function p() {\n  await git(["push", "-q", "origin", "x"]);\n}`).map((x) => x.kind), ["push"]);
  assert.deepEqual(unguarded(`async function f() {\n  const r = await fetch(\`\${hub}/x\`, {});\n}`).map((x) => x.kind), ["fetch"]);
  assert.deepEqual(unguarded(`async function f() {\n  const r = await fetch("http://127.0.0.1:1/health");\n}`), []);
  assert.deepEqual(unguarded(`function c() {\n  const f = d.fetch ?? globalThis.fetch;\n  return f(url, { method: "PUT" });\n}`).map((x) => x.kind), ["fetch"]);
  assert.deepEqual(unguarded(`const p = (d) => (d.fetch ?? fetch)(url, { method: "POST" });`).map((x) => x.kind), ["fetch"]);
  assert.deepEqual(unguarded(`async function g() {\n  await d.git(["-C", wt, "push", "origin", "x"]);\n}`).map((x) => x.kind), ["push"]);
  assert.deepEqual(unguarded(`const w = () => execFile("gh", ["issue", "comment", n, "--body", "see the list"]);`).map((x) => x.kind), ["gh"]);
  // a guard in the declaration before does not cover the next one
  assert.deepEqual(unguarded(`function a() { quietPush(); }\nfunction b() {\n  git(["push"]);\n}`).map((x) => x.kind), ["push"]);
});

test("every outward call in src/ asks the switch first, or is on the allow-list with its reason", () => {
  const found = new Map<string, { kind: Kind; line: number; text: string }[]>();
  for (const f of files(SRC)) {
    const rel = relative(SRC, f).split("\\").join("/");
    for (const u of unguarded(readFileSync(f, "utf8"))) found.set(`${rel}|${u.kind}`, [...(found.get(`${rel}|${u.kind}`) ?? []), u]);
  }
  const problems: string[] = [];
  for (const [key, list] of found) {
    const [file, kind] = key.split("|");
    const ok = ALLOWED.find((a) => a.file === file && a.kind === kind);
    if (!ok) problems.push(`${file}: ${list.length} ${kind} call(s) that ask nothing:\n${list.map((u) => `    ${u.line}: ${u.text}`).join("\n")}`);
    else if (list.length > ok.n) problems.push(`${file}: ${list.length} ${kind} call(s), the allow-list says ${ok.n} (${ok.why}); a new one asks the switch:\n${list.map((u) => `    ${u.line}: ${u.text}`).join("\n")}`);
    else if (list.length < ok.n) problems.push(`${file}: ${list.length} ${kind} call(s), the allow-list says ${ok.n}: lower it`);
  }
  for (const a of ALLOWED) if (!found.has(`${a.file}|${a.kind}`)) problems.push(`${a.file}: no ${a.kind} call left; take it off the allow-list`);
  assert.equal(problems.length, 0, `outward calls that do not ask SOL_QUIET (src/quiet.ts):\n${problems.join("\n")}`);
});
