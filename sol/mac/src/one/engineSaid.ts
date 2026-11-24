// The engine's own words in an orchestration session's talk, as one line each (WorkTalk.tsx). Pure, so node --test reads it.
/** the engine's own words to an orchestration session (one.ts HANDOVER, the reports, PROMOTED, DEMOTED, joined, the
 *  tickets switch, ORCH_RENEWED), as one line of the talk;
 *  null for anything the person said */
export function engineSaid(t: string): string | null {
  const s = t.trimStart();
  // the anchor (one.ts FIRST_PLAIN, ANCHOR_RENEWED): back beside the orchestration sessions (2026-11-19)
  if (s.startsWith("You are the anchor session:")) return /\nYou are renewal \d+ of the same anchor session/.test(s) ? "renewed: a fresh copy carries on from its own handover, with this stage" : "the anchor: this session is kept from now on";
  if (s.startsWith("<renewal>")) return "the talk is nearly full: it writes its handover, then carries on fresh";
  if (s.startsWith("<ticket reports>")) return "reports came in from its tickets";
  if (s.startsWith("<tickets on>")) return "tickets on: it hands each piece of work to its own session";
  if (s.startsWith("<tickets off>")) return "tickets off: it does the work itself again";
  // two kinds of session (2026-11-14): any session may run others (one.ts PROMOTED, DEMOTED, joined, its renewal)
  if (s.startsWith("<promoted>")) return "promoted: this session runs other sessions now and hears their reports";
  if (s.startsWith("<demoted>")) return "demoted: a normal session again; the sessions under it are loose";
  if (s.startsWith("<session joined>")) { const t = /^<session joined>\n"([^"\n]{1,80})"/.exec(s)?.[1]; return t ? `a session joined: ${t}` : "a session joined: its summary came in"; }
  if (s.startsWith("<reports from sessions under you>")) return "reports came in from the sessions under it";
  // a session moved into a folder (engine next/folders.ts move; its folder context is split off first, work/folderContext.ts)
  { const m = /^The person moved this session into the folder (.{1,80}?)\. From now on, work with what that folder knows/.exec(s); if (m) return `moved into ${m[1]}: it works with what that folder knows`; }
  if (s.startsWith("You are an orchestration session in Build (Sol)") && /\nYou are renewal \d+ of this session/.test(s)) return "renewed: a fresh copy carries on from its own handover, with the sessions under it";
  return null;
}
