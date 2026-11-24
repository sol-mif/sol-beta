// The person's folders from their own words (#1816 round 2; said.ts, tree.ts words, movein.ts said): the tool only on
// their words this turn and only real folders of theirs; from then the tree is exactly what they said, each folder's own
// folders one level down unless closed, a link inside one folding its target in, and nothing Sol found added. Every case
// is a real folder tree in a temp dir.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-said-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
const wasUi = process.env.SOL_UI_NEXT, wasHome = process.env.HOME;
after(() => {
  rmSync(tmp, { recursive: true, force: true });
  if (wasUi === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasUi;
  process.env.HOME = wasHome;
});
const S = await import("./said.js");
const M = await import("./movein.js");
const { folderTree } = await import("./tree.js");

let n = 0;
/** a person's home (its real path) with Sol's home deep inside a folder of theirs, and the folders `ps` under it */
function rig(ps: string[]) {
  const user = realpathSync(mkdtempSync(join(tmp, `u${n++}-`)));
  const sol = join(user, "c", "Apps", "sol", "home");
  for (const p of ["c/Apps/sol/home/next", ...ps]) mkdirSync(join(user, p), { recursive: true });
  return { user, sol, at: (p: string) => join(user, p) };
}
const shape = (t: ReturnType<typeof folderTree>) => t.map((f) => `${f.name}${f.parent ? " < " + t.find((g) => g.id === f.parent)!.name : ""}`);
const words = (r: ReturnType<typeof rig>, folders: { path: string; name?: string; inside?: string; open?: boolean }[]) =>
  M.setSaid(r.sol, { at: 5, words: "how my folders are", folders: folders.map((f) => ({ ...f, path: r.at(f.path), ...(f.inside ? { inside: r.at(f.inside) } : {}) })) }, 5);
const tree = (r: ReturnType<typeof rig>, places: { id: string; name: string; path: string; from: "home" | "work" }[] = []) =>
  folderTree({ sol: r.sol, user: r.user, movein: M.readMoveIn(r.sol), places });

test("the tree is exactly the folders said, each one's own folders one level down, and nothing Sol found", () => {
  const r = rig(["c/Classes/Bio/week1", "c/Classes/Art", "c/Work/Shop", "c/Work/.cache", "c/scratch/side-copy", "c/Notes"]);
  M.keepMoveIn(r.sol, { keep: ["w:" + r.at("c/scratch/side-copy")] }, 1);
  words(r, [{ path: "c/Classes" }, { path: "c/Work" }]);
  const t = tree(r, [{ id: "w", name: "side-copy", path: r.at("c/scratch/side-copy"), from: "work" }]);
  assert.deepEqual(shape(t), ["Classes", "Art < Classes", "Bio < Classes", "Work", "Shop < Work"]);   // not week1 (two down), not .cache, not the kept side copy, no "c" from the disk
});

test("a folder sits in the one the person put it in, else the nearest of theirs holding it; open: false shows none of its own", () => {
  const r = rig(["c/Classes/Bio", "c/Plans", "c/Code/shop/src", "c/Code/shop/lib"]);
  words(r, [{ path: "c/Classes" }, { path: "c/Classes/Bio", name: "Biology" }, { path: "c/Plans", inside: "c/Classes" }, { path: "c/Code/shop", name: "My shop", open: false }]);
  assert.deepEqual(shape(tree(r)), ["Classes", "Biology < Classes", "Plans < Classes", "My shop"]);
});

test("a link inside a folder of the tree to a folder elsewhere is that folder too (also); a linked child is the target's", () => {
  const r = rig(["c/Classes/Bio", "c/Apps/sol/home/classes/bio", "c/Apps/sol/home/work/shop", "c/Work"]);
  symlinkSync(join(r.sol, "classes", "bio"), r.at("c/Classes/Bio/Sol's notes"));
  symlinkSync(join(r.sol, "work", "shop"), r.at("c/Work/Shop"));
  words(r, [{ path: "c/Classes" }, { path: "c/Work" }]);
  const t = tree(r), bio = t.find((f) => f.name === "Bio")!, shop = t.find((f) => f.name === "Shop")!;
  assert.deepEqual(bio.also, [join(r.sol, "classes", "bio")]);   // Bio is open one level down only, so its link is folded in
  assert.equal(shop.real, join(r.sol, "work", "shop"));   // a child that is a link: a session in the target is in it
  assert.equal(t.find((f) => f.name === "Work")!.also, undefined, "a link that is a folder of the tree is not folded in twice");
});

test("a folder said that is no longer on the disk leaves; Sol's own home's stores never show", () => {
  const r = rig(["c/Classes", "c/Gone"]);
  words(r, [{ path: "c/Classes" }, { path: "c/Gone" }, { path: "c/Apps/sol" }]);
  rmSync(r.at("c/Gone"), { recursive: true });
  assert.deepEqual(shape(tree(r)), ["Classes", "sol"]);   // a folder holding Sol's home can be theirs; Sol's home in it is not
  assert.ok(!tree(r).some((f) => f.path === r.sol), "Sol's home itself is never a folder of the person's");
});

test("the said record is kept through a keep, a Back, a lead, and read back whole", () => {
  const r = rig(["c/Classes"]);
  words(r, [{ path: "c/Classes", name: "School" }]);
  M.keepMoveIn(r.sol, { keep: ["w:/x"] }, 6);
  M.markBatch(r.sol, "b1", M.readMoveIn(r.sol));
  assert.equal(M.unkeep(r.sol, "b1", 7)?.said?.folders[0].name, "School");
  M.setLead(r.sol, { lead: "work" }, 8);
  const m = M.readMoveIn(r.sol)!;
  assert.deepEqual(m.said, { at: 5, words: "how my folders are", folders: [{ path: r.at("c/Classes"), name: "School" }] });
  assert.equal(m.lead, "work");
});

test("checkSaid: a folder on the disk, never the home folder, an app's storage or Sol's home; ~ is the person's home", () => {
  const r = rig(["c/Classes", "Library/App"]);
  const ok = S.checkSaid([{ path: "~/c/Classes/" }, { path: r.at("c/Classes") }], r.sol, r.user);
  assert.deepEqual(ok, { folders: [{ path: r.at("c/Classes") }] }, "once, trailing slash and ~ alike");
  for (const bad of [r.user, r.at("Library/App"), r.sol, r.at("c/nope")]) {
    const x = S.checkSaid([{ path: r.at("c/Classes") }, { path: bad }], r.sol, r.user);
    assert.ok("why" in x, bad);
  }
});

test("folders_set: only on the person's words this turn, only while ui.next is on; then the home's tree is theirs", async () => {
  const r = rig(["c/Classes/Bio", "c/Work"]);
  process.env.HOME = r.user;
  let told = 0;
  S.setSaidTool(r.sol, () => told++);
  const args = { words: "Classes and Work are my folders", folders: [{ path: r.at("c/Classes") }, { path: "~/c/Work" }], yes: "Classes and Work are my folders" };
  process.env.SOL_UI_NEXT = "off";
  assert.equal(S.saidToolsNow().length, 0);
  assert.ok((await S.runSaidTool("folders_set", args, { said: "Classes and Work are my folders" })).isError);
  process.env.SOL_UI_NEXT = "on";
  assert.equal(S.saidToolsNow()[0].name, "folders_set");
  const no = await S.runSaidTool("folders_set", args, { said: "tidy up my sidebar" });
  assert.ok(no.isError && /not in what the person said/.test(no.content[0].text));
  assert.equal(M.readMoveIn(r.sol), null, "nothing written on a guess");
  const ok = await S.runSaidTool("folders_set", args, { said: "Classes and Work are my folders, please" });
  assert.ok(!ok.isError, ok.content[0].text);
  assert.equal(told, 1);
  assert.deepEqual(shape(tree(r)), ["Classes", "Bio < Classes", "Work"]);
  assert.match(readFileSync(M.moveinFile(r.sol), "utf8"), /Classes and Work are my folders/);
  const bad = await S.runSaidTool("folders_set", { ...args, folders: [{ path: r.at("c/Nope") }] }, { said: "Classes and Work are my folders" });
  assert.ok(bad.isError && /not a folder/.test(bad.content[0].text));
  assert.equal(told, 1);
});
