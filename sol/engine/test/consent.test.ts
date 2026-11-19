// What the person allowed (#1216): the engine reads the consent record in ~/.sol/record/me.json and refuses a folder
// agent's act past the folder's level, by name. A made-up person's home (a temp folder), a stand-in Codex: no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consentRefusal, levelFor, levelIn, readRecord, refusalIn, rungOfLevel } from "../src/consent.ts";
import { heldAt, runTicket, turnRefusal, type RunDeps } from "../src/agent/run.ts";
import { open, type Rule, type Trigger } from "../src/agent/harness.ts";
import { runSolTool } from "../src/tools.ts";
import type { TurnCtx } from "../src/browser.ts";

/** a person: their home, Sol's home inside it, two folders the onboarding made, a record with a consent */
function person(consent: object | undefined, extra: object = {}) {
  const home = mkdtempSync(join(tmpdir(), "sol-consent-"));
  const sol = join(home, "sol");
  for (const id of ["school", "clients"]) { mkdirSync(join(sol, id), { recursive: true }); writeFileSync(join(sol, id, "policy.md"), `# ${id}\n\nMade by the one onboarding.\n\n- [watch, draft] stickies: read the stickies\n`); }
  mkdirSync(join(home, ".sol/record"), { recursive: true });
  writeFileSync(join(home, ".sol/record/me.json"), JSON.stringify({ v: 1, name: "Noa Patel", hands: "draft", solHome: sol, areas: [{ id: "school" }, { id: "clients" }], ...(consent ? { consent } : {}), ...extra }));
  return { home, sol };
}

test("consent: record only refuses every tool that acts and none that looks, naming the record", () => {
  const no = consentRefusal("record", "desk_show", "the folder school")!;
  assert.match(no, /^refused: desk_show/);
  assert.match(no, /~\/\.sol\/record\/me\.json/);
  assert.match(no, /record only/);
  assert.match(no, /the folder school/);
  for (const t of ["browser_click", "browser_type", "ping", "talk", "arrange", "thing_x_y", "mcp__sol__desk_pin"]) assert.ok(consentRefusal("record", t), t);
  for (const t of ["browser_open", "browser_read", "browser_find", "browser_back", "browser_screenshot", "desk_read"]) assert.equal(consentRefusal("record", t), null, t);
});

