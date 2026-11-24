// node --test src/*.test.ts: Customize (BR1 people, #1615; mine/look/br1/customize.html): the brush turns it on with
// nothing aimed at; a press on a folder opens the bar of its own choices (colour and size), a press anywhere else the
// whole window's (light or night, the size of its text); a choice is tried live and Back leaves it as it was, Keep makes
// it the person's fit there; Sol's tries (✦) are tried the same way; said words find the thing, open its bar and try the
// change; live, a try is the engine's next.fit.try preview with how it was asked. Signed: marcocyl04-ux's agent, BR1
// people (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FMs, fmLink, tries } from "./next/cv/moves/fitmode.ts";
import { W } from "./next/cv/moves/settings.ts";
import { choicesOf, colourIn, customizable, namedIn } from "./next/fitmode/model.ts";
import { customizeButton } from "./next/fitmode/button.ts";

const fitOf = (knob: string, scope: string) => W().fits?.find((x) => x.knob === knob && x.scope === scope);
/** an element on the canvas inside a folder, as targetOf reads it */
const inFolder = (id: string) => ({ closest: (s: string) => (s === "[data-region]" ? { dataset: { region: id } } : null) }) as unknown as Element;

test("the rules: a folder changes its colour and size, a piece its size, anything else is the whole window; colours by their words", () => {
  CV.load("dev-week");
  const web = CV.D.regions.find((r) => r.id === "web")!;
  assert.deepEqual(choicesOf(customizable(null)).map((r) => [r.knob, r.draw]), [["look", "thumb"], ["size", "aa"]], "the empty canvas: light or night, three Aa");
  assert.equal(customizable(null).kind, "all");
  assert.equal(colourIn("make it green"), "mint");
  assert.equal(colourIn("Purple please"), "lilac");
  assert.equal(colourIn("bigger"), null);
  assert.equal(namedIn("make web green", CV.D.regions), web);
  assert.equal(namedIn("make the whole window night", CV.D.regions), "all");
  assert.equal(namedIn("bigger text", CV.D.regions), null);
});

test("on the fixture: the brush, a press on the empty canvas opens the whole window's bar; a try, Back, and the bar stays", () => {
  CV.load("dev-week");
  assert.equal(customizeButton().label, "Customize");
  assert.equal(customizeButton().pressed, false);
  customizeButton().onPress();
  const f = FMs();
  assert.ok(f.cu && !f.bar && !f.trying, "on: outlined, nothing aimed at yet");
  assert.equal(customizeButton().pressed, true);
  assert.ok(CV.M.cuPress(null, { x: 300, y: 200 }).ok);
  assert.equal(FMs().target.kind, "all");
  assert.ok(FMs().bar);
  assert.deepEqual(FMs().at, { x: 300, y: 200 }, "the bar sits where the press landed");
  assert.ok(CV.M.fmTry("look", "night").ok);
  assert.equal(FMs().trying?.scope, "~");
  assert.equal(fitOf("look", "~"), undefined, "a try keeps nothing");
  assert.ok(CV.M.fmBack().ok);
  assert.equal(FMs().trying, null);
  assert.ok(FMs().bar, "Back undoes the try; the bar stays for another");
  assert.ok(CV.M.cuShut().ok);
  assert.ok(FMs().cu && !FMs().bar);
  assert.ok(CV.M.cuToggle().ok);
  assert.equal(FMs().cu, false);
  assert.equal(CV.M.cuPress(null).ok, false, "a press means nothing with Customize off");
});

test("on the fixture: a folder's colour is tried live, Keep makes it the person's, Undo takes it back", () => {
  CV.load("dev-week");
  CV.M.cuOn();
  assert.ok(CV.M.cuPress(inFolder("web"), { x: 10, y: 10 }).ok);
  const f = FMs();
  assert.equal(f.target.kind, "folder");
  assert.equal(f.target.id, "web");
  assert.deepEqual(choicesOf(f.target).map((r) => r.knob), ["colour", "size"]);
  assert.ok(CV.M.fmTry("colour", "mint").ok);
  assert.deepEqual([FMs().trying?.knob, FMs().trying?.take, FMs().trying?.scope], ["colour", "mint", "web"]);
  assert.ok(CV.M.fmKeep().ok);
  assert.equal(fitOf("colour", "web")?.take, "mint");
  assert.equal(fitOf("colour", "web")?.author, "person");
  assert.equal(FMs().bar, false, "kept: the bar closes, Customize stays on");
  assert.ok(FMs().cu);
  assert.ok(CV.M.fmUndo().ok);
  assert.equal(fitOf("colour", "web")?.take, null, "held: Sol leaves the colour alone there");
});

