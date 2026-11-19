// node --test src/*.test.ts (npm test here): the run's build switches (#771, flag.ts; two of them here, the stage and what
// it says): both off by default, and the ways a build turns them on: storage "1", the page's link, the developer's setter, and another window's storage event;
// the link wins for one load. Every switch here is built on its own storage and event target, never the runner's real
// localStorage (Node 25 exposes one with --localstorage-file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSwitch, buildSwitch, mineOn, markMine, noteVersion, versionOf, MINE_ON, MINE_KEY, VERSION_KEY, STAGE_WHOLE, STAGE_SAID, type SwitchEnv } from "./flag.ts";

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

test("both switches are named as they are kept, and a switch built with no default is off", () => {
  assert.equal(STAGE_WHOLE, "stage.whole");
  assert.equal(STAGE_SAID, "stage.said");
  assert.equal(buildSwitch(STAGE_WHOLE, env().e).get(), false);
  assert.equal(buildSwitch(STAGE_SAID, env().e).get(), false);
});

test("a switch on by default (stage.whole since #691): on with nothing set, no storage or storage that throws; \"0\" or the link's off turns it off", () => {
  assert.equal(readSwitch(STAGE_WHOLE, "", kv({}), true), true);
  assert.equal(readSwitch(STAGE_WHOLE, "", null, true), true);
  assert.equal(readSwitch(STAGE_WHOLE, "", { getItem: () => { throw new Error("private"); } }, true), true);
  assert.equal(readSwitch(STAGE_WHOLE, "", kv({ "stage.whole": "0" }), true), false);
  assert.equal(readSwitch(STAGE_WHOLE, "?stage.whole=off", kv({ "stage.whole": "1" }), true), false);
  assert.equal(buildSwitch(STAGE_WHOLE, env().e, true).get(), true);
});

test("off with nothing set, with no storage, and with storage that throws", () => {
  for (const key of [STAGE_WHOLE, STAGE_SAID]) {
    assert.equal(readSwitch(key, "", kv({})), false);
    assert.equal(readSwitch(key, "", null), false);
    assert.equal(readSwitch(key, "", { getItem: () => { throw new Error("private"); } }), false);
    assert.equal(readSwitch(key, "", kv({ [key]: "0" })), false);
  }
});

test("a build turns one on by storage \"1\" or the link's on; the link's off wins over storage; neither touches the other", () => {
  assert.equal(readSwitch(STAGE_WHOLE, "", kv({ "stage.whole": "1" })), true);
  assert.equal(readSwitch(STAGE_SAID, "", kv({ "stage.said": "1" })), true);
  assert.equal(readSwitch(STAGE_WHOLE, "?stage.whole=on", null), true);
  assert.equal(readSwitch(STAGE_SAID, "?stage.said=on&home=clean", null), true);
  assert.equal(readSwitch(STAGE_WHOLE, "?stage.whole=off", kv({ "stage.whole": "1" })), false);
  assert.equal(readSwitch(STAGE_SAID, "?stage.whole=on", kv({ "stage.whole": "1" })), false);
  assert.equal(readSwitch(STAGE_WHOLE, "?stage=fixture", null), false);   // the stage's fixture link is not this switch
});

test("the developer's setter turns each on and off, alone, and writes its own storage", () => {
  const { e, o } = env();
  const stage = buildSwitch(STAGE_WHOLE, e), home = buildSwitch(STAGE_SAID, e);
  stage.set(true);
  assert.equal(stage.get(), true);
  assert.equal(home.get(), false);
  assert.equal(o["stage.whole"], "1");
  home.set(true);
  assert.equal(home.get(), true);
  stage.set(false); home.set(false);
  assert.equal(stage.get(), false);
  assert.equal(home.get(), false);
  assert.deepEqual(o, { "stage.whole": "0", "stage.said": "0" });
});

