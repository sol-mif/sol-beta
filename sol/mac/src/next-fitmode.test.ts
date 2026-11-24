// node --test src/*.test.ts: fit mode (BR1 people item 1, #1615; mine/look/br1/three.html "Point, say or pick, see it in
// place, then Keep or Back"): the card opens on the folder open now with that folder, the folders around it and All of
// Sol as its places; a pick or a said wish is tried without keeping anything; Back leaves it as it was; Keep makes it the
// person's fit for the place chosen and Undo takes it back; live, a try is the engine's next.fit.try preview and Keep and
// Back send its token (the shape of next.you.fact.fix). Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FMs, fmLink, heard, nowAt, offered } from "./next/cv/moves/fitmode.ts";
import { W } from "./next/cv/moves/settings.ts";
import { allTarget, inPlace, scopeOf, startTarget, takesOf } from "./next/fitmode/model.ts";

const fitOf = (knob: string, scope: string) => W().fits?.find((x) => x.knob === knob && x.scope === scope);

test("the places: a live folder is its path, a place under home is home/<id>, a fixture folder its own id; All of Sol last", () => {
  assert.equal(scopeOf("w:work/acme/site"), "work/acme/site");
  assert.equal(scopeOf("h:school"), "home/school");
  assert.equal(scopeOf("api"), "api");
  const regions = [{ id: "w:work/acme", name: "Acme", kind: "code" as const }, { id: "w:work/acme/site", name: "site", kind: "code" as const }];
  const t = startTarget("w:work/acme/site", regions);
  assert.deepEqual(t.reach.map((r) => r.scope), ["work/acme/site", "work/acme", "~"], "nearest first, the folder it sits in, then All of Sol");
  assert.equal(startTarget(null, regions).kind, "all");
  assert.ok(allTarget().knobs.includes("look") && allTarget().knobs.includes("size"));
  assert.ok(!takesOf("size").some((x) => x.offered), "a take Sol only offers is not on the card");
  assert.deepEqual(inPlace(W(), "look", "night"), { look: "night" });
  assert.equal(inPlace(W(), "size", "l").z, 1.13);
  assert.deepEqual(inPlace(W(), "working", "x"), {}, "how Sol works is not drawn on the thing");
});

test("on the fixture: open on the folder, try a look, Back leaves it as it was", () => {
  CV.load("dev-week");
  assert.ok(CV.M.fmOpen().ok);
  const f = FMs();
  assert.equal(f.target.kind, "folder");
  assert.deepEqual(f.target.reach.map((r) => r.scope), ["api", "~"]);
  assert.equal(f.scope, "api", "kept for the folder unless the person says otherwise");
  assert.ok(CV.M.fmTry("look", "night").ok);
  assert.equal(FMs().trying?.take, "night");
  assert.equal(FMs().trying?.from, "paper", "what stands there now is said beside the try");
  assert.ok(offered(FMs()).find((x) => x.id === "night")?.on);
  assert.equal(fitOf("look", "api"), undefined, "a try keeps nothing");
  assert.equal(CV.M.fmTry("look", "paper").ok, false, "what is there already is not a try");
  CV.M.fmTry("look", "night");
  assert.ok(CV.M.fmBack().ok);
  assert.equal(FMs().trying, null);
  assert.equal(fitOf("look", "api"), undefined);
});

test("on the fixture: say it, Keep for the folder, Undo takes it back; the card closing leaves a try as it was", () => {
  CV.load("dev-week");
  CV.M.fmOpen();
  assert.equal(CV.M.fmSay("make it bigger").ok, true);
  assert.equal(FMs().trying?.knob, "size");
  assert.equal(FMs().trying?.by, "say");
  const take = FMs().trying!.take;
  assert.ok(CV.M.fmKeep().ok);
  const kept = fitOf("size", "api");
  assert.equal(kept?.take, take);
  assert.equal(kept?.author, "person");
  assert.equal(FMs().kept?.where, "api");   // the fixture's folder name, "(repo)" gone since F's Add (#1615)
  assert.equal(nowAt(FMs(), "size", "api"), take, "the folder now has it");
  assert.notEqual(W().prefs.kept.size, take, "kept for the folder, not all of Sol");
  assert.ok(CV.M.fmUndo().ok);
  assert.equal(fitOf("size", "api")?.take, null, "held: Sol leaves it alone there");
  assert.equal(FMs().kept, null);
  assert.equal(CV.M.fmSay("purple elephants").ok, false);
  assert.match(FMs().miss ?? "", /couldn’t turn that/);
  CV.M.fmReach("~");
  CV.M.fmTry("look", "night");
  assert.ok(CV.M.fmClose().ok, "a try only tried is left");
  assert.equal(FMs().trying, null);
  assert.equal(W().prefs.kept.look, "paper");
});

test("live: a try is the engine's preview, Keep sends its token, an answer to an old try is sent back", () => {
  CV.load("dev-week");
  const sent: Record<string, unknown>[] = [];
  fmLink.e = { send: (o: object) => { sent.push(o as Record<string, unknown>); return true; } } as never;
  CV.setMode("live");
  try {
    CV.M.fmOpen();
    CV.M.fmTry("look", "night");
    assert.deepEqual(sent.at(-1), { type: "next.fit.try", knob: "look", scope: "api", take: "night", by: "pick" });
    assert.equal(CV.M.fmKeep().ok, false, "no Keep before the engine's preview");
    heard({ preview: { token: "old", changes: [{ knob: "look", scope: "api", from: "paper", to: "bright" }] } });
    assert.deepEqual(sent.at(-1), { type: "next.fit.try", token: "old", back: true }, "a preview for another try is dropped");
    heard({ preview: { token: "t1", changes: [{ knob: "look", scope: "api", from: "paper", to: "night" }] } });
    assert.equal(FMs().trying?.token, "t1");
    assert.ok(CV.M.fmKeep().ok);
    assert.deepEqual(sent.at(-1), { type: "next.fit.try", token: "t1", keep: true });
    heard({ kept: true, token: "t1" });
    assert.equal(FMs().kept?.take, "night");
    assert.deepEqual(sent.at(-1), { type: "next.fits" }, "the fits are read again");
    CV.M.fmUndo();
    assert.deepEqual(sent.at(-1), { type: "next.fit.try", token: "t1", back: true });
    heard({ back: true, token: "t1" });
    assert.equal(FMs().kept, null);
    CV.M.fmTry("size", "l");
    heard({ ok: false, why: "not here" });
    assert.equal(FMs().trying?.why, "not here");
  } finally { CV.setMode("fixture"); fmLink.e = null; }
});
