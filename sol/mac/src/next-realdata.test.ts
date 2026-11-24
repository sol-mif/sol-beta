// A plane fed a person's real Mac, not the examples (BR1, #1615): every check before it used Kim's and Dev's few sessions,
// and Marco's try (537 sessions in one folder) drew no folder, 21 loose session chips, a Diary 4759px wide and the camera at
// 0.17. Here hundreds of quiet sessions in a few folders must leave the plane as the drawing has it (mine/look/br1/pieces.html
// "Both", bar-folder.html): every folder drawn, the sessions inside them, the Diary at its own width, the zoom of the examples.
// Signed: marcocyl04-ux's agent (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";
import { fromPlaces, fromSessions } from "./next/cv/wire/plane.ts";
import { DIARY_PX } from "./next/fits/fit.ts";

/** a Mac like Marco's: 400 quiet sessions in one project, 30 in another, 2 in a third, a Life folder, newest last */
function realMac() {
  const at = Date.UTC(2026, 10, 1), sessions = [];
  const add = (n: number, project: string) => { for (let i = 0; i < n; i++) sessions.push({ id: `${project}-${i}`, title: `task ${i} in ${project}`, project: `/Users/p/${project}`, cwd: `/Users/p/${project}`, createdAt: at + i * 60_000, done: i % 3 === 0 }); };
  add(400, "sol"); add(30, "cashout"); add(2, "notes");
  const w = fromSessions({ sessions });
  CV.D.regions = [...w.regions, ...fromPlaces({ places: [{ id: "life", name: "life" }] })];
  CV.D.pieces = Object.fromEntries(w.pieces.map((p) => [p.id, p]));
  CV.D.asks = {}; CV.D.ais = [];
  // as the wire's relayout does: the rule's places dropped, laid out again, the camera settled; then the view lands what has no place
  for (const [id, q] of Object.entries(CV.D.pos || {})) if (q.by === "rule") delete CV.D.pos![id];
  CV.hooks.layout?.();
  CV.S.camSet = false;
  CV.hooks.settleCam?.();
  CV.M.land();
}

test("hundreds of sessions in a few folders: the folders are drawn, the sessions inside them, the Diary its own width, the zoom held", () => {
  CV.load("dev-morning");
  const zExample = CV.S.cam.z;
  CV.load("fresh");
  realMac();
  const D = CV.D;
  for (const r of D.regions) assert.ok(D.pos![r.id], `${r.name} is drawn`);
  const laid = L.placedPieces();
  assert.ok(laid.length <= D.regions.length * L.IDLE_SHOWN, `only the newest few of each folder lie on the canvas (${laid.length})`);
  for (const p of laid) {
    const q = D.pos![p.id], R = D.pos![p.region];
    assert.ok(q.x >= R.x && q.x + q.w <= R.x + R.w && q.y >= R.y && q.y + q.h <= R.y + R.h, `${p.id} lies inside its folder`);
    assert.equal(q.by, "rule", `${p.id} is the rule's, never the person's: the plane is not hand-laid`);
  }
  assert.ok(L.diaryPieces().length < 6, `fewer than six loose chips under the Diary (${L.diaryPieces().length})`);
  assert.ok(!laid.some((p) => p.id === "sol-399") && !laid.some((p) => p.id === "sol-0"), "quiet, the newest and the oldest both stay inside their folder (frame.html §5)");
  const empty = D.pos![D.regions.find((r) => r.name === "notes")!.id], full = D.pos![D.regions.find((r) => r.name === "sol")!.id];
  assert.deepEqual([full.w, full.h], [empty.w, empty.h], "a folder of 400 quiet sessions is the size of a folder of two: its face, not its contents");
  assert.ok(D.zones!.diary.w <= L.DIARY_MAX_W, `the Diary at its own width (${Math.round(D.zones!.diary.w)})`);
  assert.ok(CV.S.cam.z >= 0.8 * zExample, `the zoom holds at the examples' scale (${CV.S.cam.z} against ${zExample})`);
  assert.ok(!L.byHand(), "nothing is the person's until they move it");
});

test("sessions in no folder lie loose, only the newest few of the quiet ones", () => {
  CV.load("fresh");
  realMac();
  for (const id of ["notes-0", "notes-1"]) CV.D.pieces[id].region = "";
  for (let i = 0; i < 8; i++) CV.D.pieces[`sol-${i}`].region = "";
  CV.stale?.();
  const out = Object.values(CV.D.pieces).filter((p) => !p.region && !L.keptIn(p.id));
  assert.equal(out.length, L.IDLE_SHOWN, `only the newest ${L.IDLE_SHOWN} loose quiet sessions are drawn (${out.length})`);
  assert.ok(out.some((p) => p.id === "sol-7") && !out.some((p) => p.id === "sol-0"), "the newest, never the oldest");
});

test("a session at work, or one that asks, always lies on the canvas, however old", () => {
  CV.load("fresh");
  realMac();
  const old = CV.D.pieces["sol-5"];
  assert.ok(L.keptIn("sol-5"), "old and quiet: inside the folder");
  old.state = "working";
  CV.stale?.();
  assert.ok(!L.keptIn("sol-5"), "at work: on the canvas");
});

/** the window's size as the face reads it (cv/core viewSize: the window less the sidebar and the top bar) */
function windowOf(w: number, h: number) { Object.assign(globalThis, { innerWidth: w, innerHeight: h }); }

test("holds the scale at 2560: the folders and the Diary at their drawn size, the extra room empty canvas (rule (d))", () => {
  const seen: Record<number, { z: number; folder: number; page: number; right: number }> = {};
  try {
    for (const [w, h] of [[1440, 900], [2560, 1440]]) {
      windowOf(w, h);
      CV.load("fresh");
      realMac();
      const D = CV.D, z = CV.S.cam.z, sol = D.pos![D.regions.find((r) => r.name === "sol")!.id];
      const right = Math.max(...D.regions.map((r) => L.toScreen(D.pos![r.id].x + D.pos![r.id].w, 0).x));
      seen[w] = { z, folder: sol.w * z, page: D.zones!.page.w * z, right };
      // the folders lie in one row that wraps (pieces.html "Both"; BR1: one flow, no zones), never one column
      const build = D.regions.filter((r) => r.kind === "code").map((r) => D.pos![r.id]), all = D.regions.map((r) => D.pos![r.id]);
      assert.equal(build.length, 3);
      assert.ok(new Set(all.map((q) => Math.round(q.y))).size < all.length, `${w}: the folders share a row (${all.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(" ")})`);
    }
  } finally { windowOf(1440, 900); }
  for (const w of [1440, 2560]) {
    assert.equal(seen[w].z, +L.Z_PERSON.toFixed(4), `${w}: Far is at the person's scale (${seen[w].z})`);
    assert.ok(Math.abs(seen[w].folder - L.FOLDER_PX) <= 1, `${w}: a folder is drawn at the drawing's ${L.FOLDER_PX}px (${Math.round(seen[w].folder)})`);
    assert.ok(Math.abs(seen[w].page - DIARY_PX) <= 1, `${w}: today's page at its own ${DIARY_PX}px (${Math.round(seen[w].page)})`);
  }
  assert.ok(seen[2560].right < 2560 - 252 - 300, `2560: the extra room stays empty canvas (the last folder ends at ${Math.round(seen[2560].right)}px)`);
});
