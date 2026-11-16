// node --test src/*.test.ts (npm test here): "this broke" (#421) is offered on a build updates line only when the line is
// a change that went in, with its PR: a landed line, or a review's Into sol-dev or re-check. Not on an opened PR or a send back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mayBreak } from "./cowork/util.ts";

const ref = { repo: "sol-mif/sol-dev", number: 412 };
test("this broke: on what went in, never on what did not", () => {
  assert.equal(mayBreak({ kind: "landed", text: "#412 a thing landed on main", ref }), true);
  assert.equal(mayBreak({ kind: "reviewed", text: "#412 into sol-dev", ref }), true);   // #477's words
  assert.equal(mayBreak({ kind: "reviewed", text: "re-checked #412, into sol-dev", ref }), true);
  assert.equal(mayBreak({ kind: "reviewed", text: "folded #412 into the dev release", ref }), true);   // the words before #477
  assert.equal(mayBreak({ kind: "reviewed", text: "re-checked #412 and folded it into the dev release", ref }), true);
  assert.equal(mayBreak({ kind: "reviewed", text: "sent back #412 (slight)", ref }), false);
  assert.equal(mayBreak({ kind: "opened", text: "opened #412 a thing", ref }), false);
  assert.equal(mayBreak({ kind: "landed", text: "#412 landed", ref: { repo: "sol-mif/sol-dev" } }), false);
  assert.equal(mayBreak({ kind: "landed", text: "#412 landed" }), false);
});
