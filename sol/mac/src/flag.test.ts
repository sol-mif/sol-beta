// node --test src/*.test.ts (npm test here): the run's two build switches (#771, flag.ts): both off by default, and the
// ways a build turns them on: storage "1", the page's link, the developer's setter, and another window's storage event;
// the link wins for one load. Every switch here is built on its own storage and event target, never the runner's real
// localStorage (Node 25 exposes one with --localstorage-file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSwitch, buildSwitch, STAGE_WHOLE, HOME_WHOLE, type SwitchEnv } from "./flag.ts";

const kv = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });
/** a storage of its own, a link, and an event target standing for the window */
function env(o: Record<string, string> = {}, search = "") {
  const target = new EventTarget();
  const e: SwitchEnv = {
    storage: () => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } }),
    search: () => search,
    target,
  };
  /** another window wrote `key` (null: it cleared its storage) */
  const fire = (key: string | null) => target.dispatchEvent(Object.assign(new Event("storage"), { key }));
  return { e, o, fire };
}

test("both switches are named as the plan names them, and both are off by default", () => {
  assert.equal(STAGE_WHOLE, "stage.whole");
  assert.equal(HOME_WHOLE, "sol.home.whole");
  assert.equal(buildSwitch(STAGE_WHOLE, env().e).get(), false);
  assert.equal(buildSwitch(HOME_WHOLE, env().e).get(), false);
});

test("off with nothing set, with no storage, and with storage that throws", () => {
  for (const key of [STAGE_WHOLE, HOME_WHOLE]) {
    assert.equal(readSwitch(key, "", kv({})), false);
    assert.equal(readSwitch(key, "", null), false);
    assert.equal(readSwitch(key, "", { getItem: () => { throw new Error("private"); } }), false);
    assert.equal(readSwitch(key, "", kv({ [key]: "0" })), false);
  }
});

test("a build turns one on by storage \"1\" or the link's on; the link's off wins over storage; neither touches the other", () => {
  assert.equal(readSwitch(STAGE_WHOLE, "", kv({ "stage.whole": "1" })), true);
  assert.equal(readSwitch(HOME_WHOLE, "", kv({ "sol.home.whole": "1" })), true);
  assert.equal(readSwitch(STAGE_WHOLE, "?stage.whole=on", null), true);
  assert.equal(readSwitch(HOME_WHOLE, "?sol.home.whole=on&home=clean", null), true);
  assert.equal(readSwitch(STAGE_WHOLE, "?stage.whole=off", kv({ "stage.whole": "1" })), false);
  assert.equal(readSwitch(HOME_WHOLE, "?stage.whole=on", kv({ "stage.whole": "1" })), false);
  assert.equal(readSwitch(STAGE_WHOLE, "?stage=fixture", null), false);   // the stage's fixture link is not this switch
});

test("the developer's setter turns each on and off, alone, and writes its own storage", () => {
  const { e, o } = env();
  const stage = buildSwitch(STAGE_WHOLE, e), home = buildSwitch(HOME_WHOLE, e);
  stage.set(true);
  assert.equal(stage.get(), true);
  assert.equal(home.get(), false);
  assert.equal(o["stage.whole"], "1");
  home.set(true);
  assert.equal(home.get(), true);
  stage.set(false); home.set(false);
  assert.equal(stage.get(), false);
  assert.equal(home.get(), false);
  assert.deepEqual(o, { "stage.whole": "0", "sol.home.whole": "0" });
});

test("another window's storage event (the notch): its own key re-reads, another key is ignored, a clear (key null) re-reads", () => {
  const { e, o, fire } = env();
  const stage = buildSwitch(STAGE_WHOLE, e), home = buildSwitch(HOME_WHOLE, e);
  let heard = 0;
  stage.sub(() => { heard++; });
  o["stage.whole"] = "1"; fire("stage.whole");
  assert.equal(stage.get(), true);
  assert.equal(heard, 1);
  assert.equal(home.get(), false);
  o["sol.home.whole"] = "1"; fire("sol.home.whole");
  assert.equal(home.get(), true);
  assert.equal(heard, 1);                      // the stage's listeners did not hear the home's key
  for (const k of Object.keys(o)) delete o[k]; // localStorage.clear() in the other window
  fire(null);
  assert.equal(stage.get(), false);
  assert.equal(home.get(), false);
  assert.equal(heard, 2);
});

test("a storage event cannot beat the link's off for this load", () => {
  const { e, o, fire } = env({}, "?stage.whole=off");
  const stage = buildSwitch(STAGE_WHOLE, e);
  o["stage.whole"] = "1"; fire("stage.whole");
  assert.equal(stage.get(), false);
});
