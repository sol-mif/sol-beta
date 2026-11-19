// Releases (#1299): the engine's read said for a person (src/cowork/releasesWords.ts), from the dev page's fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { releasesOf, lineOf, byPerson, behindWords, standing, pressOf } from "./cowork/releasesWords.ts";
import { fixture } from "./cowork/releasesFixture.ts";

test("where I stand: the release I am on and whether I am behind, from the newest release's rows", () => {
  assert.deepEqual(standing(fixture("line")), { on: fixture("line").releases[1].tag, behind: "up to date: on the newest release", late: false });
  const b = standing(fixture("behind"));
  assert.equal(b.late, true);
  assert.equal(b.on, fixture("behind").releases.at(-1)!.tag);
  assert.equal(b.behind, "3 releases behind (on " + b.on + ")");
  assert.equal(standing({ at: "", releases: [], decisions: [] }).on, "no release yet");
});

test("the line: main on top, then releases and decisions by time; PRs by person, the most first", () => {
  const items = lineOf(fixture("decision"));
  assert.equal(items[0].k === "release" && items[0].r.next, true);
  const kinds = items.map((i) => (i.k === "release" ? i.r.tag.slice(0, 4) : `#${i.d.issue}`));
  assert.deepEqual(kinds.slice(1, 4), ["#1299", "dev-", "#1244"]);   // today's decision above today's release, yesterday's below
  const g = byPerson(fixture("open").releases[1].prs);
  assert.deepEqual(g.map((x) => [x.by, x.prs.length]), [["b", 2], ["a", 1], ["c", 1]]);
});

test("behind in words; the press card only when the newest waits on the beta pass, disabled with the reason", () => {
  assert.equal(behindWords({ login: "c", name: "Cy", on: null, releases: null, prs: [] }), "not known: their Sol has not said what it runs");
  assert.equal(behindWords({ login: "b", name: "Bo", on: "dev-1", releases: 1, prs: [] }), "1 release behind (on dev-1)");
  assert.equal(behindWords({ login: "a", name: "Ann", on: "main", releases: 0, prs: [] }), "on main, past the newest release");
  assert.equal(pressOf(fixture("line").releases[1], "a"), null);
  const p = pressOf(fixture("press").releases[1], "a")!;
  assert.equal(p.why, "the beta pass is b's press, in their review session");
  assert.equal(pressOf(fixture("press").releases[1], "b")!.why, "press it in your review session, where its card is");
  assert.equal(releasesOf({ error: "x" }), null);
});
