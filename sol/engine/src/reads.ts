// What Sol reads, by the person's word (#1656, after #1459): "stop reading my Gmail", "read my calendar again". One tool on
// the "sol" server, both seats, behind the switch reads.voice (settings.ts readsVoice, off until set):
//   set_reading { name, read, yes }   writes the person's "not here" (read: false) or "read it again" (read: true) for one
//                                     source into their record (~/.sol/record/me.json, consent.sources), the same entry
//                                     Settings › home's row writes, only on their own words this turn (`yes`, heard as
//                                     set_setting hears it, openfor.ts saidThisTurn)
// A source is one of the record's named ones (github, notes …) or a service of the Claude account (`account:<name>`,
// named as the account lists it). The refusal is not this file's: consent.ts reads the record and connectors.ts refuses
// by it on every read turn, whether this switch is on or off. Nothing leaves the Mac.
import { z } from "zod";
import type { ToolResult, TurnCtx } from "./browser.js";
import { readRecord, setSource } from "./consent.js";
import { connectedServices } from "./connectors.js";
import { saidThisTurn, wordsThisTurn } from "./openfor.js";
import { readsVoice } from "./settings.js";

/** the sources the record names by id (the face's onboard/consent.ts SOURCES), each with the words a person uses for it */
export const NAMED: Record<string, string[]> = {
  "claude-sessions": ["claude sessions", "claude code", "claude code sessions"],
  "codex-sessions": ["codex sessions", "codex"],
  "ai-setup": ["ai setup", "ai tools setup"],
  notes: ["notes", "apple notes", "mac notes"],
  gdrive: ["google drive", "drive", "gdrive"],
  github: ["github", "gh"],
  "calendar-store": ["mac calendar", "apple calendar", "calendar app"],
};

export const READS_TOOLS = [
  {
    name: "set_reading",
    description: "Stop or resume reading one of the person's sources, only when they asked for it in this very turn " +
      "(\"stop reading my Gmail\", \"you can read my calendar again\"). `name` is the source as they or the account name " +
      "it (Gmail, Google Calendar, GitHub, notes, Claude Code sessions …); `read` false stops it, true resumes it. `yes` is " +
      "the person's own words from this turn that ask for it, two words at least (in Chinese or Japanese, four characters), " +
      "copied exactly; to read one again, those words name it and nothing they said this turn asks to stop. It is the same as Settings › home's \"not here\" and its undo; " +
      "a stopped one is refused from the next read. A name that fits two sources stops both.",
    shape: { name: z.string().min(1).max(80), read: z.boolean(), yes: z.string().min(2).max(400) },
  },
] as const;
export const READS_NAMES = new Set<string>(READS_TOOLS.map((t) => t.name));
/** the tool while the switch is on, none while it is off (read at each turn's start) */
export const readsToolsNow = () => (readsVoice() ? [...READS_TOOLS] : []);

const plain = (s: string) => s.toLowerCase().replace(/^(my|the)\s+/, "").replace(/[\s_-]+/g, " ").trim();
/** the record's ids for what the person named (pure): the named sources its words fit, and the services the account lists
 *  (or the record already names) by that name, matched without case. More than one when a name fits two (GitHub the
 *  sign-in and a GitHub service); none: nothing by that name */
export function sourceIds(name: string, services: string[], said: string[] = []): string[] {
  const n = plain(name);
  if (!n) return [];
  const out = Object.entries(NAMED).filter(([id, words]) => plain(id) === n || words.includes(n)).map(([id]) => id);
  // the record's own spelling first, so a service the account now spells otherwise keeps one entry, never two that disagree
  const known: string[] = [];
  for (const k of [...said.filter((x) => x.startsWith("account:")).map((x) => x.slice(8)), ...services])
    if (!known.some((x) => x.toLowerCase() === k.toLowerCase())) known.push(k);
  const exact = known.filter((s) => plain(s) === n);
  const hits = exact.length ? exact : known.filter((s) => plain(s).replace(/^google /, "") === n.replace(/^google /, ""));
  return [...out, ...hits.map((s) => `account:${s}`)];
}
/** whether the person's words ask to stop (pure): reading again is never taken from a turn whose words say stop, read in
 *  whole, so a quote cut short of its "don't" is no yes */
