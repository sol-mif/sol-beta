// node --test src/*.test.ts: Add → Session or Automation in a full folder opens in view (BR1, F9's gap, #1615). A full
// folder puts the starter in a new row at its foot, under the bar and the fade; the camera follows it there at the same
// zoom (plane/layout.ts camToShow, cv/moves/near.ts show). Invented people only (the dev-morning fixture).
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { camToShow, safe } from "./next/plane/layout.ts";

const whole = (id: string) => {
  const q = CV.D.pos![id], r = CV.rectOn(q, CV.S.cam), { w, h } = CV.viewSize(), sa = safe("middle");
  return r.y >= sa.t - 1 && r.y + r.h <= h - sa.b + 1 && r.x >= sa.l - 1 && r.x + r.w <= w - sa.r + 1;
};

for (const purpose of [undefined, "automation"] as const) {
  test(`a ${purpose ?? "session"} starter born in a full folder stands whole in view, at the folder's zoom`, () => {
    CV.load("dev-morning");
    CV.M.goto("api");
    const z = CV.S.cam.z, r = CV.M.start({ region: "api", ...(purpose ? { purpose } : {}) });
    assert.equal(r.ok, true);
    assert.equal(CV.D.pieces[r.id!].kind, "starter");
    assert.ok(whole(r.id!), "the starter is inside the safe area");
    assert.equal(CV.S.cam.z, z, "the zoom stays");
    assert.equal(camToShow(r.id!), null, "nothing left to move");
  });
}

test("a piece already in view moves nothing", () => {
  CV.load("dev-morning");
  CV.M.goto("api");
  const first = Object.values(CV.D.pieces).find((p) => p.region === "api" && CV.D.pos?.[p.id] && whole(p.id));
  assert.ok(first, "a piece of api stands in view");
  assert.equal(camToShow(first!.id), null);
});
