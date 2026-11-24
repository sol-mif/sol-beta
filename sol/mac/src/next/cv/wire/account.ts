// Who is signed in, for Settings' Account row (BR1 item 6, #1615): the engine's team.cloud.me (whose Sol this is on the
// shared hub, the onboarding's own question), read on attach and again whenever team.state says the cloud changed;
// Sign in is team.cloud.signin (Google in the system browser) and Sign out team.cloud.signout (sol/PROTOCOL.md, "Face →
// engine (Control, Cowork)"). Names only, never a token. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { MODE, render } from "../core.ts";
import { asker } from "../../../agents/model.ts";
import type { Engine } from "./types.ts";

/** who is signed in: login "" when nobody, cloud false when there is no cloud to sign in to; busy while a press is out */
export type Account = { login: string; cloud: boolean; busy?: "in" | "out"; failed?: boolean };

let now: Account | null = null;
let live: { ask: <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>; read: () => void } | null = null;
/** the fixture's: an invented person, signed in (the dev page's ?signedout=1: not yet, the start-up's sign-in line) */
const FIXTURE: Account = { login: typeof location !== "undefined" && new URLSearchParams(location.search).get("signedout") === "1" ? "" : "sam-rivera", cloud: true };
/** the account as the engine said it (the fixture's with no engine); null before it answered */
export const accountNow = (): Account | null => now ?? (MODE === "fixture" ? FIXTURE : null);
const set = (a: Account | null) => { now = a; render(); };

/** sign in (Google in the system browser, up to ten minutes) or out; the row says it while the press is out */
export async function accountPress(how: "in" | "out"): Promise<void> {
  if (MODE === "fixture") { set({ ...FIXTURE, login: how === "in" ? "sam-rivera" : "" }); return; }   // the fixture's press only flips it
  const l = live, a0 = now; if (!l || !a0) return;
  set({ ...a0, busy: how, failed: false });
  const r = await l.ask<{ ok?: boolean }>({ type: how === "in" ? "team.cloud.signin" : "team.cloud.signout" }, how === "in" ? 600_000 : 15_000);
  if (!r?.ok) set({ ...a0, busy: undefined, failed: true });
  l.read();
}

export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-account" });
  const read = () => { void a.ask<{ login?: string; cloud?: boolean }>({ type: "team.cloud.me" }, 8000).then((r) => { if (r) set({ login: typeof r.login === "string" ? r.login : "", cloud: r.cloud !== false }); }); };
  live = { ask: a.ask, read };
  read();
  const off = e.subscribe((m: { type?: string; cloud?: { login?: string } }) => {
    if (m?.type === "team.state" && m.cloud && now && !now.busy && (m.cloud.login ?? "") !== now.login) read();
  });
  return () => { off(); a.close(); live = null; now = null; };
}
