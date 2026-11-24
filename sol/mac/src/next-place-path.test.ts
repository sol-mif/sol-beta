// node --test src/*.test.ts: say.place (BR1, #1615). A session started in a folder tells the engine its place, the
// folder's scope as Sol keeps what it knows (a project's path, a place under home), so its first turn reads that
// folder's facts and those above it. Invented people only (Dev, Denise). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { attach as nearAttach } from "./next/cv/wire/near.ts";

test("placePath: a project's path, a place under home; none for a folder with no path", () => {
  assert.equal(CV.placePath("w:/srv/dev/code/api"), "srv/dev/code/api");
  assert.equal(CV.placePath("h:house/kids"), "home/house/kids");
  assert.equal(CV.placePath("h:../x/./kids"), "home/x/kids", "no empty, . or .. segment (the engine's okScope)");
  assert.equal(CV.placePath("api"), null, "a fixture folder has no path");
  assert.equal(CV.placePath("w:"), null);
  assert.equal(CV.placePath(null), null);
});

test("a session started live in a folder sends its place with work.say; one in a folder with no path sends none", () => {
  CV.load("denise");
  CV.setMode("live");
  const sent: Record<string, unknown>[] = [];
  const off = nearAttach({ send: (m: Record<string, unknown>) => { sent.push(m); return true; }, subscribe: () => () => {} } as never);
  try {
    CV.D.regions.push({ id: "h:house", name: "house", kind: "life" } as never);
    const r = CV.M.start({ region: "h:house", words: "plan the weekend shop", by: "person" });
    assert.ok(r.ok && r.id, "a starter in house");
    CV.M.start(r.id!, { force: true });
    const say = sent.find((m) => m.type === "work.say");
    assert.ok(say, "the start went to the engine");
    assert.equal(say!.place, "home/house");
    assert.equal(say!.fresh, true);

    sent.length = 0;
    const kids = CV.D.regions.find((x) => !x.id.startsWith("h:") && !x.id.startsWith("w:"))!;
    const q = CV.M.start({ region: kids.id, words: "sort the photos", by: "person" });
    CV.M.start(q.id!, { force: true });
    const s2 = sent.find((m) => m.type === "work.say");
    assert.ok(s2, "the start went to the engine");
    assert.equal("place" in s2!, false, "a folder with no path: no place");
  } finally { if (typeof off === "function") off(); CV.setMode("fixture"); }
});
