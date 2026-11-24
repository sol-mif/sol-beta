// node --test src/*.test.ts: no silent nesting (BR1 first-timer P 3, #1615; next/cv/wire/plane.ts). On Lucy's invented
// Mac: a project inside her home, Sol's home, an app's storage or a sync root sits at the top; one inside a project of
// hers sits in it, and the frame says so once, with Back.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Region } from "./next/cv/core.ts";
import type { Data } from "./next/cv/types.ts";
import { holdsAll, nestByPath, nestWords, newNests, setSolHome } from "./next/cv/wire/plane.ts";
import { listed } from "./next/place.ts";

const H = "/Users/you", SOL = "/Users/you/sol/home";
const w = (path: string): Region => ({ id: "w:" + path, name: path.split("/").pop()!, kind: "code", from: "work", path });

test("a place that holds everything is never a folder's parent: her home, Sol's home, app storage, a sync root", () => {
  setSolHome(SOL);
  const rs = nestByPath([w(H), w(SOL), w(`${SOL}/law-project`), w(`${SOL}/jobs`), w(`${H}/Library/Application Support/Notes`), w(`${H}/Library/Application Support/Notes/x`),
    w(`${H}/Dropbox`), w(`${H}/Dropbox/thesis`), w(`${H}/code/shop`), w(`${H}/code/shop/api`)]);
  const parent = (p: string) => rs.find((r) => r.path === p)!.parent ?? null;
  assert.equal(parent(`${SOL}/law-project`), null, "not inside Sol's home");
  assert.equal(parent(`${SOL}/jobs`), null);
  assert.equal(parent(`${H}/Dropbox/thesis`), null, "not inside the sync root");
  assert.equal(parent(`${H}/Library/Application Support/Notes/x`), null, "nothing inside an app's storage");
  assert.equal(parent(SOL), null, "nor Sol's home inside hers");
  assert.equal(parent(`${H}/code/shop/api`), "w:" + `${H}/code/shop`, "a project in a project of hers sits in it, as on disk");
  for (const p of [H, SOL, `${H}/Library`, `${H}/.config`, `${H}/OneDrive - Bakery`, `${H}/iCloud Drive`, "/Users", "/"]) assert.ok(holdsAll(p), p);
  for (const p of [`${H}/Dropbox/thesis`, `${H}/code/shop`, `${SOL}/jobs`]) assert.ok(!holdsAll(p), p);
  setSolHome("");
});

test("each nesting is said once, with how it came: one folder, several in one, several in others", () => {
  const rs = nestByPath([w(`${H}/code/shop`), w(`${H}/code/shop/api`), w(`${H}/code/shop/web`), w(`${H}/school`), w(`${H}/school/law`)]);
  const n = newNests(rs, new Set());
  assert.deepEqual(n.map((x) => [x.name, x.into]), [["api", "shop"], ["web", "shop"], ["law", "school"]]);
  assert.equal(nestWords(n), "3 folders are inside others now, as on your disk");
  assert.equal(nestWords(n.slice(0, 2)), "2 folders are inside shop now, as on your disk");
  assert.equal(nestWords(n.slice(2)), "law is inside school now, as on your disk");
  const told = new Set(n.map((x) => `${x.id}>${rs.find((r) => r.id === x.id)!.parent}`));
  assert.deepEqual(newNests(rs, told), [], "said once: a reload says nothing new");
  const mine = rs.map((r) => (r.name === "law" ? { ...r, parentBy: "person" as const } : r));
  assert.deepEqual(newNests(mine, new Set()).map((x) => x.name), ["api", "web"], "a folder the person put there is theirs, not said");
});

test("the banner says what the canvas draws inside another: never a parent the one list dropped, never the Shelf (BR1 hold 1)", () => {
  // Lucy's 13 kept folders, as on try 3: the sol repo with clean-room and home in it, four of hers in home, another checkout
  // of sol (mac), and cashout-labs (in home) on the Shelf; my-sol and World Building sit in a checkout she did not keep
  const C = `${H}/code/sol`, X = `${H}/scratch/sol`, W = `${H}/code/sol-wt/sol`;
  const kept = [C, `${C}/clean-room`, `${C}/home`, `${W}/mac`, ...["jobs", "law-project", "la245", "is223", "cashout-labs"].map((n) => `${C}/home/${n}`),
    `${X}/my-sol`, `${X}/World Building`, `${H}/code/api`, `${H}/notes`];
  assert.equal(kept.length, 13);
  setSolHome(`${H}/.sol/home`);
  // what work.sessions draws before the list: every folder a session ran in, X and W too, nested by path among them all
  const d: Data = { regions: nestByPath([...kept, X, W].map(w)), pieces: {}, asks: {}, ais: [] };
  const off = (id: string) => id === `w:${C}/home/cashout-labs`;
  assert.equal(newNests(d.regions, new Set(), off).length, 9, "before the list: my-sol, World Building and mac said inside folders it drops");
  // the one list alone (a reload), then the read's row that says mac is another copy of sol
  listed(d, [], { kept: [], added: [], at: 0, folders: kept.map((p) => ({ id: "w:" + p, name: p.split("/").pop()!, path: p })) });
  assert.deepEqual(d.regions.map((r) => r.id).sort(), kept.map((p) => "w:" + p).sort(), "the canvas holds the 13, and only them");
  listed(d, [{ id: `w:${W}/mac`, n: "mac", path: `${W}/mac`, copyOf: "w:" + C }], { kept: [], added: [], at: 0, folders: kept.map((p) => ({ id: "w:" + p, name: p.split("/").pop()!, path: p })) });
  const n = newNests(d.regions, new Set(), off);
  assert.deepEqual(n.map((x) => [x.name, x.into]).sort(), [["clean-room", "sol"], ["home", "sol"], ["is223", "home"], ["jobs", "home"], ["la245", "home"], ["law-project", "home"], ["mac", "sol"]]);
  assert.equal(nestWords(n), "7 folders are inside others now");
  // a parent gone from the canvas draws its folder at the top: not said, though its parent field still names it
  const dangling = [...d.regions, { ...w(`${H}/elsewhere/x`), parent: `w:${X}`, parentBy: "rule" as const }];
  assert.equal(newNests(dangling, new Set(), off).length, 7);
  // a folder inside one on the Shelf is off the canvas with it
  assert.equal(newNests(d.regions, new Set(), (id) => id === `w:${C}/home`).length, 2, "home on the Shelf: only clean-room and mac inside sol");
  // no session anywhere (a reload, or folders Sol never ran in): the one list alone nests the same by path
  const e: Data = { regions: [], pieces: {}, asks: {}, ais: [] };
  const folders = kept.map((p) => ({ id: "w:" + p, name: p.split("/").pop()!, path: p }));
  listed(e, [], { kept: [], added: [], at: 0, folders });
  assert.equal(newNests(e.regions, new Set(), off).length, 6, "the six by path; mac is a copy only once the read says so");
  listed(e, [{ id: `w:${W}/mac`, n: "mac", path: `${W}/mac`, copyOf: "w:" + C }], { kept: [], added: [], at: 0, folders });
  assert.deepEqual(newNests(e.regions, new Set(), off).map((x) => x.name).sort(), n.map((x) => x.name).sort());
  setSolHome("");
});
