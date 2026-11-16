// The feature map (#480): specs/features.json read through team/features.ts, the shape the round 5 contracts fix. The
// reader drops what is not a feature, a file belongs to the most specific glob, and the committed map is whole: every
// path matches a file, every dependsOn names a feature, every lead is a login. Nothing reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { devOnly, ROOT } from "./dev-copy.ts";

const { readFeatures, featureOf, featureIn, featureOfChange, folderOf, globRe, cleanFeature, featuresIn, approvedIn, evalsOf, typeLabel, typeOfLabel, TYPE_LABELS, LABELS, FEATURES_PATH, TYPES } = await import("../src/team/features.ts");

const one = (o: Record<string, unknown> = {}) => ({ id: "fr-01", name: "Open Sol", slug: "open-sol", type: "product", label: "base", where: "the window", lead: "marco", support: [], dependsOn: [], paths: ["sol/mac/src/App.tsx"], off: null, ...o });
function checkout(features: unknown[]): string {
  const root = mkdtempSync(join(tmpdir(), "features-"));
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, FEATURES_PATH), JSON.stringify({ version: 1, features }));
  return root;
}

test("a feature is made valid, or is none", () => {
  assert.deepEqual(cleanFeature(one()), one());
  assert.equal(cleanFeature(one({ id: "fr-1" })), null, "two digits");
  assert.equal(cleanFeature(one({ type: "kind" })), null, "a type of work, one of three");
  assert.equal(cleanFeature(one({ paths: [] })), null, "a feature owns some code");
  assert.equal(cleanFeature(one({ paths: ["../x"] })), null, "never a path out of the repo");
  assert.equal(cleanFeature(one({ slug: "Open Sol" })), null);
  const f = cleanFeature(one({ label: "nope", lead: "not a login!", support: ["frank", "x y"], dependsOn: ["fr-02", "x"], off: "" }))!;
  assert.equal(f.label, "");
  assert.equal(f.lead, "");
  assert.deepEqual(f.support, ["frank"]);
  assert.deepEqual(f.dependsOn, ["fr-02"]);
  assert.equal(f.off, null);
  assert.deepEqual([...TYPES], ["internal", "product", "marketing"]);
  assert.equal(cleanFeature(one({ label: "product" }))!.label, "", "the old area label product goes away (decision 18)");
  assert.ok(!(LABELS as readonly string[]).includes("product"));
  assert.equal(cleanFeature(one({ id: "fr-100" }))!.id, "fr-100");
});

test("type labels: type:internal, type:product, type:marketing, never the bare word (#488's review, B1)", () => {
  assert.deepEqual(TYPE_LABELS, ["type:internal", "type:product", "type:marketing"]);
  assert.equal(typeLabel("product"), "type:product");
  assert.equal(typeOfLabel("type:marketing"), "marketing");
  assert.equal(typeOfLabel("product"), "", "the area label is no type");
  assert.equal(typeOfLabel("type:kind"), "");
});

test("a map keeps each id once, and a checkout with none reads empty", () => {
  assert.deepEqual(featuresIn({ features: [one(), one({ name: "again" }), "x", null] }).map((f) => f.name), ["Open Sol"]);
  assert.deepEqual(featuresIn(null), []);
  assert.deepEqual(readFeatures(mkdtempSync(join(tmpdir(), "nomap-"))), [], "a Sol tester's copy has no specs/");
  const root = mkdtempSync(join(tmpdir(), "badmap-"));
  mkdirSync(join(root, "specs"));
  writeFileSync(join(root, FEATURES_PATH), "{ not json");
  assert.deepEqual(readFeatures(root), []);
});

test("globs: a directory, a star, two stars", () => {
  assert.ok(globRe("sol/engine/src/work/").test("sol/engine/src/work/runs.ts"));
  assert.ok(globRe("sol/engine/src/work/").test("sol/engine/src/work/a/b.ts"));
  assert.ok(!globRe("sol/engine/src/work/").test("sol/engine/src/workshop.ts"));
  assert.ok(globRe("sol/*.md").test("sol/README.md"));
  assert.ok(!globRe("sol/*.md").test("sol/a/README.md"));
  assert.ok(globRe("sol/**/x.ts").test("sol/x.ts"));
  assert.ok(globRe("sol/**/x.ts").test("sol/a/b/x.ts"));
  assert.ok(globRe("sol/release").test("sol/release"));
  assert.ok(!globRe("sol/release").test("sol/releases"));
  assert.ok(globRe("a.b?").test("a.bc") && !globRe("a.b").test("axb"), "a dot is a dot");
});