test("Sol's tries: what Sol offered for the folder first, a calmer look after; pressing one tries it, Back undoes it", () => {
  CV.load("dev-week");
  const w = W();
  w.fits = [...(w.fits ?? []), { knob: "size", scope: "web", take: null, author: "sol", reason: "you zoom in here most days", count: 4, source: null, change: null, held: false,
    history: [{ id: "o1", at: 1, act: "offer", take: "l", author: "sol", reason: "you zoom in here most days" }] }];
  CV.M.cuOn();
  CV.M.cuPress(inFolder("web"));
  const ideas = tries(FMs());
  assert.deepEqual(ideas.map((x) => `${x.knob}:${x.take}`), ["size:l", "size:eve"], "the offer for this folder first, then a take Settings has Sol offer; two at most");
  assert.equal(ideas[0].reason, "you zoom in here most days");
  CV.M.cuPress(null);
  assert.ok(tries(FMs()).some((x) => x.knob === "look" && x.take === "back" && x.n === "calmer"), "the whole window: a calmer look");
  CV.M.cuPress(inFolder("web"));
  assert.ok(CV.M.cuTry(0).ok);
  assert.deepEqual([FMs().trying?.knob, FMs().trying?.take, FMs().trying?.by], ["size", "l", "try"]);
  assert.ok(CV.M.fmBack().ok);
  assert.equal(FMs().trying, null);
  assert.equal(CV.M.cuTry(9).ok, false);
});

test("say it: the words find the thing, open its bar and try the change; with Customize off only a change turns it on", () => {
  CV.load("dev-week");
  assert.equal(FMs().cu, false);
  assert.ok(CV.say("make web green")?.ok);
  assert.ok(FMs().cu && FMs().bar, "Customize on, the bar open");
  assert.equal(FMs().target.id, "web");
  assert.deepEqual([FMs().trying?.knob, FMs().trying?.take, FMs().trying?.by], ["colour", "mint", "say"]);
  assert.ok(CV.say("bigger")?.ok, "with the bar open, words are for that thing");
  assert.deepEqual([FMs().target.id, FMs().trying?.knob], ["web", "size"]);
  assert.ok(CV.say("make the whole window night")?.ok);
  assert.deepEqual([FMs().target.kind, FMs().trying?.knob, FMs().trying?.take], ["all", "look", "night"]);
  CV.M.cuOff();
  assert.equal(CV.M.cuSay("purple elephants").ok, false);
  assert.equal(FMs().cu, false, "words that turn into no change leave Customize off");
  assert.equal(FMs().trying, null);
});

test("live: a choice in the bar is the engine's preview with how it was asked; a try of Sol's says so", () => {
  CV.load("dev-week");
  const sent: Record<string, unknown>[] = [];
  fmLink.e = { send: (o: object) => { sent.push(o as Record<string, unknown>); return true; } } as never;
  CV.setMode("live");
  try {
    CV.M.cuOn();
    CV.M.cuPress(inFolder("web"));
    CV.M.fmTry("colour", "coral");
    assert.deepEqual(sent.at(-1), { type: "next.fit.try", knob: "colour", scope: "web", take: "coral", by: "point" });
    const i = tries(FMs()).findIndex((x) => x.knob === "look");
    assert.ok(i >= 0);
    CV.M.cuTry(i);
    assert.deepEqual(sent.at(-1), { type: "next.fit.try", knob: "look", scope: "web", take: "back", by: "try" });
    CV.M.cuOff();
  } finally { CV.setMode("fixture"); fmLink.e = null; }
});
