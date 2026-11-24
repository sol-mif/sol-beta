// The person's folders, one tree (#1816, tree.ts): one id per real folder, only what is on the disk now, none of Sol's
// own, nested by the disk with the disk's shared parents added. Every case is a real folder tree in a temp dir.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderTree, treeDirs, treeKey, type TreeIn } from "./tree.ts";
import type { MoveInKept } from "./movein.ts";
import { isProjectStore } from "../home/own-folders.ts";

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
/** a person's home with Sol's home in it, and the folders `ps` made under the person's home */
function rig(ps: string[]) {
  const user = mkdtempSync(join(tmpdir(), "sol-tree-")); dirs.push(user);
  const sol = join(user, "Sol");
  for (const p of ["Sol", ...ps]) mkdirSync(join(user, p), { recursive: true });
  return { user, sol, at: (p: string) => join(user, p) };
}
const moved = (keep: string[], o: Partial<MoveInKept> = {}): MoveInKept => ({ v: 1, on: 1, at: 1, keep, fix: {}, drop: [], lead: null, ...o });
const shape = (t: ReturnType<typeof folderTree>) => t.map((f) => `${f.name}${f.parent ? " < " + t.find((g) => g.id === f.parent)!.name : ""}${f.by ? " (disk)" : ""}`);
const home = (sol: string, ...ids: string[]): TreeIn["places"] => ids.map((id) => ({ id, name: id.split("/").pop()!, path: join(sol, id), from: "home" as const }));

test("before the move-in there is no tree: the canvas draws the read", () => {
  const r = rig(["School/LA245"]);
  assert.deepEqual(folderTree({ sol: r.sol, user: r.user, movein: null, places: [] }), []);
});

test("two folders in one real folder sit in it, and that folder joins the tree from the disk", () => {
  const r = rig(["School/LA245", "School/IS223", "Code/shop"]);
  const t = folderTree({ sol: r.sol, user: r.user, places: [], movein: moved(["w:" + r.at("School/LA245"), "w:" + r.at("School/IS223"), "w:" + r.at("Code/shop")]) });
  assert.deepEqual(shape(t), ["School (disk)", "LA245 < School", "IS223 < School", "shop"]);
  assert.equal(t.find((f) => f.name === "School")!.id, "w:" + r.at("School"));
});

test("a parent the disk has is added only where it holds two of them, the nearest one, and again above it", () => {
  const r = rig(["c/personal/projects/sol", "c/personal/projects/kaat", "c/misc", "c/work/projects/cash"]);
  const keep = ["c/personal/projects/sol", "c/personal/projects/kaat", "c/misc", "c/work/projects/cash"].map((p) => "w:" + r.at(p));
  assert.deepEqual(shape(folderTree({ sol: r.sol, user: r.user, places: [], movein: moved(keep) })),
    ["c (disk)", "projects < c (disk)", "sol < projects", "kaat < projects", "misc < c", "cash < c"]);
});

test("the person's home, an app's storage and a sync root are never a parent", () => {
  const r = rig(["a", "b", "Library/x", "Library/y"]);
  const keep = ["a", "b", "Library/x", "Library/y"].map((p) => "w:" + r.at(p));
  assert.deepEqual(shape(folderTree({ sol: r.sol, user: r.user, places: [], movein: moved(keep) })), ["a", "b"]);
});

test("one folder, one id: kept by its path, read in Sol's home, it is the home's folder once, with the person's name", () => {
  const r = rig(["Sol/school/la245", "Sol/school/is223"]);
  const t = folderTree({ sol: r.sol, user: r.user, places: home(r.sol, "school", "school/la245", "school/is223"),
    movein: moved(["w:" + join(r.sol, "school/la245"), "h:school/la245"], { fix: { ["w:" + join(r.sol, "school/la245")]: { name: "LA 245" } } }) });
  assert.deepEqual(t.map((f) => f.id), ["h:school", "h:school/la245", "h:school/is223"]);
  assert.equal(t.find((f) => f.id === "h:school/la245")!.name, "LA 245");
});

test("Sol's home is never a folder, and a folder of it never sits in what holds it", () => {
  const r = rig(["proj/sol/home/school", "proj/sol/src", "proj/other"]);
  const sol = r.at("proj/sol/home");
  const t = folderTree({ sol, user: r.user, places: home(sol, "school"), movein: moved(["w:" + sol, "w:" + r.at("proj/sol"), "w:" + r.at("proj/other")]) });
  assert.deepEqual(shape(t), ["proj (disk)", "sol < proj", "other < proj", "school"]);
});

test("a folder Sol's home links to elsewhere is one folder, its real place said so a session there finds it", () => {
  const r = rig(["Notes/School/LA245"]);
  symlinkSync(r.at("Notes/School"), join(r.sol, "school"));
  const t = folderTree({ sol: r.sol, user: r.user, places: home(r.sol, "school", "school/LA245"), movein: moved(["w:" + r.at("Notes/School/LA245")]) });
  assert.deepEqual(t.map((f) => f.id).sort(), ["h:school", "w:" + r.at("Notes/School/LA245")].sort(), "kept by its real path first: the link's way to it is not a second folder");
  assert.equal(t.find((f) => f.id === "h:school")!.real, realpathSync(r.at("Notes/School")));
});

test("a folder no longer on the disk leaves; a dropped one never comes", () => {
  const r = rig(["a", "Sol/life", "Sol/jobs"]);
  const t = folderTree({ sol: r.sol, user: r.user, places: home(r.sol, "life", "jobs"), movein: moved(["w:" + r.at("a"), "w:" + r.at("gone")], { drop: ["h:life"] }) });
  assert.deepEqual(t.map((f) => f.name), ["a", "jobs"]);
});

test("none of Sol's own: its stores, a project's folder of stores, and one it left empty for a project", () => {
  const r = rig(["Sol/next", "Sol/tmp", "Sol/school", "Sol/web/sessions", "Sol/my-app", "Sol/Folder"]);
  writeFileSync(join(r.sol, "web", "pieces-seen.json"), "{}");
  const t = folderTree({ sol: r.sol, user: r.user, places: home(r.sol, "next", "tmp", "school", "web", "my-app", "Folder"), movein: moved([]),
    slugs: ["-Users-x-code-my-app", "-Users-x-code-web"] });
  assert.deepEqual(t.map((f) => f.name), ["tmp", "school", "Folder"]);
});

test("a project's store name is Sol's way of naming the folder a session ran in", () => {
  assert.equal(isProjectStore("my-sol", ["-Users-x-p-my-sol"]), true);
  assert.equal(isProjectStore("marco-sol-product-831d0b", ["-Users-x-p-sol--claude-worktrees-marco-sol-product-831d0b"]), true);
  assert.equal(isProjectStore("folder", ["-Users-x-p-my-sol"]), false);
  assert.equal(isProjectStore("---", ["-Users-x----"]), false);
});

test("the tree's key changes when a folder moves; the disk is followed where its folders sit", () => {
  const r = rig(["School/LA245", "School/IS223"]);
  const keep = ["w:" + r.at("School/LA245"), "w:" + r.at("School/IS223")];
  const a = folderTree({ sol: r.sol, user: r.user, places: [], movein: moved(keep) });
  rmSync(r.at("School/IS223"), { recursive: true });
  const b = folderTree({ sol: r.sol, user: r.user, places: [], movein: moved(keep) });
  assert.notEqual(treeKey(a), treeKey(b));
  assert.deepEqual(shape(b), ["LA245"]);
  assert.ok(treeDirs(a, r.sol).includes(r.at("School")));
});
