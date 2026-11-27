// Tabs (#1615 BR1; #1879 step 2): a folder kept as a tab opens, is kept across a reload of tabs.json, and closes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeTab, frontTab, openTab, readTabs } from "../src/next/tabs.js";

const home = () => mkdtempSync(join(tmpdir(), "sol-tabs-"));

test("a folder kept as a tab opens, stays across a reload of tabs.json, and closes", () => {
  const h = home();
  try {
    const a = openTab(h, { id: "folder:api", by: "person", kind: "folder", front: true });
    assert.equal(a.ok, true);
    assert.ok(a.ok && a.tabs.some((t) => t.id === "folder:api" && t.kind === "folder" && t.by === "person"));
    assert.ok(a.ok && a.front === "folder:api");
    // a reload: the file read again, as a fresh start reads it
    const r = readTabs(h);
    assert.deepEqual(r.tabs.map((t) => [t.id, t.kind]), [["folder:api", "folder"]]);
    assert.equal(r.front, "folder:api");
    // a folder is no session or page: it is not counted toward the offer to open them as tabs
    assert.deepEqual(r.taken, {});
    const c = closeTab(h, { id: "folder:api" });
    assert.ok(c.ok && c.tabs.length === 0 && c.front === null && c.closed?.id === "folder:api");
    assert.deepEqual(readTabs(h).tabs, []);
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("a folder's id always carries the kind folder, and the kind folder belongs to a folder's id alone", () => {
  const h = home();
  try {
    openTab(h, { id: "folder:web", by: "person" });
    openTab(h, { id: "s-1", by: "person", kind: "folder" });
    openTab(h, { id: "s-2", by: "person", kind: "session" });
    assert.deepEqual(readTabs(h).tabs.map((t) => [t.id, t.kind]), [["folder:web", "folder"], ["s-1", undefined], ["s-2", "session"]]);
    assert.equal(frontTab(h, { id: "folder:web" }).ok, true);
    assert.equal(readTabs(h).front, "folder:web");
  } finally { rmSync(h, { recursive: true, force: true }); }
});
