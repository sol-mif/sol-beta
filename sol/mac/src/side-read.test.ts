// node --test src/side-read.test.ts: the sessions card's plain reading (home/sideRead.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, plainTitle, readOf, standing, twins } from "./home/sideRead.ts";

const NOW = new Date(2026, 10, 11, 15, 0).getTime(), M = 60_000, H = 60 * M;

test("a first prompt reads as its first plain clause; the person's own title is kept", () => {
  assert.equal(plainTitle("# Step 5: the folders' agents inside Home mode (one builder, NucBox…"), "Step 5: the folders' agents inside Home mode");
  assert.equal(plainTitle("You are builder D (the join) of pass 4 of Home's onboarding in Sol (issue #1054), on the NucBox, alone in this folder: /home/you/computer/scratch/sol/tour4/j (a plain git worktree of a copy of Mar…"),
    "Builder D of pass 4 of Home's onboarding in Sol, on the NucBox");
  assert.equal(plainTitle("You refine the \"every session\" card of Build's sidebar in Marco's own Sol. Marco does not attend."), "Refine the \"every session\" card of Build's sidebar in Marco's own Sol");
  assert.equal(plainTitle("dev review · Sun 1 Nov"), "dev review · Sun 1 Nov");
  assert.equal(plainTitle("Kaat: the price sheet (draft)"), "Kaat: the price sheet (draft)");
  assert.ok(plainTitle("a".repeat(30) + " " + "b".repeat(30) + " " + "c".repeat(30)).endsWith("…"));
  assert.equal(plainTitle(""), "");
});

test("times and states in plain words", () => {
  assert.equal(ago(NOW - 20_000, NOW), "just now");
  assert.equal(ago(NOW - 4 * M, NOW), "4 min ago");
  assert.equal(ago(NOW - 3 * H, NOW), "3 hours ago");
  assert.equal(ago(NOW - 30 * H, NOW), "yesterday");
  assert.equal(ago(NOW - 10 * 24 * H, NOW), "on Nov 1");
  const s = { updatedAt: NOW - 2 * H };
  assert.equal(standing("needs", s, undefined, NOW), "Waiting for your answer");
  assert.equal(standing("running", s, NOW - 12 * M, NOW), "Working on it, for 12 min");
  assert.equal(standing("unread", s, undefined, NOW), "Finished 2 hours ago, not seen yet");
  assert.equal(standing("", { ...s, archived: true, pinned: true }, undefined, NOW), "Put away · last used 2 hours ago · pinned");
});

test("a thread says what was asked, what was done and what was said last; helpers' words are not its own", () => {
  const r = readOf([
    { kind: "me", text: "  make the   sidebar readable " }, { kind: "you", text: "on it" }, { kind: "wrap", recap: "The card reads in plain words." },
    { kind: "you", text: "a helper's line", parent: "t1" }, { kind: "you", text: "Done: the card reads." },
  ]);
  assert.deepEqual(r, { asked: "make the sidebar readable", did: "The card reads in plain words.", said: "Done: the card reads." });
  assert.deepEqual(readOf(undefined), {});
  assert.equal(standing("", { updatedAt: NOW - 10 * 24 * H }, undefined, NOW), "Last used on Nov 1");
  assert.deepEqual(readOf([{ kind: "you", text: "**Look safe** - `gh pr diff` <room-content 10a4> then\n- #586" }]), { said: "Look safe - gh pr diff then #586" });
});

test("folders of one name are told apart by the folder they sit in", () => {
  const t = twins(["/a/tour4/base", "/a/tour3/base", "/a/sol"], (k) => k.split("/").pop()!);
  assert.equal(t.get("/a/tour4/base"), "in tour4");
  assert.equal(t.get("/a/tour3/base"), "in tour3");
  assert.equal(t.has("/a/sol"), false);
});
