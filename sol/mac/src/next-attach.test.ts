// node --test src/*.test.ts: the chat bar's attach menu (BR1 3c, #1615; next/markup/attach.ts, Attach.tsx). On the
// fixture's invented morning: four entries, each named; a screenshot is pinned on, each press after it a mark on the
// thing under it (never a point); a photo or a file rides in the message by name; Send takes them with the words.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { ENTRIES, NO_SHOT_PERM, put, shoot, shotRefused } from "./next/markup/attach-state.ts";
import { detach, filesText, markUp, mu, press, send, words } from "./next/markup/model.ts";

const api = { thing: "api", kind: "folder" as const, name: "api", in: null };
const lease = { thing: "lease", kind: "piece" as const, name: "lease renewal", in: "home" };

test("the menu: Mark things on screen, Screenshot of the app, Photo, File, each by its name", () => {
  assert.deepEqual(ENTRIES.map((e) => e.label), ["Mark things on screen", "Screenshot of the app", "Photo", "File"]);
});

test("a refused screenshot is never silent; refused for Screen Recording, it says where to turn it on", () => {
  assert.equal(shotRefused({ ok: false, why: "no screenshot: Sol needs Screen Recording", perm: true }), NO_SHOT_PERM);
  assert.match(NO_SHOT_PERM, /System Settings › Privacy & Security › Screen Recording, then try again\.$/);
  assert.equal(shotRefused({ ok: false, why: "no screenshot: the Sol window was not found" }), "No screenshot: the Sol window was not found");
  assert.equal(shotRefused(null), "Sol’s engine is away, so no screenshot was taken");
});

test("a screenshot is pinned on: each press after it is a mark on the thing under it, and the message says which", async () => {
  CV.setMode("fixture"); CV.load("dev-morning"); markUp(false);
  press(api);   // Mark up off: a press before the shot is not on it
  markUp(true);
  press(api);
  const shot = (await shoot())!;
  assert.equal(mu.on, true); assert.equal(mu.pinOn, shot.id);
  press(lease); words(1, "this goes first");
  assert.equal(mu.marks[0].shot, undefined, "marked before the shot");
  assert.equal(mu.marks[1].shot, shot.id);
  assert.ok(!("x" in mu.marks[1]) && !("y" in mu.marks[1]), "a thing, never a point");
  assert.deepEqual(filesText(), ["Attached:", "- Screenshot of the app (mark 2 is pinned on it, each on the thing under it)"]);
  detach(shot.id);
  assert.equal(mu.pinOn, null); assert.equal(mu.marks[1].shot, undefined, "taking the shot off leaves the mark on its thing");
  markUp(false);
});

test("a photo or a file alone opens the card and goes with Send to the session open now", async () => {
  CV.setMode("fixture"); CV.load("dev-morning"); markUp(false);
  CV.S.piece = "s-Ada";
  await put("file", [new File(["rent: Dec 1"], "lease.pdf")]);
  assert.equal(mu.on, true);
  assert.deepEqual(mu.files.map((f) => [f.kind, f.name]), [["file", "lease.pdf"]]);
  mu.text = "what does this say about rent?";
  assert.equal(await send(), true);
  assert.equal((CV.D.pieces["s-Ada"].talk as string[]).at(-1), "you: what does this say about rent?\nAttached:\n- File “lease.pdf”");
  assert.equal(mu.on, false); assert.deepEqual(mu.files, []);
  CV.S.piece = null;
});
