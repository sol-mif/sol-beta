// node --test src/*.test.ts: the rails' presses, batched a minute (buttons/usage.ts); one in a private session is not (#1242)
import { test } from "node:test";
import assert from "node:assert/strict";
import { pressed, privateAt, sendUsage } from "./buttons/usage.ts";

const batch = () => { const out: object[] = []; sendUsage((o) => { out.push(o); return true; }); return out; };

test("a press in a private session never enters the minute's batch; one in a counted session does", () => {
  const w = { privates: ["s-private"] };
  pressed("files", { session: "s-private", w });
  pressed("files", { session: "s-counted", w });
  pressed("terminal", { session: "s-private", w });
  assert.deepEqual(batch(), [{ type: "arrange.used", counts: { files: 1 } }]);
  assert.deepEqual(batch(), [], "sent once");
});

test("a session turned back is counted again from then on; nothing it held while private comes back", () => {
  const w = { privates: ["s-1"] };
  pressed("files", { session: "s-1", w });
  w.privates = [];
  pressed("files", { session: "s-1", w });
  assert.deepEqual(batch(), [{ type: "arrange.used", counts: { files: 1 } }]);
});

test("no session (Cowork, a new chat not yet named) is never private", () => {
  assert.equal(privateAt(undefined), false);
  assert.equal(privateAt({ w: { privates: ["s-1"] } }), false);
  assert.equal(privateAt({ session: "draft-1", w: { privates: ["s-1"] } }), false);
  pressed("files");
  assert.deepEqual(batch(), [{ type: "arrange.used", counts: { files: 1 } }]);
});
