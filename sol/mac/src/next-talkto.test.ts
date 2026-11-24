// node --test src/*.test.ts: who the one chat bar talks to (BR1 inside.html §1; cv/moves/talkto.ts). The session in front
// or kept beside the canvas; × or Esc makes the bar new while the session stays open, a press inside it talks to it again.
// Invented people only (the dev-morning fixture). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { addressee, sessionOpen } from "./next/cv/moves/talkto.ts";
import { keptNow } from "./next/cv/moves/kept.ts";
import * as Q from "./next/plane/raise-state.ts";

const sessions = () => Object.values(CV.D.pieces).filter((p) => p.kind === "session").map((p) => p.id);

test("nothing open: the bar is new", () => {
  CV.load("dev-morning");
  assert.equal(addressee(), null);
  assert.equal(CV.M.talkNew().ok, false, "nothing to make new");
});

test("a session kept beside the canvas is who the bar talks to; × makes it new and the session stays", () => {
  CV.load("dev-morning");
  const [a] = sessions();
  CV.M.besideKeep(a);
  assert.equal(addressee(), a);
  assert.equal(CV.M.talkNew().ok, true);
  assert.equal(addressee(), null, "To: New");
  assert.equal(keptNow(), a, "the session stays open");
  assert.equal(CV.M.talkHere().ok, true, "a press inside it");
  assert.equal(addressee(), a);
  CV.M.besideDrop();
  assert.equal(addressee(), null, "closed: new");
});

test("a session in front (Near, a tab) is who the bar talks to, before the one kept beside", () => {
  CV.load("dev-morning");
  const [a, b] = sessions();
  CV.M.besideKeep(a);
  CV.M.goto(b);
  assert.equal(sessionOpen(), b);
  assert.equal(addressee(), b);
  CV.M.talkNew();
  assert.equal(addressee(), null);
  CV.M.besideDrop();
});

test("a session made new once is talked to again when another comes in front", () => {
  CV.load("dev-morning");
  const [a, b] = sessions();
  CV.M.besideKeep(a);
  CV.M.talkNew();
  CV.M.besideKeep(b);
  assert.equal(addressee(), b, "the new one is talked to");
  CV.M.besideDrop();
});

test("the Diary kept beside is not a session: the bar stays new", () => {
  CV.load("dev-morning");
  CV.M.besideKeep("diary");
  assert.equal(addressee(), null);
  CV.M.besideDrop();
});

test("a session open: the hand pointing at a folder that asks takes no To; the bar stays the session's", () => {
  CV.load("dev-morning");
  const [a] = sessions(), [rid] = Q.judged();
  assert.ok(rid, "the fixture has a folder that asks");
  Q.point(rid, true);
  assert.equal(Q.toOf()?.rid, rid, "nothing open: the bar's To is what the hand is on");
  Q.letGo();
  CV.M.besideKeep(a);
  Q.point(rid, true);
  assert.equal(Q.toOf(), null, "a session open: the hand's To gives way");
  assert.equal(Q.sendTo("hello"), false, "the words go to the session, never the folder");
  assert.equal(addressee(), a);
  CV.M.talkNew();
  assert.equal(Q.toOf(), null, "made new: still none, the bar says To: New");
  Q.letGo();
  CV.M.besideDrop();
});
