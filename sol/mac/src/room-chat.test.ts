// node --test src/*.test.ts (npm test here): the Agents' room as the group's chat (#1417). The members from the read,
// the @ completion over them, an address made an artifact, review going to a PR's diff, and the face's own rules: the
// read rule under a line is the engine's words, never worked out here; a colour comes from the kit's set. Logins a, b, c.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answers, artifactOfUrl, atOptions, atQuery, colourIndex, nameOf, peopleOf, pickAt, reviewOf, type ChatLine, type Member } from "./cowork/whole/room-chat.ts";

const M: Member[] = ["a", "b", "c"].flatMap((login) => [{ login, agent: false }, { login, agent: true }]);

test("members: each person and their agent from the read, a person's colour shared with their agent", () => {
  assert.deepEqual(M.map(nameOf), ["a", "a's agent", "b", "b's agent", "c", "c's agent"]);
  assert.deepEqual(peopleOf(M), ["a", "b", "c"]);
  assert.equal(colourIndex(M, "b"), 1);
  assert.equal(colourIndex(M, "B"), 1);
  assert.equal(colourIndex(M, "nobody"), 0);
});

test("the @ completion: what is typed before the caret, the members it may name (never me), the pick put in", () => {
  assert.equal(atQuery("hello"), null);
  assert.equal(atQuery("@"), "");
  assert.equal(atQuery("hi @b"), "b");
  assert.equal(atQuery("hi @b's ag"), "b's ag");
  assert.equal(atQuery("mail x@b"), null, "an address is not an @");
  assert.deepEqual(atOptions(M, "a", "").map(nameOf), ["b", "b's agent", "c", "c's agent"], "never me");
  assert.deepEqual(atOptions(M, "a", "b's").map(nameOf), ["b's agent"]);
  assert.deepEqual(atOptions(M, "a", "b’s a").map(nameOf), ["b's agent"]);
  const r = pickAt("ok @b can you", 5, { login: "b", agent: true });
  assert.deepEqual(r, { text: "ok @b's agent  can you", caret: 14 });
});

test("an address made an artifact: a PR, its diff, a commit, a file; anything else is not one", () => {
  assert.deepEqual(artifactOfUrl("https://github.com/o/r/pull/12"), { kind: "pr", ref: "https://github.com/o/r/pull/12", title: "#12" });
  assert.equal(artifactOfUrl("https://github.com/o/r/pull/12/files")!.kind, "diff");
  assert.equal(artifactOfUrl("https://github.com/o/r/commit/0123456789abcdef")!.title, "0123456");
  assert.deepEqual(artifactOfUrl("https://github.com/o/r/blob/main/sol/README.md"), { kind: "file", ref: "https://github.com/o/r/blob/main/sol/README.md", title: "README.md" });
  assert.equal(artifactOfUrl("https://example.com/o/r/pull/12"), null);
  assert.equal(artifactOfUrl("not a link"), null);
  assert.equal(reviewOf({ kind: "pr", ref: "https://github.com/o/r/pull/12", title: "" }), "https://github.com/o/r/pull/12/files", "review is GitHub's review, on the diff");
  assert.equal(reviewOf({ kind: "diff", ref: "https://github.com/o/r/pull/12/files", title: "" }), "https://github.com/o/r/pull/12/files");
});

test("an answer names the line it answers", () => {
  const rule = { read: [], pinged: [], refused: [], runs: 0 };
  const lines: ChatLine[] = [
    { id: "q1", at: 1, from: "a", agent: false, text: "@b's agent ?", kind: "said", rule, said: ["read by b's agent · b's usage"] },
    { id: "r1", at: 2, from: "b", agent: true, text: "yes", kind: "answer", re: "q1", rule, said: ["notifies a · no usage"] },
  ];
  assert.equal(answers(lines, "q1"), "answers a");
  assert.equal(answers(lines, "r1"), "answers b's agent");
  assert.equal(answers(lines, undefined), "");
});

test("the face's rules: the read rule is the engine's words; colour from the kit's set; motion through motion.ts; no team named", () => {
  const face = readFileSync(new URL("./cowork/whole/RoomChat.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./cowork/whole/room-chat.css", import.meta.url), "utf8");
  assert.match(face, /l\.said\.join/, "the words under a line come from the engine's read");
  assert.match(face, /litOf\(DEFAULT_SET\)/, "a person's colour is the set's, through the kit");
  assert.match(face, /from "\.\.\/\.\.\/motion"/);
  assert.doesNotMatch(face, /["'`]#[0-9a-f]{3,8}["'`]|rgba?\(/i, "no colour typed by hand in the face");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-f]{3,8}\b|rgba?\(/i, "nor in its css");
  assert.doesNotMatch(face + css, /\bJelly\b/, "no project named (the jelly, lower case, is the design system's)");
  assert.doesNotMatch(face + css, /frank|isaac|marco|sol-mif/i, "nothing of one team in the mechanism");
});
