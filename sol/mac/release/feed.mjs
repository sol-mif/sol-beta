// The app's update feed: what the release workflow on sol-beta writes beside Sol-mac.zip so a
// Sol.app finds its next version: Sol-mac.app.tar.gz, its signature, and latest.json in Tauri's updater format, at
// https://github.com/sol-mif/sol-beta/releases/latest/download/latest.json. Plain node, no packages: it runs on the
// release runner before anything is installed, and its tests (feed.test.mjs) run there before it publishes.
//   node feed.mjs version <tag>                         the app's version for a release tag
//   node feed.mjs feed <tag> <owner/repo> <sig file> <notes>   latest.json, on stdout
//   node feed.mjs pubkey <tauri.conf.json>              the app's updater public key, "" while it has none
//   node feed.mjs verify <archive> <sig file> <pubkey> [version]   exit 0 when the signature is the key's (and carries
//                                                       the version), 1 when not
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";

// a dev release only: the workflow's own build-* fallback (and an old stable-* stamp) is a time, not a release, and gets no
// version and no feed. dev-YYYYMMDD-0000 is no release either: dev-YYYYMMDD is the day's .0 already, and two releases
// with one version would leave the second never installed (a fix at midnight is -0001)
const TAG = /^dev-(\d{4})(\d{2})(\d{2})(?:-(\d{2})(\d{2}))?$/;

/** a release tag's app version, 0.<YYYYMMDD>.<HHMM>: the time as a number (semver allows no leading zero), 0 for a
 *  morning release with no time. The repo's tauri.conf.json keeps 0.1.0; the workflow builds with this one */
export function versionOf(tag) {
  const m = TAG.exec(tag);
  const [y, mo, d, h = "00", mi = "00"] = m ? m.slice(1) : [];
  const day = m && new Date(Date.UTC(+y, +mo - 1, +d));
  if (!m || day.getUTCFullYear() !== +y || day.getUTCMonth() !== +mo - 1 || day.getUTCDate() !== +d || +h > 23 || +mi > 59 || m[4] + m[5] === "0000")
    throw new Error(`not a release tag: ${JSON.stringify(tag)} (dev-YYYYMMDD or dev-YYYYMMDD-HHMM, HHMM from 0001)`);
  return `0.${y}${mo}${d}.${Number(h + mi)}`;
}

/** latest.json: both Mac chips on the one universal archive, at the tag's own URL (not latest/, so the archive a Sol
 *  downloads is the one this signature is for even if a newer release lands meanwhile) */
export function feedOf({ tag, repo, signature, notes, date }) {
  const sig = signature.trim();
  if (!sig) throw new Error("no feed without a signature");
  const url = `https://github.com/${repo}/releases/download/${tag}/Sol-mac.app.tar.gz`;
  const one = { url, signature: sig };
  return { version: versionOf(tag), notes, pub_date: date.toISOString(), platforms: { "darwin-aarch64": one, "darwin-x86_64": { ...one } } };
}

// minisign, as tauri signer writes it and tauri-plugin-updater reads it: the key and the .sig are each a base64'd
// minisign text file. The key line: "Ed", 8-byte id, 32-byte Ed25519 key. The signature line: "ED" (the file's
// BLAKE2b-512 signed) or "Ed" (the file itself), the id, 64 bytes; then the trusted comment, signed with the signature.
const line = (b64, n) => Buffer.from(Buffer.from(b64.trim(), "base64").toString("utf8").split("\n")[n] ?? "", "base64");

/** the archive's signature checked against a public key, as the app will check it; with a version, the signature must
 *  carry it too (tauri signer --app-version puts "version:<v>" in the signed trusted comment, which requireSignedVersion
 *  compares with latest.json's), so an old signed archive cannot be offered under a newer version */
export function verify(body, sigB64, pubB64, version) {
  try {
    const pk = line(pubB64, 1), sg = line(sigB64, 1);
    const text = Buffer.from(sigB64.trim(), "base64").toString("utf8").split("\n");
    const trusted = (text[2] ?? "").replace(/^trusted comment: /, ""), global = Buffer.from(text[3] ?? "", "base64");
    if (version !== undefined && !trusted.split("\t").includes(`version:${version}`)) return false;
    if (pk.length !== 42 || sg.length !== 74 || pk.subarray(0, 2).toString() !== "Ed") return false;
    if (!pk.subarray(2, 10).equals(sg.subarray(2, 10))) return false;
    const alg = sg.subarray(0, 2).toString(), sig = sg.subarray(10);
    if (alg !== "ED" && alg !== "Ed") return false;
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pk.subarray(10).toString("base64url") }, format: "jwk" });
    const msg = alg === "ED" ? createHash("blake2b512").update(body).digest() : body;
    return edVerify(null, msg, key, sig) && edVerify(null, Buffer.concat([sig, Buffer.from(trusted)]), key, global);
  } catch { return false; }
}

// run, not imported: node's own word for it, not a comparison of paths a symlink makes differ. A node too old to say
// (before 24.2) stops here, loud, so a verify never passes by doing nothing
if (import.meta.main === undefined) { console.error("feed: needs node 24.2 or later (import.meta.main)"); process.exit(2); }
if (import.meta.main) {
  const [cmd, ...a] = process.argv.slice(2);
  try {
    if (cmd === "version") console.log(versionOf(a[0] ?? ""));
    else if (cmd === "feed") console.log(JSON.stringify(feedOf({ tag: a[0], repo: a[1], signature: readFileSync(a[2], "utf8"), notes: a[3] ?? "", date: new Date() }), null, 2));
    else if (cmd === "pubkey") console.log(JSON.parse(readFileSync(a[0], "utf8")).plugins?.updater?.pubkey ?? "");
    else if (cmd === "verify") process.exit(verify(readFileSync(a[0]), readFileSync(a[1], "utf8"), a[2] ?? "", a[3]) ? 0 : 1);
    else { console.error("feed: version <tag> | feed <tag> <owner/repo> <sig file> <notes> | pubkey <conf> | verify <archive> <sig file> <pubkey>"); process.exit(2); }
  } catch (e) { console.error(`feed: ${e.message}`); process.exit(2); }
}