test("featureOf: the most specific glob wins, none is null", () => {
  const root = checkout([
    one({ id: "fr-07", slug: "session", paths: ["sol/engine/src/work/"] }),
    one({ id: "fr-08", slug: "side-copies", paths: ["sol/engine/src/work/copies.ts"] }),
    one({ id: "fr-20", slug: "cowork", paths: ["sol/engine/src/team/**"] }),
  ]);
  assert.equal(featureOf(root, "sol/engine/src/work/runs.ts")?.id, "fr-07");
  assert.equal(featureOf(root, "sol/engine/src/work/copies.ts")?.id, "fr-08");
  assert.equal(featureOf(root, "./sol/engine/src/team/x.ts")?.id, "fr-20");
  assert.equal(featureOf(root, "README.md"), null);
  assert.equal(folderOf({ id: "fr-08", slug: "side-copies" }), "specs/features/fr-08-side-copies");
  // a change's feature: the one most of its files belong to, the first in the map on a tie (#476, #481)
  const fs = readFeatures(root);
  assert.equal(featureOfChange(fs, ["sol/engine/src/work/runs.ts", "sol/engine/src/work/a.ts", "sol/engine/src/team/x.ts"])?.id, "fr-07");
  assert.equal(featureOfChange(fs, ["sol/engine/src/team/x.ts", "sol/engine/src/work/a.ts"])?.id, "fr-07", "a tie: the first in the map");
  assert.equal(featureOfChange(fs, ["README.md"]), null);
  assert.equal(featureOfChange([], ["sol/engine/src/work/a.ts"]), null);
});

test("evals: approved only by the Status line the press writes", () => {
  assert.ok(approvedIn("# fr-12 · Open Sol: evals\n\nStatus: Approved by marcocyl04-ux on 2026-11-02\n"));
  assert.ok(!approvedIn("Status: draft\n"));
  assert.ok(!approvedIn("Status: Approved\n"), "who and when, or it is not the press's line");
  assert.ok(!approvedIn("<!-- Status: Approved by x on 2026-11-02 -->"), "a comment is not the line");
  // only the first Status line counts (#492's review; the gate, #481, reads the same line)
  assert.ok(!approvedIn("# fr-12\n\nStatus: draft\n\n<!--\nStatus: Approved by mallory on 2026-11-02\n-->\n"), "a draft, then a fake press's line in a comment");
  assert.ok(!approvedIn("Status: draft\nStatus: Approved by marco on 2026-11-02\n"), "a draft, then a second Status line");
  assert.ok(approvedIn("# fr-12\r\n\r\nStatus: Approved by marco on 2026-11-02\r\n\r\n## Ways to use it\r\n"), "the press's line first, CRLF too");
  assert.ok(!approvedIn("Status: Approved by marco on 2026-11-02 (and more)\n"));
  const root = checkout([one()]);
  const f = readFeatures(root)[0];
  assert.equal(evalsOf(root, f), "none");
  mkdirSync(join(root, folderOf(f)), { recursive: true });
  writeFileSync(join(root, folderOf(f), "eval.md"), "Status: draft\n");
  assert.equal(evalsOf(root, f), "draft");
  writeFileSync(join(root, folderOf(f), "eval.md"), "Status: Approved by marco on 2026-11-02\n");
  assert.equal(evalsOf(root, f), "approved");
});

// the committed map: whole and honest, so the locks (#484) and the error counts (#485) can trust it
const skip = devOnly(FEATURES_PATH);
test("the committed map: ids, paths that match files, dependsOn, leads", { skip }, () => {
  const fs = readFeatures(ROOT);
  assert.ok(fs.length >= 15 && fs.length <= 30, `15 to 30 features, not ${fs.length}`);
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === "node_modules" || n === ".git" || n === "dist" || n === "target") continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else files.push(relative(ROOT, p));
    }
  };
  walk(ROOT);
  const ids = new Set(fs.map((f) => f.id));
  for (const f of fs) {
    assert.ok(f.lead, `${f.id} has a lead`);
    // an area label, one of five (the old "product", what is not code, goes away: decision 18); only a marketing feature
    // may have none, as no area holds getting Sol to people yet (the briefing places it)
    assert.ok(f.label || f.type === "marketing", `${f.id} has one of the five area labels`);
    assert.ok(f.where, `${f.id} says where a Sol user sees it`);
    for (const d of f.dependsOn) assert.ok(ids.has(d) && d !== f.id, `${f.id} depends on ${d}, a feature`);
    for (const g of f.paths) {
      if (["sol/features", "sol/worktype", "sol/engine/src/team/area.ts"].includes(g)) continue;   // landing with this map
      const re = globRe(g);
      assert.ok(files.some((x) => re.test(x)) || existsSync(join(ROOT, g)), `${f.id}'s path ${g} matches a file`);
    }
  }
  assert.equal(featureOf(ROOT, "sol/engine/src/work/copies.ts")?.slug, "side-copies");
  assert.equal(featureOf(ROOT, "site/index.html")?.type, "marketing");
});
