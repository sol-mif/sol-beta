// The sheet (#608): an answer lands as one dated line in the Decisions of ours/design.md, and a second one replaces it.
import test from "node:test";
import assert from "node:assert/strict";

const { written } = await import("../../design/sheet/answers.mjs");
const { sheet } = await import("../../design/sheet/page.mjs");

const DESIGN = "# Design\n\n## Decisions\n- 2026-11-01 · an old one.\n\n## Open\n- a question\n";

test("an answer goes at the end of Decisions, dated, naming the still and the commit", () => {
  const out = written(DESIGN, { part: "Side", state: "wide", answer: "yes", note: "", file: "Side/wide.png", sha: "abc123" }, "2026-11-02");
  assert.equal(out, "# Design\n\n## Decisions\n- 2026-11-01 · an old one.\n- 2026-11-02 · the sheet: Side, wide: yes (sol/design/sheet/stills/Side/wide.png at abc123)\n\n## Open\n- a question\n");
});

test("a second answer on the same still and commit replaces the first; another commit adds a line", () => {
  const a = { part: "Side", state: "wide", answer: "later", note: "", file: "Side/wide.png", sha: "abc123" };
  const once = written(DESIGN, a, "2026-11-02");
  const twice = written(once, { ...a, answer: "no", note: "the rows crowd" }, "2026-11-02");
  assert.equal(twice.split("the sheet:").length, 2);
  assert.match(twice, /Side, wide: no, "the rows crowd"/);
  assert.equal(written(twice, { ...a, sha: "def456" }, "2026-11-03").split("the sheet:").length, 3);
});

test("the page shows only what changed, before beside after, with the three answers", () => {
  const html = sheet({ at: "2026-11-02T20:00:00.000Z", sha: "abc123", shots: 3, failed: [], notReached: ["CleanRow off"],
    changes: [{ part: "Side", state: "wide", file: "Side/wide.png", before: true, share: 2.5 }, { part: "Mark", state: "needs", file: "Mark/needs.png", before: false, share: null }] });
  assert.equal(html.match(/<section class="c"/g)?.length, 2);
  assert.match(html, /src="before\/Side\/wide.png\?/);
  assert.match(html, /no still before/);
  assert.equal(html.match(/data-a="(yes|no|later)"/g)?.length, 6);
  assert.match(html, /no recipe yet: CleanRow off/);
});
