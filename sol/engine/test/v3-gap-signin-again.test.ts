// Cowork v3 (fr-30, gap 11 of #574): Running's red line names the place whose sign-in is gone (places-wire.ts redsOf,
// handed to slice 3 by wire.ts), and its "Sign in again" opens that place's own sign-in (Places' Connect, again) over
// Running, not the group page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as P from "../src/team/v3/people.ts";
import { handleV3, type V3Deps } from "../src/team/v3/peopleWire.ts";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const deps = (over: Partial<V3Deps> = {}): V3Deps => ({
  me: () => "marcocyl04-ux",
  project: () => ({ id: "lab", repos: [], owners: ["marcocyl04-ux"], members: [] }),
  roster: () => [], prs: () => [], timeline: async () => ({ waiting: [], releases: [], people: [] }), rhythm: async () => null,
  openReview: async () => ({}),
  ...over,
});

test("a red place read as the places read it is on Running's red line, its press the place's own sign-in", async () => {
  P.useTrail(P.memoryTrail());
  const r = await handleV3(deps({ reds: async () => [{ title: "sol-mif/sol-dev", whose: "marcocyl04-ux", place: "github", line: "sign-in expired" }] }), { type: "team.v3.running" }) as any;
  assert.equal(r.line.red.length, 1, "the red line reads the places (an answer that comes later is waited for)");
  assert.deepEqual(r.line.red[0].press, { label: "Sign in again", via: "place.signin", body: { place: "github" } });
});

test("wire.ts hands Running the places' reds; the face opens that place's sign-in, not the group page", () => {
  assert.match(read("../src/team/wire.ts"), /reds: \(\) => import\("\.\/v3\/places-wire\.js"\)\.then\(\(x\) => x\.redsOf\(room\.id\)\)/);
  const run = read("../../mac/src/cowork/v3/Running.tsx");
  const branch = run.slice(run.indexOf('p.via === "place.signin"'), run.indexOf("finally", run.indexOf('p.via === "place.signin"')));
  assert.match(branch, /setSignIn\(b\.place\)/, "the press opens the place's own sign-in");
  assert.match(run, /<SignInAgain team=\{team\} project=\{a\.project\} kind=\{signIn\}/);
  assert.match(read("../../mac/src/cowork/v3/Places.tsx"), /export function SignInAgain[\s\S]*?<Connect [^>]*again/);
});