const STOP = /\b(stop|don'?t|do not|doesn'?t|can'?t|cannot|won'?t|no|not|no longer|never|quit|pause|block|disable|off|unless)\b|不要|別|别|停|不准|不用|勿|やめ|止め|読まない|しないで/i;
export const saysStop = (words: string) => STOP.test(words.replace(/[\u2018\u2019\u02bc\uff07]/g, "'"));
/** whether the person's own words name this source (pure): its id, a word for it, or its service's name, as whole words */
export function names(yes: string, id: string): boolean {
  const y = ` ${plain(yes.replace(/[\p{P}]+/gu, " "))} `;
  const svc = id.startsWith("account:") ? id.slice(8) : null;
  const forms = svc ? [svc, svc.replace(/^google /i, "")] : [id, ...(NAMED[id] ?? [])];
  return forms.map(plain).filter(Boolean).some((f) => y.includes(` ${f} `) || (/[^\x00-\x7f]/.test(f) && y.includes(f)));
}

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
// Sol's home folder, where the account is asked from (index.ts sets it, as it does the desk's)
let solHome = process.cwd();
export const setReadsHome = (h: string) => { solHome = h; };
/** the account's services by name (connectors.ts, kept a minute); none when it cannot answer */
const listed = async (): Promise<string[]> => { try { return ((await connectedServices(solHome)) as { name: string }[]).map((s) => s.name); } catch { return []; } };

export async function runReadsTool(name: string, args: unknown, turn: TurnCtx = {}, d: { home?: string; services?: () => Promise<string[]> } = {}): Promise<ToolResult> {
  if (!readsVoice()) return text(`${name} is not on in this Sol`, true);   // the switch read again at each call
  if (name !== "set_reading") return text(`unknown tool ${name}`, true);
  const a = (args ?? {}) as Record<string, unknown>;
  if (typeof a.read !== "boolean") return text("not changed: read is true (read it again) or false (stop reading it)", true);
  if (!saidThisTurn(turn, String(a.yes ?? ""))) return text("not changed: those words are not in what the person said this turn. Ask them, and change it when they say so.", true);
  const rec = readRecord(d.home);
  const said = rec !== "missing" && rec !== "broken" ? Object.keys(rec.consent?.sources ?? {}) : [];
  const services = await (d.services ?? listed)();
  const ids = sourceIds(String(a.name ?? ""), services, said);
  if (!ids.length) return text(`nothing Sol reads is called ${String(a.name ?? "") || "(none named)"}. Sources: ${[...Object.keys(NAMED), ...services].join(", ")}`, true);
  // reading again widens what Sol reads: only one source, and only when the person named it themselves this turn.
  // Stopping only narrows it: every source the name fits is stopped
  if (a.read) {
    if (ids.length > 1) return text(`not changed: ${ids.map((i) => i.replace(/^account:/, "")).join(" and ")} both fit that name. Ask which one, and name it.`, true);
    if (saysStop(`${wordsThisTurn(turn) ?? ""} ${String(a.yes)}`)) return text("not changed: those words ask to stop, not to read again. Ask them what they want.", true);
    if (!names(String(a.yes), ids[0])) return text(`not changed: to read ${ids[0].replace(/^account:/, "")} again, the person names it in their own words this turn. Ask them.`, true);
  }
  for (const id of ids) { const w = setSource(id, a.read ? "yes" : "no", d.home); if ("why" in w) return text(`not changed: ${w.why}`, true); }
  const what = ids.map((i) => i.replace(/^account:/, "")).join(" and ");
  const how = ids.some((i) => i.startsWith("account:")) ? "its tools are refused by name on every read" : "Home's reader skips it";
  return text(a.read ? `${what} is read again from the next read; Settings › home shows it on.` : `${what} is not read from the next read on: ${how}. Settings › home shows it "not here"; the person can say so, or press there, to turn it back on.`);
}
