// The attach menu's engine half (next/attach.ts): a photo, a file or the Sol window's shot kept under
// SOL_HOME/next/attach, its name never a path, on a made-up Sol home. Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MAX_BYTES, dirOf, putOf, safeName, shotOf } from "./attach.js";

const home = () => mkdtempSync(join(tmpdir(), "sol-attach-"));

test("a file is kept under SOL_HOME/next/attach with its name made safe, never a path", () => {
  const sol = home();
  try {
    const k = putOf(sol, { kind: "photo", name: "../../Denise's garden.jpg", data: Buffer.from("pixels").toString("base64") });
    assert.ok(k.ok);
    if (!k.ok) return;
    assert.equal(dirname(k.path), dirOf(sol));
    assert.match(k.path, /-Denises-garden\.jpg$/);
    assert.equal(readFileSync(k.path, "utf8"), "pixels");
    assert.equal(k.kind, "photo");
    assert.equal(safeName("/etc/passwd"), "passwd");
    assert.equal(safeName("..."), "file");
  } finally { rmSync(sol, { recursive: true, force: true }); }
});

test("an empty, too big or bytes-less file is refused with a reason", () => {
  const sol = home();
  try {
    assert.equal(putOf(sol, { name: "a.txt", data: "" }).ok, false);
    assert.equal(putOf(sol, { name: "a.txt" }).ok, false);
    const big = putOf(sol, { name: "a.bin", data: Buffer.alloc(MAX_BYTES + 1).toString("base64") });
    assert.equal(big.ok, false);
  } finally { rmSync(sol, { recursive: true, force: true }); }
});

test("the shot is the window's, kept, with a picture for the card; no window says why", async () => {
  const sol = home();
  try {
    const s = await shotOf(sol, async () => "abc", (id) => (id === "abc" ? Buffer.from("jpeg") : null));
    assert.ok(s.ok);
    if (!s.ok) return;
    assert.equal(s.name, "Screenshot of the app");
    assert.equal(readFileSync(s.path, "utf8"), "jpeg");
    assert.equal(s.url, `data:image/jpeg;base64,${Buffer.from("jpeg").toString("base64")}`);
    const no = await shotOf(sol, async () => { throw new Error("the Sol window was not found"); });
    assert.deepEqual(no, { ok: false, why: "no screenshot: the Sol window was not found" });
    // Screen Recording off: screencapture makes no image of the window, and the answer says perm so the face can say how
    const off = await shotOf(sol, async () => { throw new Error("screencapture: could not create image from window"); });
    assert.deepEqual(off, { ok: false, why: "no screenshot: Sol needs Screen Recording", perm: true });
  } finally { rmSync(sol, { recursive: true, force: true }); }
});
