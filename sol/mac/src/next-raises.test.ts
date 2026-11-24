// node --test src/*.test.ts: the judged raises on the face (BR1 quiet canvas, #1615; quiet.html §3; cv/wire/raises.ts):
// the engine's care laid on the ask of the same id, only where it differs; the asks the engine has not judged yet; and the
// wire's round: next.raises asked at start, its care and the floor's meter taken from the answer.
// Signed: marcocyl04-ux's agent (builder J), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lay, unjudged, attach, actedNow, onActed, layOffers, answerOffer, type Care, type Offer } from "./next/cv/wire/raises.ts";
import { useAsk } from "./next/cv/wire/tidy.ts";

test("rule 2 on the face: an ask gets the engine's care and its because, and is left alone when it already has it", () => {
  const asks: Record<string, { care?: unknown }> = { "t:a": {}, "p:s:1": {}, "local": {} };
  const from = new Map<string, Care>([["t:a", { level: 3, why: "The client meets you at four." }], ["gone", { level: 1, why: "x" }]]);
  assert.equal(lay(asks, from), true);
  assert.deepEqual(asks["t:a"].care, { level: 3, why: "The client meets you at four." });
  assert.equal(asks["p:s:1"].care, undefined, "an ask the engine did not judge keeps no care");
  assert.equal(lay(asks, from), false, "the same word again changes nothing");
});

test("rule 1 on the face: the asks still to judge are the engine's kinds with no word yet; the face's own are not asked", () => {
  const from = new Map<string, Care>([["t:a", { level: 0, why: "" }]]);
  assert.deepEqual(unjudged({ "t:a": {}, "p:s:1": {}, "s:p/b": {}, "d:f:n": {}, "o:inside:w:x": {}, "x:local": {} }, from), ["p:s:1", "s:p/b", "d:f:n", "o:inside:w:x"]);
});

test("an offer is an ask in its folder, exactly the engine's list: a new one comes in with its Yes and No, a gone one leaves, one there keeps its state", () => {
  const o: Offer = { id: "o:inside:w:somewhere/acme", piece: "w:somewhere/acme", words: "Put api and web inside acme?", why: "as when you moved in", rank: 6.5, yes: "Sort them", no: "Leave them", offer: { kind: "inside" } };
  const asks: Record<string, Record<string, unknown>> = { "o:group:w:old": { id: "o:group:w:old" }, "t:a": { id: "t:a" } };
  assert.equal(layOffers(asks, [o]), true);
  assert.deepEqual(Object.keys(asks).sort(), ["o:inside:w:somewhere/acme", "t:a"], "the gone offer leaves; other asks stay");
  const a = asks[o.id];
  assert.equal(a.piece, "w:somewhere/acme"); assert.equal(a.text, o.words); assert.equal(a.yes, "Sort them"); assert.equal(a.no, "Leave them"); assert.equal(a.answered, false); assert.equal(a.live, "offer");
  a.rank = 200;   // a Later
  assert.equal(layOffers(asks, [o]), false);
  assert.equal(asks[o.id].rank, 200, "an offer already there keeps its own state");
});

test("one sender: the raises wire takes the offers in and says nothing of an offer's answer (cv/wire/tidy.ts says it)", () => {
  const sent: unknown[] = [];
  let hear: ((m: unknown) => void) | null = null;
  const e = { send: (m: unknown) => { sent.push(m); }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => { hear = null; }; } };
  const stop = attach(e as never);
  hear!({ type: "next.raises", care: { "o:inside:w:x": { level: 2, why: "w" } }, offers: [{ id: "o:inside:w:x", piece: "w:x", words: "Put a inside x?", why: "w", rank: 6.1, yes: "Sort them", no: "Leave them" }] });
  assert.deepEqual(sent, [{ type: "next.raises" }], "nothing but its own ask");
  stop();
});

test("one sender: answerOffer says each press once, through cv/wire/tidy.ts (Sort them as next.tidy.yes, Leave them as next.tidy.no)", async () => {
  const asked: { type: string }[] = [];
  useAsk((async (o: { type: string }) => { asked.push(o); return { ok: true, batch: "b1", done: "Moved api and web into acme.", what: "api and web" }; }) as never);
  try {
    assert.equal(await answerOffer("o:inside:w:x", true), true);
    assert.equal(await answerOffer("o:inside:w:y", false), true);
    assert.deepEqual(asked, [{ type: "next.tidy.yes", id: "o:inside:w:x" }, { type: "next.tidy.no", id: "o:inside:w:y" }], "each press once, nothing else");
  } finally { useAsk(null); }
});

test("rule 4 on the face: the wire asks once at start and takes the meter from the engine's answer", () => {
  const sent: unknown[] = [];
  let hear: ((m: unknown) => void) | null = null;
  const e = { send: (m: unknown) => { sent.push(m); }, subscribe: (f: (m: unknown) => void) => { hear = f; return () => { hear = null; }; } };
  let told = 0;
  const off = onActed(() => { told++; });
  const stop = attach(e as never);
  assert.deepEqual(sent, [{ type: "next.raises" }]);
  assert.equal(actedNow(), null, "no meter before the engine says it");
  hear!({ type: "next.raises", care: { "t:a": { level: 1, why: "w" }, "t:bad": { level: 9, why: "w" } }, acted: { rate: 0.6, n: 10, acted: 6, floor: 0.7, raised: true } });
  assert.equal(told, 1);
  assert.deepEqual(actedNow(), { rate: 0.6, n: 10, acted: 6, floor: 0.7, raised: true });
  stop(); off();
  assert.equal(actedNow(), null, "detached, the meter is forgotten");
});
