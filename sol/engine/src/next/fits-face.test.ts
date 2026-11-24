// Make Sol fit, kept for a place (BR1 #1615): the port's Settings moves and wire (sol/mac/src/next/cv/moves/settings.ts,
// cv/wire/settings.ts) against this engine's fits (next/fits.ts, the same calls parts/next-s15.ts answers), on a temp
// SOL_HOME. A take kept for All of Sol reaches every folder; one kept for a folder or a session wins there only; ⌘Z takes
// it back and holds it; "Let Sol fit it again" lets the hold go; the history is the engine's. Nothing here is a browser:
// the moves and the wire run as they do in Sol, with an engine link that answers in process.
// Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "sol-fits-face-"));
after(() => rmSync(home, { recursive: true, force: true }));
const F = await import("./fits.js");
const core = await import("../../../mac/src/next/cv/core.ts");
const moves = (await import("../../../mac/src/next/cv/moves/settings.ts")).default;
const wire = await import("../../../mac/src/next/cv/wire/settings.ts");

// an engine link that answers next.* in process, as parts/next-s15.ts does, and hears every reply back on the wire
const subs = new Set<(m: any) => void>(), sent: any[] = [];
const answer = (m: any) => m.type === "next.fits" ? F.fitsOf(home, m.scope, m.folder) : m.type === "next.fit.set" ? F.personSet(home, m) : m.type === "next.fit.back" ? F.back(home, m) : null;
const e: any = {
  subscribe: (f: (m: any) => void) => { subs.add(f); return () => subs.delete(f); },
  send: (m: any) => { sent.push(m); const r = answer(m); if (r) for (const f of [...subs]) f({ type: m.type, ...r }); return true; },
  setSettings: () => {},
};
core.D.ais = [{ id: "claude", name: "Claude" }] as any;
core.D.regions = [{ id: "w:/Users/you/dev", name: "dev", kind: "code" }, { id: "w:/Users/you/dev/api", name: "api", kind: "code" }, { id: "w:/Users/you/school", name: "school", kind: "code" }] as any;
core.D.pieces = { s1: { id: "s1", sessionId: "s1", region: "w:/Users/you/dev/api", kind: "session", name: "Fix login" } } as any;
wire.attach(e);
const W = () => (core.D as any).prefs, U = () => (core.S as any).st;
/** open Settings over a folder (and a session in it, or none) */
const openAt = (region: string | null, piece: string | null = null) => { core.S.region = region; core.S.piece = piece; moves.stOpen(); };

test("a take kept for All of Sol reaches every folder, and is the engine's", () => {
  openAt("w:/Users/you/school");
  assert.equal(U().reach, "~");
  assert.ok(moves.stKeep("size", "l").ok);
  assert.ok(sent.some((m) => m.type === "next.fit.set" && m.knob === "size" && m.scope === "~" && m.take === "l"));
  assert.equal(F.takeOf(home, "size", "Users/sam/dev/api").take, "l");
  openAt("w:/Users/you/dev/api");
  assert.equal(W().prefs.kept.size, "l", "read back from the engine in another folder");
});

test("a take kept for a folder wins there and only there; a session's wins in that session", () => {
  openAt("w:/Users/you/dev");
  moves.stAct("reach", "folder");
  moves.stKeep("size", "s");
  openAt("w:/Users/you/dev/api");
  assert.equal(W().prefs.kept.size, "s", "a folder under it");
  openAt("w:/Users/you/school");
  assert.equal(W().prefs.kept.size, "l", "another folder keeps All of Sol's");
  openAt("w:/Users/you/dev/api", "s1");
  moves.stAct("reach", "session");
  moves.stKeep("size", "m");
  assert.equal(W().prefs.kept.size, "m");
  openAt("w:/Users/you/dev/api");
  assert.equal(W().prefs.kept.size, "s", "out of the session, the folder's again");
});

test("⌘Z takes the last take back in the place it was kept, and holds it; letting go is the person's", () => {
  openAt("w:/Users/you/dev/api", "s1");
  moves.stAct("reach", "session");
  moves.stKeep("look", "night");
  assert.equal(W().prefs.kept.look, "night");
  moves.stUndo();
  assert.ok(sent.some((m) => m.type === "next.fit.back" && m.knob === "look" && m.scope === "session:s1"));
  const f = W().fits.find((x: any) => x.knob === "look" && x.scope === "session:s1");
  assert.equal(f.held, true);
  assert.equal(F.solSet(home, { knob: "look", scope: "session:s1", take: "night", reason: "evenings, 3 of 3", count: 3 }).ok, false, "Sol leaves a held knob alone");
  moves.stAct("release", "look", "session:s1");
  assert.equal(W().fits.find((x: any) => x.knob === "look" && x.scope === "session:s1").held, false);
  assert.ok(F.solSet(home, { knob: "look", scope: "session:s1", take: "night", reason: "evenings, 3 of 3", count: 3 }).ok);
  openAt("w:/Users/you/dev/api", "s1");
  assert.equal(W().prefs.kept.look, "night", "Sol's take stands, with its reason in the fits");
  assert.equal(W().fits.find((x: any) => x.knob === "look" && x.scope === "session:s1").author, "sol");
});

test("autonomy stays agents.mode, never a fit; a refused keep tells the person why", () => {
  openAt(null);
  const before = sent.length;
  moves.stKeep("autonomy", "s");
  const mine = sent.slice(before);
  assert.ok(mine.some((m) => m.type === "agents.mode"));
  assert.ok(!mine.some((m) => m.type === "next.fit.set"));
  let said = "";
  core.hooks.flash = (t: string) => { said = t; };
  e.send({ type: "next.fit.set", knob: "size", scope: "", take: "x" });
  assert.equal(said, "That didn’t keep. Nothing changed.");
});
