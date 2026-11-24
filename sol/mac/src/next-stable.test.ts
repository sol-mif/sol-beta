// A new version on the new face's frame line (BR1 lane G, next/cv/wire/stable.ts). Signed: franktsai2008-eng's agent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STAND_MS, offerOf, offerText, offered, stableLine, take } from "./next/cv/wire/stable.ts";

const SHA = "a".repeat(40);

test("an offer is a 40-hex sha; anything else is none", () => {
  assert.equal(offerOf({ sha: null }), null);
  assert.equal(offerOf({ sha: "abc" }), null);
  assert.deepEqual(offerOf({ sha: SHA, tag: "beta-20261123", channel: "beta", behind: true }), { sha: SHA, tag: "beta-20261123", channel: "beta", behind: true });
});

test("behind, the frame holds the line with Update and Later; not behind or no offer, it takes it down", () => {
  take({ sha: SHA, tag: "", channel: "beta", behind: true });
  assert.equal(stableLine.now, null, "a release installs itself: just heard, nothing is said");
  take({ sha: "b".repeat(40), tag: "", channel: "beta", behind: true }, Date.now() - STAND_MS);
  const l = stableLine.now;
  assert.equal(l?.text, "A new version of Sol is ready.");
  assert.equal(l?.act?.label, "Update");
  assert.equal(l?.no?.label, "Later");
  take({ sha: "b".repeat(40), tag: "", channel: "beta", behind: false });
  assert.equal(stableLine.now, null);
  take({ sha: SHA, behind: true });
  take({ sha: null });
  assert.equal(stableLine.now, null);
});

test("the words never name a channel or a tag", () => {
  assert.equal(offerText({ sha: SHA, tag: "beta-20261123", channel: "beta", behind: true }), "A new version of Sol is ready.");
});

test("a release is said only once it stood past the wait, or on a */mine Sol; a carried one never again", () => {
  const dev = { sha: SHA, tag: "", channel: "dev" as const, behind: true };
  assert.equal(offered(dev, false), false, "just heard: it installs itself");
  assert.equal(offered({ ...dev, channel: "beta" }, false, "", STAND_MS - 1), false);
  assert.equal(offered({ ...dev, channel: "beta" }, false, "", STAND_MS), true, "stood past the wait: it could not install");
  assert.equal(offered({ ...dev, count: 3 }, false), true, "a */mine Sol");
  assert.equal(offered({ ...dev, channel: "beta" }, true, "", STAND_MS), false, "put off with Later");
  assert.equal(offered({ ...dev, channel: "beta" }, false, SHA, STAND_MS), false, "carried");
  assert.equal(offerText({ ...dev, back: true }), "Sol can go back to the version before.");
});
