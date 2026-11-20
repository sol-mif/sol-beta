// Cowork asks for the rooms on every up, not once (gate one q7, #1717): cowork/whole/askRooms.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askRooms, type Rooms } from "./cowork/whole/askRooms.ts";

function fake() {
  const ons: ((m: unknown) => void)[] = [], links: ((u: boolean) => void)[] = [], sent: object[] = [];
  let up = false;
  const timers: (() => void)[] = [];
  return {
    L: {
      on: (f: (m: unknown) => void) => { ons.push(f); return () => { ons.splice(ons.indexOf(f), 1); }; },
      onLink: (f: (u: boolean) => void) => { links.push(f); f(up); return () => { links.splice(links.indexOf(f), 1); }; },
      send: (o: object) => { if (!up) return false; sent.push(o); return true; },
    },
    timer: { set: (f: () => void) => timers.push(f) - 1, clear: (i: unknown) => { timers[i as number] = () => {}; } },
    setUp(u: boolean) { up = u; for (const f of [...links]) f(u); },
    say(rooms: Rooms) { for (const f of [...ons]) f({ type: "team.state", settings: { rooms } }); },
    fire() { const fs = timers.splice(0); for (const f of fs) f(); },
    sent, ons, links,
  };
}

test("opened before the engine is up: says it can't reach, asks when it comes up, and the tables arrive", () => {
  const f = fake();
  let rooms: Rooms | null = null, quiet = false;
  const off = askRooms(f.L, (r) => { rooms = r; }, (q) => { quiet = q; }, () => !!rooms, 8000, f.timer);
  assert.equal(quiet, true, "down at open: the line says so, not 'reading' forever");
  assert.equal(f.sent.length, 0);
  f.setUp(true);
  assert.equal(quiet, false);
  assert.deepEqual(f.sent, [{ type: "team.hello" }], "asked again once the engine answers");
  f.say([{ org: "x" }]);
  assert.deepEqual(rooms, [{ org: "x" }]);
  off();
  assert.equal(f.ons.length + f.links.length, 0, "nothing left listening");
});

test("up but silent: after the wait it says so; a restart asks again", () => {
  const f = fake();
  f.setUp(true);
  let rooms: Rooms | null = null, quiet = false;
  askRooms(f.L, (r) => { rooms = r; }, (q) => { quiet = q; }, () => !!rooms, 8000, f.timer);
  assert.equal(f.sent.length, 1);
  f.fire();
  assert.equal(quiet, true);
  f.setUp(false); f.setUp(true);
  assert.equal(f.sent.length, 2, "the engine restarted: asked again");
  f.say([]);
  assert.equal(quiet, false);
  assert.deepEqual(rooms, []);
});

test("the default timer works when called as a method (a browser's bare setTimeout would throw Illegal invocation)", () => {
  const src = readFileSync(new URL("./cowork/whole/askRooms.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /set: setTimeout|clear: clearTimeout/);
});
