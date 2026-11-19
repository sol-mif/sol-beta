// Home's folders, made by the engine (#1511, #1510): on a fresh Sol a sticky is put down the first time (loose/ made on
// the way), a place the record names is made when Home reads or writes it, a place inside a parent with no folder makes
// both, and the onboarding's record folder is made with no terminal. Nothing is made outside ~/.sol and Sol's home, and
// a refusal says no path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as St from "../src/agent/stickies.ts";
import { Agents, handleAgent, startAgents } from "../src/agent/index.ts";
import { makeDirs, under } from "../src/dirs.ts";

/** a person's home with Sol's home inside it, and a record naming `places` (none: no record at all) */
function fresh(places?: string[]) {
  const me = realpathSync(mkdtempSync(join(tmpdir(), "home-folders-"))), home = join(me, "sol");
  mkdirSync(home);
  if (places) {
    mkdirSync(join(me, ".sol", "record"), { recursive: true });
    writeFileSync(join(me, ".sol", "record", "me.json"), JSON.stringify({ solHome: home, areas: places.map((id) => ({ id })) }));
  }
  return { me, home, a: new Agents({ home, me, jev: null, now: () => 1000 }) };
}

test("the first sticky that stays loose makes loose/ and is put down (#1511)", () => {
  const { home, a } = fresh();
  assert.ok(!existsSync(join(home, St.LOOSE)));
  const r = a.sticky(`${home}/loose`, { op: "make", line: "bring the cake tonight" });
  assert.equal(r.ok, true, r.why);
  assert.match(readFileSync(join(home, St.LOOSE, St.FILE), "utf8"), /- \[ \] bring the cake tonight/);
  assert.equal(a.sticky("loose", { op: "make", line: "call the dentist" }).ok, true, "the second goes into the same folder");
});

test("a place the record names with no folder is made when Home reads it, and a sticky goes in (#1511)", () => {
  const { home, a } = fresh(["clients", "clients/crumb-co"]);
  const v = a.stickies(`${home}/clients`);
  assert.ok(v, "read: made, not null");
  assert.deepEqual(v!.items, []);
  assert.ok(existsSync(join(home, "clients")));
  // a place inside a parent: the record names it, the folder is made under the parent's
  assert.equal(a.sticky(`${home}/clients/crumb-co`, { op: "make", line: "invoice for March" }).ok, true);
  assert.ok(existsSync(join(home, "clients", "crumb-co", St.FILE)));
});

test("a name the record does not hold, or one outside Sol's home, is never made, and the refusal names no path", () => {
  const { me, home, a } = fresh(["clients"]);
  for (const name of ["made-up", `${home}/made-up`, "../away", `${me}/away`, ".agent", "clients/../../away"]) {
    const r = a.sticky(name, { op: "make", line: "x" });
    assert.equal(r.ok, false, name);
    assert.equal(r.why, St.NO_PLACE);
    assert.ok(!r.why!.includes("/"), "no path in the words");
    assert.equal(a.stickies(name), null, name);
  }
  assert.ok(!existsSync(join(home, "made-up")) && !existsSync(join(me, "away")));
});

test("a record for another Sol home makes nothing here but loose/", () => {
  const { me, home, a } = fresh(["clients"]);
  writeFileSync(join(me, ".sol", "record", "me.json"), JSON.stringify({ solHome: join(me, "elsewhere"), areas: [{ id: "clients" }] }));
  assert.equal(a.stickies("clients"), null);
  assert.ok(!existsSync(join(home, "clients")));
  assert.ok(a.stickies("loose"));
});

test("agent.mkdir: the record's folder and a place with its parent, by the engine, no terminal (#1510, #1511)", async () => {
  const { me, home } = fresh();
  startAgents({ home, me, jev: null }, false);
  const r = (await handleAgent({ type: "agent.mkdir", rid: 1, paths: ["~/.sol/record", "~/.sol/onboard", `${home}/clients/crumb-co`] })) as { ok: boolean; made: string[]; refused: string[]; home: string; rid: number };
  assert.equal(r.ok, true, r.refused.join(", "));
  assert.equal(r.rid, 1);
  assert.equal(r.home, realpathSync(home), "Sol's home, for a face with no terminal to ask");
  for (const p of [".sol/record", ".sol/onboard", "sol/clients", "sol/clients/crumb-co"]) assert.ok(existsSync(join(me, p)), p);
  // nothing outside the two roots, nor through a hidden folder below one
  const no = (await handleAgent({ type: "agent.mkdir", paths: [`${me}/away`, "~/Documents/x", `${home}/../away2`, `${home}/.git/x`, "relative/x", ""] })) as { ok: boolean; refused: string[] };
  assert.equal(no.ok, false);
  assert.equal(no.refused.length, 6);
  assert.ok(!existsSync(join(me, "away")) && !existsSync(join(me, "Documents")) && !existsSync(join(me, "away2")) && !existsSync(join(home, ".git")));
  // only asking where Sol's home is makes nothing
  const ask = (await handleAgent({ type: "agent.mkdir", paths: [] })) as { ok: boolean; made: string[]; home: string };
  assert.deepEqual([ask.ok, ask.made, ask.home], [true, [], realpathSync(home)]);
});

test("dirs: under() reads a path not there yet through its real parent, and refuses hidden folders and climbing out", () => {
  const { me, home } = fresh();
  assert.equal(under(home, `${home}/a/b`), "a/b");
  assert.equal(under(home, home), "");
  assert.equal(under(home, `${home}/../x`), null);
  assert.equal(under(home, `${home}/a/.agent`), null);
  assert.equal(under(join(me, ".sol"), join(me, ".sol", "record")), "record", "the root itself may be hidden");
  assert.deepEqual(makeDirs([`${home}/n/m`], [home]).made, [join(home, "n", "m")]);
});
