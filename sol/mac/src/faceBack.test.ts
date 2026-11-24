// The face Sol fell back to says so (#1822): a tester whose folder's face did not start sees the face the app was
// downloaded with, and a line over it says why and what brings the folder's face back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { backWords } from "./faceBack.ts";

test("a fallback is said, with its reason; the folder's face, a start, or a person's own pick say nothing", () => {
  assert.equal(backWords({ hot: true, state: "hot" }), null);
  assert.equal(backWords({ hot: true, state: "starting" }), null, "the first seconds of a launch are not a fallback");
  assert.equal(backWords({ hot: false, state: "bundled" }), null, "the person chose the bundled face");
  const down = backWords({ hot: true, state: "dev server down" });
  assert.match(String(down), /the face this app came with/);
  assert.match(String(down), /did not start/);
  assert.equal(backWords(null), null);
  assert.equal(backWords({ hot: true, state: "port taken" }), null, "a state this face does not know (none today) says nothing rather than something wrong");
  assert.equal(backWords({ hot: true, state: "something new" } as never), null, "a state this face does not know says nothing rather than something wrong");
});
