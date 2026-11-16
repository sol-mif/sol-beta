// A value fits its kind's row only by the row's own fields. `f in carries` also found what every object inherits
// (constructor, toString, __proto__ ...), so such a field passed with any value and, judged free of free text, was
// written on the day's line where it can never be erased.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fits, placeOf } from "../src/contract/kinds.ts";

const good = { from: 1, to: 2 };   // plugin.release: a row every layer of the kernel has, with no free text
const inherited = ["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__"];

test("a field the row does not own never fits, inherited names included", () => {
  assert.equal(fits("plugin.release", good), null, "the row's own fields fit");
  for (const f of inherited) {
    const v = JSON.parse(JSON.stringify(good).replace(/}$/, `,${JSON.stringify(f)}:"call 555 1234"}`));
    assert.ok(Object.hasOwn(v, f), `${f} is the value's own field`);
    assert.match(fits("plugin.release", v) ?? "", new RegExp(`does not carry ${f.replace(/_/g, "_")}`), `${f} does not fit`);
    assert.equal(placeOf("plugin.release", v), "file", `${f}'s text goes to a value file, never on the line`);
  }
});
