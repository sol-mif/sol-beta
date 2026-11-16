// Is this checkout the team's own repository? (#479, the beta leak.) The guard's team rules (Take, the nights, branch
// names, merging, test notes, claims) and the dev cycle's locks (#484, sol/locks/team.mjs) hold only there. Any other
// checkout (a Sol tester's, whose remotes are the beta repo, or anyone's) keeps only SAFE_RULES, the ones that protect
// any Sol user. One answer, read from the checkout's remotes, in one place: the guard imports it, and the beta export
// refuses a harness without it (sol/engine/src/team/leak.ts). Plain node, no packages: it ships to Sol testers as it is.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** the team's repository under every name it has had: GitHub forwards the old names, and a checkout cloned before a
 * rename keeps the old one in its remotes (the oldest checkouts still name the first one) */
export const SOL_DEV_REPOS = ["sol-mif/sol-dev", "marcocyl04-ux/sol-dev", "marcocyl04-ux/ecosystem"];

/** the guard's rules that stay on outside the team's repository: home data, keys, the fence, the window. A rule added
 * here reaches every Sol tester, so it must also be in BETA_RULES (sol/engine/src/team/leak.ts), read by a person */
export const SAFE_RULES = new Set(["home-data", "key", "fence", "window"]);

/** true when `url` (a remote's URL: https, ssh, scp-like) names the team's repository (pure). Any host, so an ssh
 * alias counts; the owner and the name must both match, so a fork or a tester's beta repo never does */
export function isSolDev(url) {
  const m = /([^/:\s]+)\/([^/:\s]+?)(?:\.git)?\/*$/.exec(String(url ?? "").trim());
  return !!m && SOL_DEV_REPOS.includes(`${m[1]}/${m[2]}`.toLowerCase());
}

/** a remote that is a folder on this machine (a path, or file://): its folder, else "" */
function localPath(url, dir) {
  const u = String(url ?? "").trim();
  if (u.startsWith("file://")) { try { return fileURLToPath(u); } catch { return ""; } }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^[^/\s]+:/.test(u)) return "";   // https, ssh, scp-like host:path
  return u ? (isAbsolute(u) ? u : resolve(dir, u)) : "";
}

/** files only the team's repository holds: the beta export refuses them at any depth (leak.ts), so a Sol tester's
 * checkout never has them, and changing a remote does not take them away */
export const TEAM_MARKS = ["CONTRIBUTING.md", "docs/how-we-work"];

/** the checkout at `dir` is the team's (impure: asks git and the disk). True when its tree holds a TEAM_MARKS file (so an
 * agent that sets a remote to another address keeps the team's rules on), or any of its remotes names the team's
 * repository (a fork as origin with the team's as upstream counts), or a remote that is a clone on this machine is the
 * team's, up to three steps. When it cannot tell (git fails or times out, a local remote that cannot be read), it says
 * true: the team's rules on, never off by accident. False only when the remotes were read and none is the team's (a
 * Sol tester's, whose remotes are the beta repo; or none at all) */
export function solDevIn(dir, depth = 3) {
  let top = "", out = "";
  try {
    top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    out = execFileSync("git", ["remote", "-v"], { cwd: dir, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
  } catch { return true; }
  if (TEAM_MARKS.some((m) => existsSync(resolve(top, m)))) return true;
  const urls = [...new Set(out.split("\n").map((l) => l.split("\t")[1]?.replace(/\s+\((fetch|push)\)$/, "")).filter(Boolean))];
  if (urls.some(isSolDev)) return true;
  if (depth <= 1) return false;
  return urls.some((u) => { const p = localPath(u, top); return !!p && (!existsSync(p) || solDevIn(p, depth - 1)); });
}