test("another window's storage event (the notch): its own key re-reads, another key is ignored, a clear (key null) re-reads", () => {
  const { e, o, fire } = env();
  const stage = buildSwitch(STAGE_WHOLE, e), home = buildSwitch(STAGE_SAID, e);
  let heard = 0;
  stage.sub(() => { heard++; });
  o["stage.whole"] = "1"; fire("stage.whole");
  assert.equal(stage.get(), true);
  assert.equal(heard, 1);
  assert.equal(home.get(), false);
  o["stage.said"] = "1"; fire("stage.said");
  assert.equal(home.get(), true);
  assert.equal(heard, 1);                      // the stage's listeners did not hear the said key
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

// #1427: Marco's night switches read on untouched where this Sol runs as concept, never by whose window it is
test("a night switch reads on untouched only in concept; complete, unknown, or set by hand or on the link, that wins", () => {
  for (const key of MINE_ON) {
    assert.equal(mineOn(key, "", kv({})), false, `${key}: the engine has not said yet`);
    assert.equal(mineOn(key, "", kv({ [VERSION_KEY]: "concept" })), true, key);
    assert.equal(mineOn(key, "", kv({ [VERSION_KEY]: "complete" })), false, `${key}: complete`);
    assert.equal(mineOn(key, "", kv({ [MINE_KEY]: "1" })), false, `${key}: Marco's window alone turns nothing on`);
    assert.equal(mineOn(key, "", kv({ [MINE_KEY]: "1", [VERSION_KEY]: "complete" })), false, `${key}: his window on complete folds them`);
    assert.equal(mineOn(key, "", kv({ [VERSION_KEY]: "concept", [key]: "0" })), false, `${key}: an off by hand kept in concept`);
    assert.equal(mineOn(key, `?${key}=off`, kv({ [VERSION_KEY]: "concept" })), false, `${key}: the link names it`);
  }
  assert.equal(mineOn("stage.whole", "", kv({ [VERSION_KEY]: "concept" })), false, "a switch not on the list");
  assert.equal(mineOn("cross", "", null), false);
  assert.equal(mineOn("cross", "", { getItem: () => { throw new Error("private"); } }), false);
});

test("the version kept is concept only in the team's checkout running as concept; a tester's engine never", () => {
  assert.equal(versionOf({ mode: "concept", team: true }), "concept");
  assert.equal(versionOf({ mode: "complete", team: true }), "complete");
  assert.equal(versionOf({ mode: "concept", team: false }), "complete", "not the team's checkout: never concept");
  assert.equal(versionOf({ mode: "concept" }), "complete");
  assert.equal(versionOf({ mode: null, team: true }), null, "the engine's first moment: nothing to keep");
  assert.equal(versionOf(null), null);
  const o: Record<string, string> = {};
  const s = { getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } };
  assert.equal(noteVersion({ mode: "concept", team: true }, s), true, "kept, the switches read again");
  assert.equal(o[VERSION_KEY], "concept");
  assert.equal(noteVersion({ mode: "concept", team: true }, s), false, "the same answer again: nothing turns");
  assert.equal(noteVersion({ mode: null, team: true }, s), false, "no mode: the kept one stays");
  assert.equal(o[VERSION_KEY], "concept");
  assert.equal(noteVersion({ mode: "complete", team: true }, s), true, "the press to complete turns them off, no restart");
  assert.equal(o[VERSION_KEY], "complete");
  assert.equal(noteVersion({ mode: "concept", team: true }, null), false);
});

test("the engine's login marks Marco's window once; anyone else's, or no login yet, never", () => {
  const store = (o: Record<string, string> = {}) => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; }, o });
  const his = store();
  assert.equal(markMine("marcocyl04-ux", his), true, "the first time: marked, so the window reads again");
  assert.equal(his.o[MINE_KEY], "1");
  assert.equal(markMine("marcocyl04-ux", his), false, "already marked: no second reload");
  for (const login of ["franktsai2008-eng", "w0ngtap", "", undefined, 42]) {
    const s = store();
    assert.equal(markMine(login, s), false, String(login));
    assert.equal(s.o[MINE_KEY], undefined, String(login));
  }
  const cleared = store({ [MINE_KEY]: "0" });
  assert.equal(markMine("marcocyl04-ux", cleared), false, "a window he unmarked by hand stays unmarked");
});
