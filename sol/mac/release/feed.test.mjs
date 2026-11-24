// The updater feed's tests: run by the release workflow before it publishes, and by hand with
//   node --test sol/mac/release/
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign as edSign, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { versionOf, feedOf, verify } from "./feed.mjs";

test("the version comes from the tag: 0.<YYYYMMDD>.<HHMM>, the time without leading zeros (semver)", () => {
  assert.equal(versionOf("dev-20261123-1820"), "0.20261123.1820");
  assert.equal(versionOf("dev-20261123-0820"), "0.20261123.820");
  assert.equal(versionOf("dev-20261124-0005"), "0.20261124.5");
  assert.equal(versionOf("dev-20261123"), "0.20261123.0");   // the morning release has no time: the day's first
});

test("a later release is always a higher version (the updater never moves on an equal or lower one)", () => {
  const order = ["dev-20261122-2359", "dev-20261123", "dev-20261123-0005", "dev-20261123-0820", "dev-20261123-1820", "dev-20261124"];
  const key = (v) => v.split(".").map(Number);
  for (let i = 1; i < order.length; i++) {
    const [a, b] = [key(versionOf(order[i - 1])), key(versionOf(order[i]))];
    assert.ok(a[1] < b[1] || (a[1] === b[1] && a[2] < b[2]), `${order[i - 1]} < ${order[i]}`);
  }
});

test("a tag that is no release is refused, never guessed", () => {
  for (const t of ["", "v12", "build-20261123-1820", "stable-20261123-1820", "dev-2026112", "dev-20261123-182", "dev-20261123-2460", "dev-20261123-1860", "dev-20261332", "x-20261123-1820", "dev-20261123-1820 ", "dev-20261123-1820-1"])
    assert.throws(() => versionOf(t), /not a release tag/, JSON.stringify(t));
});

test("latest.json is Tauri's updater format, both Mac chips on the one universal archive, the tag's own URL", () => {
  const f = feedOf({ tag: "dev-20261123-1820", repo: "sol-mif/sol-beta", signature: "c2ln\n", notes: "Sol dev-20261123-1820", date: new Date("2026-11-23T23:20:00Z") });
  assert.deepEqual(Object.keys(f).sort(), ["notes", "platforms", "pub_date", "version"]);
  assert.equal(f.version, "0.20261123.1820");
  assert.equal(f.pub_date, "2026-11-23T23:20:00.000Z");
  assert.equal(f.notes, "Sol dev-20261123-1820");
  const url = "https://github.com/sol-mif/sol-beta/releases/download/dev-20261123-1820/Sol-mac.app.tar.gz";
  assert.deepEqual(f.platforms, { "darwin-aarch64": { url, signature: "c2ln" }, "darwin-x86_64": { url, signature: "c2ln" } });
});

test("no feed without a signature", () => {
  assert.throws(() => feedOf({ tag: "dev-20261123-1820", repo: "sol-mif/sol-beta", signature: " \n", notes: "", date: new Date() }), /signature/);
});

// a minisign key and signature made here the way tauri signer makes them (Ed25519 over the file's BLAKE2b-512, "ED"),
// so the check is tested without the tauri CLI
function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const id = randomBytes(8);
  const pubFile = `untrusted comment: minisign public key\n${Buffer.concat([Buffer.from("Ed"), id, raw]).toString("base64")}\n`;
  return { pubkey: Buffer.from(pubFile).toString("base64"), privateKey, id };
}
function signed(k, body, trusted = "timestamp:1\tfile:Sol-mac.app.tar.gz") {
  const sig = edSign(null, createHash("blake2b512").update(body).digest(), k.privateKey);
  const g = edSign(null, Buffer.concat([sig, Buffer.from(trusted)]), k.privateKey);
  const file = `untrusted comment: signature from tauri secret key\n${Buffer.concat([Buffer.from("ED"), k.id, sig]).toString("base64")}\ntrusted comment: ${trusted}\n${g.toString("base64")}\n`;
  return Buffer.from(file).toString("base64");
}

test("verify: the archive's signature against the app's public key", () => {
  const k = keyPair(), body = randomBytes(4096);
  assert.equal(verify(body, signed(k, body), k.pubkey), true);
});

test("verify refuses a changed archive, another key, a changed trusted comment, and garbage", () => {
  const k = keyPair(), other = keyPair(), body = randomBytes(4096);
  const s = signed(k, body);
  const changed = Buffer.from(body); changed[7] ^= 1;
  assert.equal(verify(changed, s, k.pubkey), false);
  assert.equal(verify(body, s, other.pubkey), false);
  const lines = Buffer.from(s, "base64").toString().split("\n");
  lines[2] = "trusted comment: timestamp:2\tfile:Sol-mac.app.tar.gz";
  assert.equal(verify(body, Buffer.from(lines.join("\n")).toString("base64"), k.pubkey), false);
  assert.equal(verify(body, "bm90IGEgc2ln", k.pubkey), false);
});

test("verify with a version: the signature must carry it (tauri signer --app-version), so an old archive is never sold as new", () => {
  const k = keyPair(), body = randomBytes(1024);
  const bound = signed(k, body, "timestamp:1\tfile:Sol-mac.app.tar.gz\tversion:0.20261123.905");
  assert.equal(verify(body, bound, k.pubkey, "0.20261123.905"), true);
  assert.equal(verify(body, bound, k.pubkey, "0.20261124.0"), false);
  assert.equal(verify(body, bound, k.pubkey, "0.20261123.90"), false);
  assert.equal(verify(body, signed(k, body), k.pubkey, "0.20261123.905"), false);   // signed with no version
  assert.equal(verify(body, signed(k, body, "timestamp:1\tversion:0.20261123.905x"), k.pubkey, "0.20261123.905"), false);
});

test("dev-YYYYMMDD-0000 is refused: dev-YYYYMMDD is already the day's .0, and two releases never share a version", () => {
  assert.equal(versionOf("dev-20261123"), "0.20261123.0");
  assert.throws(() => versionOf("dev-20261123-0000"), /not a release tag/);
  assert.equal(versionOf("dev-20261123-0001"), "0.20261123.1");
});

test("the commands answer when feed.mjs is run through a symlinked path (macOS /tmp is one)", () => {
  const dir = mkdtempSync(join(tmpdir(), "feed-"));
  try {
    const real = join(dir, "real"); mkdirSync(real);
    copyFileSync(fileURLToPath(new URL("./feed.mjs", import.meta.url)), join(real, "feed.mjs"));
    symlinkSync(real, join(dir, "link"));
    const r = spawnSync(process.execPath, [join(dir, "link", "feed.mjs"), "version", "dev-20261123-0905"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "0.20261123.905");
    const bad = spawnSync(process.execPath, [join(dir, "link", "feed.mjs"), "verify", "/nonexistent", "/nonexistent", ""], { encoding: "utf8" });
    assert.notEqual(bad.status, 0, "a verify that cannot read its files never passes");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
