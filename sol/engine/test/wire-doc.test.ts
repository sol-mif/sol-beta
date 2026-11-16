// The door's wire, written down (docs/backend-beta/WIRE.md, the v2 backend design §7.3 and step 0b): every name in its
// tables is looked for in the code, so the page cannot drift from the code quietly. The comment above each table says
// where and how:
//   <!-- wire word: <file> | <from> | <to> -->     the name as a word in that part of the file (<from> to the first <to>)
//   <!-- wire field: ... -->                        the name as a field of a type or an object (`name:` or `name?:`)
//   <!-- wire key: ... -->                          the name read off an object or listed as a string (`.name`, `"name"`)
//   <!-- wire quoted: ... -->                       the name as a string (`"name"`)
//   <!-- wire member: ... -->                       a member of an object written there, and every member it has is a row
//   <!-- wire answer: ... -->                       the /log answer: the part calls logAnswer (log.ts), which is run, and
//                                                   each row is a field of an answer it gives or the query it reads; and
//                                                   every field it gives is a row
// Comments in the code are not looked in (a name said only in a comment is not the code's).
//   <!-- wire message: <senders> > <receivers> -->  sent as `t: "name"`, handled as `case "name"` or `t === "name"`, each
//                                                   field of the second column read as `m.field`; and every message the
//                                                   big room's host sends or handles is a row
// A table without its comment fails too: nothing on the page goes unchecked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { logAnswer, PAGE as LOG_PAGE, type AnyEv } from "../src/log.ts";

const REPO = resolve(import.meta.dirname, "..", "..", "..");
const PAGE = join(REPO, "docs", "backend-beta", "WIRE.md");
/** the big room's host: every message it sends or handles is on the page (the other way round) */
const HOST = "sol/engine/src/bigroom-host.ts";

type Row = { name: string; fields: string[] };
type Section = { kind: string; spec: string; line: number; rows: Row[] };
const ticks = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** the page's checked tables: each comment and the table under it; a table with no comment is said */
function sectionsOf(text: string): { sections: Section[]; loose: number[] } {
  const lines = text.split("\n"), sections: Section[] = [], loose: number[] = [];
  let open: Section | null = null, inTable = false;
  lines.forEach((l, i) => {
    const m = /^<!-- wire (\w+): (.*) -->$/.exec(l);
    if (m) { open = { kind: m[1], spec: m[2], line: i + 1, rows: [] }; sections.push(open); inTable = false; return; }
    if (l.startsWith("|")) {
      if (!inTable) { inTable = true; if (!open) loose.push(i + 1); return; }   // the header row
      if (/^\|[\s|:-]+\|$/.test(l)) return;                                     // the line under it
      const cells = l.split("|").slice(1, -1);
      if (open) open.rows.push({ name: ticks(cells[0])[0] ?? cells[0].trim(), fields: ticks(cells[1] ?? "") });
      return;
    }
    if (inTable) { inTable = false; open = null; }   // a table ends at its first other line: the next needs its own comment
  });
  return { sections, loose };
}

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** the part of a file a comment names: from <from> to the first <to> after it; the whole file without them */
function partOf(spec: string): { file: string; text: string } {
  const [file, from, to] = spec.split(" | ").map((s) => s.trim());
  const all = read(file);
  if (!from) return { file, text: all };
  const a = all.indexOf(from);
  if (a < 0) return { file, text: "" };
  const b = to ? all.indexOf(to, a + from.length) : -1;
  return { file, text: all.slice(a, b < 0 ? undefined : b + to.length) };
}
/** the code without its comments: a block comment, and a line comment after a space or at the start of a line (so
 *  "http://x" in a string stays) */
const uncommented = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

type Answer = typeof logAnswer;
/** the /log answer's names, from running it: the query it reads (a row that, given as ?<row>=7, is the seq it asks the
 *  log for) and each field of the answers it gives (a log with nothing, a page cut with more after it, the frame off) */
function answerOf(rows: string[], f: Answer): string[] {
  const log = (n: number, last: number) => {
    let asked = -1;
    return { k: { since: (s: number) => { asked = s; return Array.from({ length: n }, (_, i) => ({ seq: s + i + 1 }) as unknown as AnyEv); }, lastSeq: () => last }, asked: () => asked };
  };
  const gives = new Set<string>();
  for (const a of [f(log(0, 0).k, new URLSearchParams()), f(log(LOG_PAGE, LOG_PAGE * 2).k, new URLSearchParams()), f(null, new URLSearchParams())]) for (const k of Object.keys(a)) gives.add(k);
  const reads = rows.filter((r) => { const l = log(1, 50); f(l.k, new URLSearchParams({ [r]: "7" })); return l.asked() === 7; });
  const out = rows.filter((r) => !gives.has(r) && !reads.includes(r)).map((r) => `${r} is not in logAnswer's answer (log.ts), nor the query it reads`);
  for (const n of gives) if (!rows.includes(n)) out.push(`${n} is in logAnswer's answer (log.ts) and not on the page`);
  return out;
}

