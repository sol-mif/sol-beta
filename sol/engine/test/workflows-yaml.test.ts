// Every workflow GitHub can read (#985). A file GitHub cannot parse runs none of its jobs and shows only one red run named
// by its path, on the push, never among a PR's checks: #960 wrote a plain one-line `run:` that held
// `"Accept: application/vnd.github.raw"`, and a colon and a space inside a plain YAML value is a mapping, so runners.yml
// stopped parsing and the second-machine checks ran nowhere. There is no YAML package in sol/engine or sol/mac, so the
// files are read by their text, for that class: a plain one-line value (not quoted, not a `|` or `>` block, not `[` or
// `{`) that holds `: ` or ends in `:`; and a `run:`, `name:` or `if:` whose value holds a `#` after a single space, where
// YAML reads a comment and cuts the command, the name or the condition short. A `#` after two or more spaces there is the
// writer's own comment, as pages.yml writes it; a pinned action's `uses: ...@sha # v5.0.0` is a comment as written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { devOnly, ROOT } from "./dev-copy.ts";

const indent = (l: string) => l.length - l.trimStart().length;

/** each line of a workflow's text that GitHub's YAML parser would refuse or cut short: its number and why */
export function unreadable(y: string): { line: number; why: string }[] {
  const out: { line: number; why: string }[] = [];
  let block = -1; // the indentation of the key whose `|` or `>` block we are inside, or -1
  y.split(/\r?\n/).forEach((l, i) => {
    if (block >= 0) {
      if (l.trim() === "" || indent(l) > block) return;
      block = -1;
    }
    const m = /^(\s*(?:- )?)([\w.$-]+):(?: +(.*))?$/.exec(l);
    if (!m || m[3] === undefined) return;
    const value = m[3];
    if (/^[|>][-+0-9]*(\s+#.*)?$/.test(value)) { block = indent(l) + (m[1].endsWith("- ") ? 2 : 0); return; }
    if (/^["'[{&*!#]/.test(value)) return;
    const text = value.replace(/\s{2,}#.*$/, "");
    if (/: |:$/.test(text)) out.push({ line: i + 1, why: `${m[2]}: a plain value holds ": ", a mapping in YAML; write it as a block (|)` });
    else if (/^(run|name|if)$/.test(m[2]) && / #/.test(text)) out.push({ line: i + 1, why: `${m[2]}: a plain value holds " #", where YAML cuts it short; write it as a block (|)` });
  });
  return out;
}

// main's runners.yml from #960 (a2e793ce), the step GitHub could not read: held here so the check stays red on it
const RED = `jobs:
  online:
    steps:
      - name: runners.ts, without a checkout
        env:
          SHA: \${{ github.sha }}
        run: gh api "repos/$REPO/contents/sol/engine/src/team/runners.ts?ref=$SHA" -H "Accept: application/vnd.github.raw" > "$RUNNER_TEMP/runners.ts"
      - id: plan
        run: node "$RUNNER_TEMP/runners.ts"
`;

test("a plain one-line value with a colon and a space, or a lone ` #`, is red; blocks, quotes and comments are not (#985)", () => {
  assert.deepEqual(unreadable(RED).map((x) => x.line), [7], "#960's run: line");
  assert.match(unreadable(RED)[0].why, /^run: a plain value holds ": "/);
  assert.deepEqual(unreadable(RED.replace('run: gh api', 'run: |\n          gh api')), [], "the same command as a block");
  assert.deepEqual(unreadable(`    name: Fix #985 now\n`).map((x) => x.line), [1], "a name cut short at #985");
  assert.deepEqual(unreadable(`    if: github.ref == 'refs/heads/main'\n`), []);
  assert.deepEqual(unreadable(`    if: a == 'b'   # the writer's comment\n`), [], "a comment after two or more spaces");
  assert.deepEqual(unreadable(`      - uses: actions/checkout@08c6903c # v5.0.0\n`), [], "a pinned action's version");
  assert.deepEqual(unreadable(`      - run: echo "a: b"\n`).map((x) => x.line), [1], "a step's first key too");
  assert.deepEqual(unreadable(`      - run: |\n          echo "a: b" # c\n        name: x\n`), [], "a block's lines are the shell's");
  assert.deepEqual(unreadable(`    name: "a: b"\n    env:\n      URL: https://x.y/z?a=1\n    on: [push, "a: b"]\n`), []);
  assert.deepEqual(unreadable(`      - run: >-\n          a: b\n      - name: c: d\n`).map((x) => x.line), [3], "the block ends at its key's indentation");
  assert.deepEqual(unreadable(`    name: a\r\n    run: b: c\r\n`).map((x) => x.line), [2], "CRLF, as a Windows checkout may have it");
});

test("every file in .github/workflows parses as YAML, so a workflow GitHub cannot read is red before a merge (#985)", { skip: devOnly(".github/workflows") }, () => {
  const dir = join(ROOT, ".github", "workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes("runners.yml") && files.includes("ci.yml"), "the workflows are where we read them");
  const bad = files.flatMap((f) => unreadable(readFileSync(join(dir, f), "utf8")).map((x) => `${f}:${x.line}: ${x.why}`));
  assert.deepEqual(bad, [], `GitHub cannot read these workflows:\n${bad.join("\n")}`);
});
