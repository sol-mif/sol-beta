// node --test src/*.test.ts: a folder's setup in its header and on its card (setup.html, Marco 16:02; folder/setup/*,
// cv/moves/setup.ts, cv/moves/talkto.ts setupTo). The line opens in place and the one bar talks to it while that folder
// is open; × takes a line out (live: the engine's next.folder.setup.drop; the fixture: a copy); a folder too early to
// read shows no line; the card's front line is the part its setup names, the person's own take first.
// Invented folders only (the fixture's morning). Signed: marcocyl04-ux's agent (builder F10), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FSs, fsLink, heard, setupOf, type FolderSetup } from "./next/cv/moves/setup.ts";
import { addressee, setupTo } from "./next/cv/moves/talkto.ts";
import { MOVE_FN, PERSON_ONLY } from "./next/agent/calls.ts";
import { frontOf } from "./next/folder/setup/front.ts";
import { LOOKS } from "./next/folder/parts/fixture.ts";
import { SETUPS } from "./next/folder/setup/fixture.ts";

test("the line opens in place; the one bar talks to it while that folder is open; Esc's move closes it", () => {
  CV.load("dev-morning");
  assert.equal(setupTo(), null);
  assert.ok(CV.M.folder_open("home").ok);
  assert.ok(setupOf("home")?.read?.sol, "Sol's reading, ✦ until kept");
  assert.ok(CV.M.fsOpen("home").ok);
  assert.equal(setupTo(), "home", "To: home, errands · setup");
  assert.equal(addressee(), null, "never a second addressee: no session is talked to meanwhile");
  CV.M.page(null);
  assert.equal(setupTo(), null, "the folder closed: the bar is not the setup's");
  assert.ok(CV.M.folder_open("home").ok);
  assert.ok(CV.M.fsClose().ok);
  assert.equal(setupTo(), null);
  assert.equal(CV.M.fsClose().ok, false, "nothing open, nothing to close");
});

test("an open setup takes the bar from a session kept beside; closed, that session is talked to again", () => {
  CV.load("dev-morning");
  const a = Object.keys(CV.D.pieces).find((id) => CV.D.pieces[id].kind === "session")!;
  CV.M.besideKeep(a);
  assert.ok(CV.M.folder_open("home").ok);
  const kept = addressee();
  assert.equal(kept, a, "the kept session is talked to on the folder's page");
  assert.ok(CV.M.fsOpen("home").ok);
  assert.equal(setupTo(), "home");
  assert.equal(addressee(), null, "one addressee: the setup, never the session beside it too");
  assert.ok(CV.M.fsClose().ok);
  assert.equal(addressee(), kept, "the session beside it is who the bar talks to again");
});

test("a folder too early to read has no line to open", () => {
  CV.load("dev-morning");
  assert.equal(setupOf("infra")?.read?.empty, true);
  assert.equal(CV.M.fsOpen("infra").ok, false);
  assert.equal(CV.M.fsOpen("nowhere").ok, false);
});

test("× on the fixture takes the line out of a copy, and the one line follows; Keep drops the ✦", () => {
  CV.load("dev-morning");
  const was = SETUPS.home.read!.lines.length;
  assert.ok(CV.M.fsDrop("home", "organized").ok);
  const r = setupOf("home")!.read!;
  assert.equal(r.lines.length, was - 1);
  assert.ok(!r.line.includes("newest first"));
  assert.equal(SETUPS.home.read!.lines.length, was, "the fixture itself is untouched");
  assert.equal(CV.M.fsDrop("home", "organized").ok, false, "a line already out");
  assert.ok(CV.M.fsUse("home").ok);
  assert.equal(setupOf("home")!.read!.sol, false);
});

test("live: × sends the engine's drop; its answer is drawn as it says", () => {
  CV.load("dev-morning");
  const sent: Record<string, unknown>[] = [];
  fsLink.e = { send: (o: object) => { sent.push(o as Record<string, unknown>); return true; } } as never;
  CV.setMode("live");
  try {
    assert.equal(setupOf("home"), null, "live, nothing until the engine says it");
    heard({ type: "next.folder.setup", setup: SETUPS.home });
    assert.ok(CV.M.fsDrop("home", "looks").ok);
    assert.deepEqual(sent.at(-1), { type: "next.folder.setup.drop", folder: "home", line: "looks" });
    const s: FolderSetup = { ...SETUPS.home, read: { ...SETUPS.home.read!, lines: SETUPS.home.read!.lines.filter((l) => l.key !== "looks") } };
    heard({ type: "next.folder.setup", setup: s });
    assert.equal(FSs().by.home.read!.lines.length, 2);
  } finally { CV.setMode("fixture"); fsLink.e = null; }
});

test("the card's front line: the part its setup names, the person's own take first; a hidden part never; too early keeps cardOf's", () => {
  assert.deepEqual(frontOf(LOOKS.home, SETUPS.home), { line: "Next: Rent · Mon", due: false, part: "coming" });
  assert.equal(frontOf(LOOKS.health, SETUPS.health).part, "photos", "pictures first: its newest by name");
  assert.equal(frontOf(LOOKS.health, SETUPS.health).line, "scan-1.jpg · scan-2.jpg · rash.heic");
  assert.equal(frontOf(LOOKS.api, SETUPS.api).line, "Next: Release · Fri", "dates ahead come before a history of changes, as the engine reads a look");
  assert.equal(frontOf(LOOKS.web, SETUPS.web).part, "changed", "web hid Coming up: it never comes back on the front");
  const rest = { ...SETUPS.home, fields: [...SETUPS.home.fields, { field: "rest", n: "", take: "latest", name: "The latest one", by: "person" as const, takes: [] }] };
  assert.equal(frontOf(LOOKS.home, rest).line, "Newest: lease.pdf", "what the person set at rest leads");
  assert.equal(frontOf(LOOKS.infra, SETUPS.infra).part, null, "too early: no setup picks");
  assert.equal(frontOf(LOOKS.api, null).part, null, "no setup said: cardOf's line");
  assert.equal(frontOf(LOOKS.api, null).line, "2 AI chats open now");
});

test("the AI's side: opening is the camera; taking a line out is the person's", () => {
  for (const m of ["fsOpen", "fsClose", "fsDrop"]) assert.ok(MOVE_FN[m], `function for ${m}`);
  assert.equal(PERSON_ONLY.fsDrop, "setting");
  assert.equal(PERSON_ONLY.fsOpen, "camera");
});

test("the bar's one To: an open setup comes before the folder the hand pressed on the way in, in what it shows and where Enter sends", () => {
  const pill = readFileSync(fileURLToPath(new URL("./next/Next.tsx", import.meta.url)), "utf8");
  assert.match(pill, /reply = setup \? null : toOf\(to\)/, "the hand's reply steps back while the setup is open");
  const tell = pill.indexOf("if (setup) { if (M.folder_tell(setup.id, v)"), send = pill.indexOf("if (sendTo(v))");
  assert.ok(tell > 0 && send > tell, "Enter tells the folder before sendTo can route the words to an ask the hand pressed");
});
