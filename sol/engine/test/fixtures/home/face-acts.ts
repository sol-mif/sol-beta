// Loaded into a scratch engine by test/home-face.test.ts (node --import): Home 5's limit, driven by the engine's own
// functions as PROTOCOL.md round 102 says a Run is today (no seat is launched for a Home job yet). Once Home is live it
// checks two calls: one a rung above Files (a would-have for the ledger, Home 6), and one stray send that needs a press
// (an ask's card on Today, Home 5), left waiting for the face's answer. Nothing else.
import { homeNow } from "../../../src/home/wire.ts";
import { check, finish } from "../../../src/home/ceiling.ts";

const t = setInterval(() => {
  const ctx = homeNow();
  if (!ctx) return;
  clearInterval(t);
  void (async () => {
    await check(ctx, { tool: "save the slides", door: "propose", source: "files", input: { lecture: 11, into: "bio 201" } });
    const v = await check(ctx, { tool: "mcp__mail__send", input: { to: "sam@school.edu", body: "about the offer" }, stray: true });
    finish(ctx, v);
  })().catch((err) => console.error("face-acts:", err));
}, 100);
t.unref();