/** the members of the object a part begins with: the lines at its first member's depth, by their names */
function membersOf(text: string): string[] {
  const body = text.split("\n").slice(1);
  const first = body.find((l) => l.trim() !== "");
  if (!first) return [];
  const indent = first.length - first.trimStart().length;
  return body.filter((l) => l.length - l.trimStart().length === indent).flatMap((l) => { const m = /^\s*([A-Za-z_$][\w$]*)\s*[(:,]/.exec(l); return m ? [m[1]] : []; });
}

/** what on the page the code does not have, and what the code has that the page does not; [] when they agree */
function check(text: string, answer: Answer = logAnswer): string[] {
  const { sections, loose } = sectionsOf(text);
  const out: string[] = loose.map((n) => `line ${n}: a table with no <!-- wire ... --> comment above it`);
  for (const s of sections) {
    const at = `line ${s.line} (${s.kind})`;
    if (!s.rows.length) { out.push(`${at}: no table under it`); continue; }
    if (s.kind === "message") {
      const [from, to] = s.spec.split(" > ").map((x) => x.trim().split(/\s+/));
      const sent = from.map(read).join("\n"), got = to.map(read).join("\n");
      for (const r of s.rows) {
        if (!new RegExp(`\\bt: "${esc(r.name)}"`).test(sent)) out.push(`${at}: ${r.name} is not sent (t: "${r.name}") in ${from.join(", ")}`);
        if (!new RegExp(`(case "${esc(r.name)}"|\\bt === "${esc(r.name)}")`).test(got)) out.push(`${at}: ${r.name} is not handled in ${to.join(", ")}`);
        for (const f of r.fields) if (!new RegExp(`\\bm\\??\\.${esc(f)}\\b`).test(got)) out.push(`${at}: ${r.name}'s ${f} is not read (m.${f}) in ${to.join(", ")}`);
      }
      // the other way round, on the host, which is nothing but this wire: what it handles from the engine, what it sends
      const host = read(HOST), names = new Set(s.rows.map((r) => r.name));
      const theirs = from.includes(HOST)
        ? [...host.matchAll(/\bt: "([\w-]+)"/g)].map((m) => m[1])
        : [...(partOf(`${HOST} | process.on("message" | process.on("disconnect"`).text.matchAll(/case "([\w-]+)"/g))].map((m) => m[1]);
      for (const n of new Set(theirs)) if (!names.has(n)) out.push(`${at}: ${n} is in ${HOST} and not on the page`);
      continue;
    }
    const { file, text: whole } = partOf(s.spec);
    if (!whole) { out.push(`${at}: ${s.spec} is not in the code (the part it names is gone)`); continue; }
    const part = s.kind === "member" ? whole : uncommented(whole);
    if (s.kind === "answer") {
      if (!/\blogAnswer\(/.test(part)) out.push(`${at}: ${file} (${s.spec.split(" | ")[1]} …) does not answer with logAnswer`);
      out.push(...answerOf(s.rows.map((r) => r.name), answer).map((m) => `${at}: ${m}`));
      continue;
    }
    const has: Record<string, (n: string) => boolean> = {
      word: (n) => new RegExp(`\\b${esc(n)}\\b`).test(part),
      field: (n) => new RegExp(`(^|[\\s{;,(])${esc(n)}\\??:`).test(part),
      key: (n) => new RegExp(`(\\.${esc(n)}\\b|"${esc(n)}")`).test(part),
      quoted: (n) => part.includes(`"${n}"`),
      member: (n) => membersOf(part).includes(n),
    };
    const f = has[s.kind];
    if (!f) { out.push(`${at}: no check named ${s.kind}`); continue; }
    for (const r of s.rows) if (!f(r.name)) out.push(`${at}: ${r.name} is not in ${file}${s.spec.includes(" | ") ? ` (${s.spec.split(" | ")[1]} …)` : ""}`);
    if (s.kind === "member") { const names = new Set(s.rows.map((r) => r.name)); for (const n of membersOf(part)) if (!names.has(n)) out.push(`${at}: ${n} is a member in ${file} and not on the page`); }
  }
  return out;
}

const page = readFileSync(PAGE, "utf8");

test("WIRE.md: every name on the page is in the code, and the sol objects and the big room's messages are whole", () => {
  const { sections } = sectionsOf(page);
  assert.ok(sections.length >= 16, `the page's checked tables: ${sections.length}`);
  assert.deepEqual(sections.filter((s) => !s.rows.length).map((s) => s.line), [], "every comment has its table");
  assert.ok(sections.reduce((n, s) => n + s.rows.length, 0) >= 90, "and the tables are not empty");
  assert.deepEqual(check(page), []);
});

test("WIRE.md's check fails when a name on the page is not in the code, or the code has one the page does not", () => {
  // a row added to each kind of table with a name the code does not have: each is said
  const add = (after: string, row: string) => { const i = page.indexOf(after); assert.ok(i >= 0, after); const j = page.indexOf("\n", i); return page.slice(0, j + 1) + row + "\n" + page.slice(j + 1); };
  const cases: [string, string, RegExp][] = [
    ["| `next` |", "| `nexts` | not a field of the answer |", /nexts is not in logAnswer's answer \(log.ts\), nor the query it reads/],
    ["| `prev` |", "| `previous` | not in the body |", /previous is not in sol\/engine\/src\/log.ts/],
    ["| `current` |", "| `currently` | not read |", /currently is not in sol\/engine\/src\/kernel.ts/],
    ["| `provides` |", "| `wants` | not a column of needs |", /wants is not in sol\/engine\/src\/record.ts/],
    ["| `write` | `write(what, value)`", "| `erase` | not on the small room's sol |", /erase is not in sol\/engine\/src\/kernel-worker.ts/],
    ["| `unload` |", "| `pause` | | not a message |", /pause is not sent .*pause is not handled/s],
    ["| `log` | `line` |", "| `shout` | `volume` | not a message |", /shout is not sent/],
  ];
  for (const [after, row, said] of cases) assert.match(check(add(after, row)).join("\n"), said, row);
  // a field the receiver does not read
  assert.match(check(page.replace("| `ev` | `e` |", "| `ev` | `e` `when` |")).join("\n"), /ev's when is not read \(m.when\)/);
  // a row taken off the page that the code still has: the sol object's member, a message the host sends or handles
  assert.match(check(page.replace(/^\| `fetch` \| `fetch\(url.*\n/m, "")).join("\n"), /fetch is a member in sol\/engine\/src\/bigroom-host.ts and not on the page/);
  assert.match(check(page.replace(/^\| `closed` \| \|.*\n/m, "")).join("\n"), /closed is in sol\/engine\/src\/bigroom-host.ts and not on the page/);
  assert.match(check(page.replace(/^\| `every` \| `ms` \|.*\n/m, "")).join("\n"), /every is in sol\/engine\/src\/bigroom-host.ts and not on the page/);
  // the /log answer's code changed under the page: a field renamed in either answer, the query read by another name, the
  // answer no longer logAnswer's; and a name kept only in a comment of the code is not found
  const bent = (from: string, to: string): Answer => (k, q) => {
    const proxy = new URLSearchParams([...q].map(([n, v]) => [n === from ? to : n === to ? from : n, v]));
    const a = logAnswer(k, from === "since" ? proxy : q) as Record<string, unknown>;
    return (from === "since" ? a : Object.fromEntries(Object.entries(a).map(([n, v]) => [n === from ? to : n, v]))) as ReturnType<Answer>;
  };
  assert.match(check(page, bent("next", "more")).join("\n"), /next is not in logAnswer's answer.*more is in logAnswer's answer \(log.ts\) and not on the page/s);
  assert.match(check(page, bent("last", "newest")).join("\n"), /last is not in logAnswer's answer/);
  assert.match(check(page, bent("off", "disabled")).join("\n"), /off is not in logAnswer's answer/);
  assert.match(check(page, bent("since", "from")).join("\n"), /since is not in logAnswer's answer \(log.ts\), nor the query it reads/, "the query read as ?from=");
  assert.match(check(page.replace('<!-- wire answer: sol/engine/src/index.ts | if (path === "/log"', '<!-- wire answer: sol/engine/src/index.ts | if (path === "/status"')).join("\n"), /does not answer with logAnswer|is not in the code/);
  assert.deepEqual(uncommented('a // b\n/** c */ d "http://x" e'), 'a \n d "http://x" e');
  // a table with no comment, and a comment whose part of the code is gone
  assert.match(check(page + "\n| name | what |\n|---|---|\n| `x` | y |\n").join("\n"), /a table with no <!-- wire/);
  assert.match(check(page.replace("export type Ctx = {", "export type Context = {")).join("\n"), /export type Context = \{ \| \}; is not in the code/);
});