test("consent: show and draft refuse what sends or presses in a page; do refuses nothing here", () => {
  for (const l of ["show", "draft"] as const) {
    for (const t of ["talk", "ask_agent", "hand_over", "browser_click", "browser_type"]) assert.match(consentRefusal(l, t) ?? "", /me\.json/, `${l} ${t}`);
    for (const t of ["desk_show", "ping", "browser_read"]) assert.equal(consentRefusal(l, t), null, `${l} ${t}`);
  }
  assert.match(consentRefusal("draft", "talk")!, /sending is the person's/);
  for (const t of ["talk", "browser_click", "desk_show"]) assert.equal(consentRefusal("do", t), null);
  assert.equal(consentRefusal(null, "talk"), null);
  assert.deepEqual((["record", "show", "draft", "do"] as const).map(rungOfLevel), ["read", "propose", "draft", "draft"]);
});

test("consent: the level is the record's per folder; a folder it does not name, or no record, is not judged here", () => {
  const { home, sol } = person({ levels: { school: "record", clients: "draft" } });
  assert.deepEqual(levelFor(join(sol, "school"), home), { id: "school", level: "record" });
  assert.deepEqual(levelFor(join(sol, "clients"), home), { id: "clients", level: "draft" });
  mkdirSync(join(sol, "mine"));
  assert.equal(levelFor(join(sol, "mine"), home), null);
  assert.equal(levelFor(join(sol, "school"), mkdtempSync(join(tmpdir(), "sol-nobody-"))), null);
  // a record from before the consent field: the one level it had, for every folder it made
  const old = person(undefined);
  assert.deepEqual(levelFor(join(old.sol, "clients"), old.home), { id: "clients", level: "draft" });
  // a level that is not one of the four: the record's own hands
  assert.deepEqual(levelIn({ solHome: sol, hands: "show", areas: [{ id: "school" }], consent: { levels: { school: "everything" as never } } }, join(sol, "school")), { id: "school", level: "show" });
  // a record that will not read refuses nothing here (it cannot say which folder is which)
  writeFileSync(join(home, ".sol/record/me.json"), "{ not json");
  assert.equal(readRecord(home), "broken");
  assert.equal(refusalIn(join(sol, "school"), home), undefined);
  // a record of the wrong shape reads as one that will not read: nothing is refused here, nothing throws (#1392)
  for (const bad of [{ solHome: "/tmp", areas: {} }, { solHome: sol, areas: [null, { id: 3 }] }, { solHome: 7, areas: [{ id: "school" }] }, { solHome: sol, consent: { levels: "x" } }]) {
    writeFileSync(join(home, ".sol/record/me.json"), JSON.stringify(bad));
    assert.equal(levelFor(join(sol, "school"), home), null, JSON.stringify(bad));
    assert.equal(refusalIn(join(sol, "school"), home), undefined);
  }
});

test("consent: a turn's refusal puts the record first, then the folder's own (watch mode)", () => {
  const { home, sol } = person({ levels: { school: "record", clients: "do" } });
  const school = turnRefusal(join(sol, "school"), "do", home)!;
  assert.match(school("ping")!, /record only/);
  assert.equal(school("browser_read"), null);
  const clients = turnRefusal(join(sol, "clients"), "watch", home)!;
  assert.match(clients("ping")!, /watch mode/);   // do in the record; the rule's own watch mode still holds
  assert.equal(turnRefusal(join(sol, "clients"), "do", home), undefined);
});

test("consent: a ticket's rung is held at the folder's level, never raised", () => {
  const rule: Rule = { id: "stickies-1", sentence: "read the stickies", source: "stickies", mode: "do", rung: "draft" };
  const trig: Trigger = { id: "g1", at: 1, source: "stickies", kind: "asked", data: { asked: true }, thread: "stickies" };
  const t = open({ id: "t1", folder: "school", rule, trigger: trig, policyVersion: "v" });
  assert.equal(heldAt(t, "record").mandate.rung, "read");
  assert.equal(heldAt(t, "show").mandate.rung, "propose");
  assert.equal(heldAt(t, "do").mandate.rung, "draft");
  assert.equal(heldAt({ ...t, mandate: { ...t.mandate, rung: "read" } }, "do").mandate.rung, "read");
  assert.equal(heldAt(t, null), t);
});

test("consent: a record-only folder's agent acts, and the engine refuses it with a reason that names the record", async () => {
  const { home, sol } = person({ levels: { school: "record", clients: "do" } });
  const rule: Rule = { id: "stickies-1", sentence: "read the stickies and pin today's", source: "stickies", mode: "do", rung: "draft" };
  const trig: Trigger = { id: "g1", at: 1, source: "stickies", kind: "asked", data: { asked: true }, thread: "stickies" };
  const said: string[] = [];
  const prompts: string[] = [];
  const turns = new Map<string, TurnCtx>();
  // a stand-in Codex: its turn calls Sol's desk_show through the engine's own tool runner, as the MCP server would
  const deps: RunDeps = {
    turns, sandboxMode: "workspace-write", networkAccessEnabled: false, personHome: home,
    codexFor: () => ({
      startThread: () => ({
        id: "th1",
        run: async (p: string) => {
          prompts.push(p);
          const turn = [...turns.values()][0];
          const r = await runSolTool("desk_show", { title: "today", body: "x" }, turn);
          said.push(r.isError ? r.content.map((c) => ("text" in c ? c.text : "")).join("") : "shown");
          return { finalResponse: `tried to pin\n{"report":"ready"}` };
        },
      }),
      resumeThread: () => { throw new Error("no thread yet"); },
    }) as never,
  };
  for (const id of ["school", "clients"]) {
    const t = open({ id: `t-${id}`, folder: id, rule, trigger: trig, policyVersion: "v" });
    await runTicket(join(sol, id), rule, trig, t, deps);
  }
  assert.match(said[0], /^refused: desk_show\. The person's record \(~\/\.sol\/record\/me\.json, consent\.levels\) sets the folder school at record only/);
  assert.match(prompts[0], /rung read\)/);   // the school ticket's draft rule, held at read for its turn
  assert.match(prompts[1], /rung draft\)/);
  assert.doesNotMatch(said[1], /me\.json/);   // clients is at "do": the record refuses nothing there
});
