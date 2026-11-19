// The policy paragraph's store (#828; design §6.4): the person's paragraph as text, nothing else.
//   <HOME>/policy.md                    the paragraph now, written whole; absent reads as the empty paragraph
//   <HOME>/sources/policy/<ver>.md      every text it ever had, never deleted; `ver` is the SHA-256 of the text's
//                                       canonical JSON (canonical.ts hashOf), so an undo can put an older one back
// Every change of the text is one policy.write { ver, from } with `cause` the act it follows from (R2). The order: the
// version's file, then the event, then policy.md, so the log never names a text that is not on the disk; a policy.md
// left behind by a stop between the two is put right at start (reconcilePolicy; a policy.md edited by hand is put
// right too, its text kept under sources/policy/ first). Nothing here is made until the first
// write: with Home's switch off there is no policy.md.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashOf } from "../canonical.js";
import { plainIn, writeWhole } from "../safewrite.js";
import type { By } from "../file-trail.js";
import { ENGINE, type HomeEv } from "./log.js";
import type { Ctx } from "./unit.js";

const file = (home: string) => join(home, "policy.md");
const versions = (home: string) => join(home, "sources", "policy");
/** a text's fingerprint (pure) */
export const policyVer = (text: string): string => hashOf(text);
const read = (f: string, home: string): string | null => { const p = plainIn(f, home); if (!p) return null; try { return readFileSync(p, "utf8"); } catch { return null; } };

/** the paragraph now: "" when there is none */
export const policyText = (home: string): string => read(file(home), home) ?? "";
/** one of the texts the paragraph had, by its fingerprint; null when it was never kept */
export function policyVersion(home: string, ver: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(ver)) return null;
  const t = read(join(versions(home), `${ver}.md`), home);
  return t !== null && policyVer(t) === ver ? t : null;
}
/** a text kept under sources/policy/ (if it is not there yet), and its fingerprint */
function keep(home: string, text: string): string {
  const ver = policyVer(text);
  if (policyVersion(home, ver) === null) writeWhole(join(versions(home), `${ver}.md`), text, { root: home });
  return ver;
}

type More = { cause?: string; by?: By; undo?: boolean };
/** the paragraph made this text: both versions kept, one policy.write, then policy.md. null (nothing written) when the
 *  text is the one there */
export function putPolicy(ctx: Ctx, text: string, more: More = {}): HomeEv | null {
  const was = policyText(ctx.home), from = policyVer(was), ver = policyVer(text);
  if (ver === from) return null;
  keep(ctx.home, was);
  keep(ctx.home, text);
  const e = ctx.log.write({ kind: "policy.write", value: { ver, from, ...(more.undo ? { undo: true } : {}) }, by: more.by ?? ENGINE, ...(more.cause ? { cause: more.cause } : {}) });
  writeWhole(file(ctx.home), text, { root: ctx.home });
  return e;
}
/** the version the log names last (its newest policy.write), or null when the log has none */
export function loggedPolicy(evs: HomeEv[]): string | null {
  for (let i = evs.length - 1; i >= 0; i--) if (evs[i].kind === "policy.write") return String((evs[i].value as { ver?: unknown } | undefined)?.ver ?? "") || null;
  return null;
}
/** at start: a policy.md that is not the version the log names last (the engine stopped between the event and the
 *  file) is put back to it from sources/policy/; no event, the log already says it. true when it was put back */
export function reconcilePolicy(ctx: Ctx): boolean {
  const ver = loggedPolicy(ctx.log.all());
  if (!ver || policyVer(policyText(ctx.home)) === ver) return false;
  const t = policyVersion(ctx.home, ver);
  if (t === null) return false;
  keep(ctx.home, policyText(ctx.home));   // a hand-edited policy.md: its words kept under sources/policy/, not lost
  writeWhole(file(ctx.home), t, { root: ctx.home });
  return true;
}
