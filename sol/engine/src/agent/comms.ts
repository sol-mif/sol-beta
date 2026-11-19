// Step 2's side of the folder's agent: signing in for real, the looks at mail, Teams and the group chat, the answers on
// their cards that need no Codex turn, and what a Blackboard walk leaves in the folder (blackboard.md, calendar.md).
// index.ts calls in here at a few places; the sources' readers are in sources/{mail,teams,gc}.ts.
//
//   a look       read the site in the folder's browser → signed out: a needs-sign-in card (sign in with one press)
//                → what is new since the last look → kept to the folder (its people, its course code; Jev for the
//                unclear) → logged (mail.md, teams.md, chat-log.md) → dated things to calendar.md → a ticket for each
//                message that needs his answer (the run writes the draft; the card is "Reply to …")
//   the drafts   mail and Teams: <folder>/drafts/<date>-<who>.md, a card "Reply to Prof. Lomax: …" with "open the
//                draft" and "not needed". The group chat: drafts.md, a card with the draft's text and "copied".
//                Nothing is ever sent: the guard (guard.ts) refuses any typing on these sites, and every click but
//                a chat in WhatsApp's list.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { profileFor } from "../browser.js";
import { connectionsChanged } from "../connections.js";
import type { Agents } from "./index.js";
import type { RunOut } from "./run.js";
import { sessionOf } from "./run.js";
import { aboutOf, classIn, type About } from "./about.js";
import { datesIn, keepCalendar, type Dated } from "./calendar.js";
import { appendLedger, readLast, readPolicy, saveLast, saveTicket } from "./store.js";
import type { LedgerLine, Rule, Ticket, Trigger } from "./harness.js";
import { hasScreen, noScreenLine, signIn, signingIn, type SignInOpts } from "./signin.js";
import { isSite, nameOf, sitesOf, type Site } from "./sites.js";
import { belongs, dayOf, draftPath, logLine, needsAnswer, newSince, whoOf, type Message } from "./sources/messages.js";
import { inboxOf, readMail } from "./sources/mail.js";
import { newTeams, readTeams, rowSig, type TeamsLast } from "./sources/teams.js";
import { chatLine, readGroup, sinceLast } from "./sources/gc.js";
import { blackboardMd, datesOfCourse, type Snapshot } from "./sources/blackboard.js";

export const COMMS = new Set(["mail", "teams", "gc"]);
type Look = Promise<{ ticket: Ticket | null; line: string }>;
const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const ledger = (a: Agents, folder: string, l: Omit<LedgerLine, "at">) => { appendLedger(folder, { at: (a.d.now ?? Date.now)(), ...l }); a.d.changed?.(basename(folder)); };
const turnOf = (folder: string) => ({ sessionId: sessionOf(folder), profile: profileFor(folder) });

// ---- signing in ----

/** the site a rule reads (pure) */
export function siteOfRule(r: Rule): Site | null {
  if (r.source === "mail") return inboxOf(r.sentence);
  return sitesOf(r.source)[0] ?? null;
}
/** the sign-in buttons a folder's page shows: one per site its rules read (pure) */
export function signinsOf(rules: Rule[]): { site: Site; label: string }[] {
  const out = new Set<Site>();
  for (const r of rules) { if (r.mode === "off") continue; const s = siteOfRule(r); if (s) out.add(s); }
  return [...out].map((site) => ({ site, label: `sign in to ${nameOf(site)}` }));
}

/** the card a needs-sign-in trigger shows: one press opens the window; no screen here, it says so */
export function signInCard(folder: string, trig: Trigger): RunOut {
  const site: Site = isSite(trig.data.site) ? trig.data.site : "blackboard";
  const n = basename(folder).toUpperCase(), name = nameOf(site);
  if (!hasScreen()) return { report: "blocked", card: { title: `Sign in to ${name}`, line: noScreenLine(site), choices: ["later"] }, said: `${name} asked for a sign-in; this machine has no screen`, thread: null, ms: 0 };
  return { report: "blocked", card: { title: `Sign in to ${name}`, line: `${name} needs you to sign in, in the ${n} browser: a window opens on your screen; close it when you are in.`, choices: [`sign in to ${name}`, "later"] }, said: `${name} showed a sign-in page`, thread: null, ms: 0 };
}

/** his answer on a sign-in card */
export async function signInAnswer(a: Agents, folder: string, first: Trigger, choice: string): Promise<RunOut> {
  const site: Site = isSite(first.data.site) ? first.data.site : "blackboard";
  if (!/sign in|open/i.test(choice)) return { report: "ready", said: "left for later", thread: null, ms: 0 };
  const r = await startSignIn(a, basename(folder), site, typeof first.data.rule === "string" ? first.data.rule : undefined, folder);
  if (r.ok) return { report: "ready", said: r.line ?? "the sign-in window is open", thread: null, ms: 0 };
  return { report: "blocked", card: { title: `Sign in to ${nameOf(site)}`, line: r.why ?? "the window would not open", choices: ["later"] }, said: r.why ?? "", thread: null, ms: 0 };
}

/** agent.signin {folder, site}: the window opens now; when it closes, the rule that asked runs */
export async function startSignIn(a: Agents, name: string, siteIn: string, ruleId?: string, path?: string): Promise<{ ok: boolean; why?: string; line?: string; noScreen?: boolean }> {
  const folder = path ?? a.folderOf(name);
  if (!folder) return { ok: false, why: `no folder agent "${name}"` };
  if (!isSite(siteIn)) return { ok: false, why: `which site? one of blackboard, outlook, gmail, whatsapp, teams` };
  const site = siteIn, opts: Partial<SignInOpts> = (a.d as { signin?: Partial<SignInOpts> }).signin ?? {};
  if (!(opts.screen ?? hasScreen())) return { ok: false, why: noScreenLine(site), noScreen: true };
  const profile = profileFor(folder);
  if (signingIn(profile)) return { ok: true, line: `the ${nameOf(site)} window is already open` };
  const { rules } = readPolicy(folder);
  const rule = (ruleId ? rules.find((r) => r.id === ruleId) : undefined) ?? rules.find((r) => r.mode !== "off" && siteOfRule(r) === site);
  ledger(a, folder, { rule: rule?.id, read: `${nameOf(site)}: the sign-in`, made: "the sign-in window opened", held: "nothing" });
  void signIn({ ...opts, profile, site }).then(async (end) => {
    ledger(a, folder, { rule: rule?.id, read: `${nameOf(site)}: the sign-in window`, made: end.ok ? `closed (${end.how})` : "nothing", held: end.ok ? (rule ? `runs ${rule.id} now` : "nothing") : end.why });
    if (end.ok && end.how !== "timed out") a.signedIn?.(folder, site);   // Agents (#1327): what was held for this site wakes
    connectionsChanged([`site:${relative(a.d.home, folder).split("\\").join("/")}:${site}`]);   // the Seats list reads it again (#1620)
    if (end.ok && rule && rule.mode !== "off") await a.runRule(basename(folder), rule.id, true).catch(() => {});
  });
  return { ok: true, line: `the ${nameOf(site)} window is open on the screen of the machine that runs the engine; close it when you are signed in` };
}

/** a look that met a sign-in page: one card for it (a second look lands on the same open ticket) */
async function needsSignIn(a: Agents, folder: string, rule: Rule, site: Site): Look {
  const at = (a.d.now ?? Date.now)();
  const r = await a.trigger(folder, { id: `s-${at}`, at, source: rule.source, kind: "needs-sign-in", thread: `${site}:sign-in`, data: { rule: rule.id, site } });
  return { ticket: r.ticket, line: "not signed in" };
}

// ---- his answers that need no Codex turn ----

/** "open the draft", "not needed", "copied" on a draft's card end its ticket; null: not one of those (pure) */
export function quickAnswer(t: Ticket, choice: string): RunOut | null {
  const first = t.triggers[0];
  if (!first || !COMMS.has(first.source) || first.kind === "needs-sign-in") return null;
  const c = choice.toLowerCase().trim();
  const said = c === "open the draft" ? `opened ${first.data.draft ?? "the draft"}` : c === "copied" ? "he copied the draft to send it himself" : c === "not needed" ? "no answer needed" : null;
  return said ? { report: "ready", said, thread: null, ms: 0 } : null;
}
/** where the page goes after "open the draft": the draft file itself (pure) */
export function draftLink(out: { ticket?: Ticket | null }): string | null {
  const t = out.ticket, first = t?.triggers[0], last = t?.triggers[t.triggers.length - 1];
  if (!t || !first || !last || last.kind !== "answer" || String(last.data.choice).toLowerCase() !== "open the draft") return null;
  return typeof first.data.draftAt === "string" ? `/file?path=${encodeURIComponent(first.data.draftAt)}` : null;
}

// ---- the looks ----

/** keep only what belongs to the folder: its people and course code; Jev answers the unclear ones (no Jev: left out) */
async function keepFor(a: Agents, rule: Rule, about: About, ms: Message[]): Promise<{ kept: Message[]; unclear: number }> {
  const kept: Message[] = [];
  let unclear = 0;
  for (const m of ms) {
    const b = belongs(m, about);
    if (b === "yes") { kept.push(m); continue; }
    if (b === "no") continue;
    const p = a.d.jev ? await a.d.jev({ rule: { ...rule, sentence: `${rule.sentence} (messages for ${about.name.toUpperCase()}: ${about.people.map((x) => x.name).join(", ")}; ${about.codes.join(", ")})` }, trigger: { id: m.id, at: 0, source: rule.source, kind: "message", thread: "", data: { from: m.from, address: m.address, subject: m.subject, text: m.text.slice(0, 600) } } }) : null;
    if (p !== null && p >= 0.5) kept.push(m); else unclear++;
  }
  return { kept, unclear };
}

/** the voice file for a draft: me.md in the folder or the nearest folder above it, inside the home (relative) */
function voiceOf(a: Agents, folder: string): string | null {
  for (let d = folder; d.startsWith(a.d.home) && d !== dirname(d); d = dirname(d)) if (existsSync(join(d, "me.md"))) return relative(folder, join(d, "me.md")) || "me.md";
  return null;
}

/** one ticket per message that needs his answer; the run writes the draft; the card is set to "Reply to …" */
async function replies(a: Agents, folder: string, rule: Rule, about: About, ms: Message[], asked: boolean, where: string): Promise<Ticket[]> {
  const out: Ticket[] = [];
  const voice = voiceOf(a, folder);
  for (const m of ms.filter(needsAnswer).slice(0, 5)) {
    const at = (a.d.now ?? Date.now)(), who = whoOf(m, about), draft = draftPath(dayOf(at), who);
    const r = await a.trigger(folder, {
      id: `m-${at}-${out.length}`, at, source: rule.source, kind: "message", thread: `${rule.source}:${m.id}`,
      data: {
        rule: rule.id, ...(asked ? { asked } : {}), site: m.site, who, draft, draftAt: join(folder, draft),
        message: { from: m.from, ...(m.address ? { address: m.address } : {}), ...(m.subject ? { subject: m.subject } : {}), at: m.at, text: m.text.slice(0, 2500) },
        do: `${who} wrote on ${where} and it needs Marco's answer. Write the reply he would send to ${draft} (create drafts/), in his voice${voice ? ` (read ${voice})` : ""}: short, first names, one ask per message, no sign-off. Never send it, never open ${where} to type. End with a card titled "Reply to ${who}: <what the reply says, in a few words>" and the choices "open the draft", "not needed".`,
      },
    });
    const t = r.ticket;
    if (t && t.state === "waiting" && t.needs && existsSync(join(folder, draft))) {
      const text = read(join(folder, draft)).replace(/^#.*\n+/, "").trim();
      const line = t.needs.title.replace(/^reply to [^:]+:\s*/i, "") || m.subject || text.split("\n")[0];
      t.needs = { ...t.needs, title: `Reply to ${who}: ${line}`.slice(0, 120), line: text.slice(0, 400), choices: ["open the draft", "not needed"] };
      saveTicket(folder, t);
    }
    if (t) out.push(t);
  }
  return out;
}

function logTo(folder: string, file: string, head: string, lines: string[]) {
  if (!lines.length) return;
  const f = join(folder, file);
  if (!existsSync(f)) writeFileSync(f, `${head}\n\n`);
  appendFileSync(f, lines.join("\n") + "\n");
}
/** what is still ahead (pure): a date before today is history, not a thing in the calendar */
const ahead = (ds: Dated[], ref: Date) => { const d = new Date(ref.getTime() - 86_400_000), y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; return ds.filter((x) => x.date > y); };
const datesOf = (ms: Message[], ref: Date, where: string): Dated[] => ahead(ms.flatMap((m) => datesIn([m.subject, m.text].filter(Boolean).join(". "), ref, `${where}, ${m.from}, ${m.at}`)), ref);
const clsOf = (folder: string) => ({ ...classIn(read(join(folder, "brain.md"))), from: "brain.md" });

/** mail: the inbox the rule names */
export async function lookMail(a: Agents, folder: string, rule: Rule, asked = false): Look {
  const site = inboxOf(rule.sentence), name = nameOf(site);
  if (signingIn(profileFor(folder))) { ledger(a, folder, { rule: rule.id, read: name, made: "nothing", held: "the sign-in window is open" }); return { ticket: null, line: "signing in" }; }
  const last = readLast<{ seen: Record<string, string[]> }>(folder, "mail") ?? { seen: {} };
  const known = last.seen[site] ? new Set(last.seen[site]) : null;
  let got;
  try { got = await readMail(turnOf(folder), site, known); }
  catch (e) { const why = String((e as Error)?.message ?? e).split("\n")[0]; ledger(a, folder, { rule: rule.id, read: name, made: "nothing", held: `the look failed: ${why}` }); return { ticket: null, line: why }; }
  if (got.signedOut) return needsSignIn(a, folder, rule, site);
  saveLast(folder, "mail", { ...last, seen: { ...last.seen, [site]: [...new Set([...(known ?? []), ...got.messages.map((m) => m.id)])].slice(-1000) }, at: (a.d.now ?? Date.now)() });
  if (!known) { ledger(a, folder, { rule: rule.id, read: `${name}, ${got.messages.length} messages in the inbox`, made: "the first look, kept as the baseline", held: "nothing" }); return { ticket: null, line: `baseline of ${got.messages.length} messages` }; }
  return messagesIn(a, folder, rule, name, "mail.md", "# Mail\n\nThe messages this folder's agent kept (time · who · subject · text), newest last.", newSince([...known], got.messages), asked);
}

/** Teams: chats and mentions */
export async function lookTeams(a: Agents, folder: string, rule: Rule, asked = false): Look {
  if (signingIn(profileFor(folder))) { ledger(a, folder, { rule: rule.id, read: "Teams", made: "nothing", held: "the sign-in window is open" }); return { ticket: null, line: "signing in" }; }
  const last = readLast<TeamsLast>(folder, "teams");
  let got;
  try { got = await readTeams(turnOf(folder), last); }
  catch (e) { const why = String((e as Error)?.message ?? e).split("\n")[0]; ledger(a, folder, { rule: rule.id, read: "Teams", made: "nothing", held: `the look failed: ${why}` }); return { ticket: null, line: why }; }
  if (got.signedOut) return needsSignIn(a, folder, rule, "teams");
  // a mention and the same message in its chat are one message (the mention kept)
  const byId = new Map<string, Message>();
  for (const m of got.messages) if (!byId.has(m.id) || m.kind === "mention") byId.set(m.id, m);
  const all = [...byId.values()];
  const fresh = newTeams(last, all);
  saveLast(folder, "teams", { rows: Object.fromEntries(got.rows.map((r) => [r.chat, rowSig(r)])), ids: [...new Set([...(last?.ids ?? []), ...all.map((m) => m.id)])].slice(-2000), opened: [...new Set([...(last?.opened ?? []), ...got.opened])] } satisfies TeamsLast);
  if (!last) { ledger(a, folder, { rule: rule.id, read: `Teams, ${got.rows.length} chats`, made: "the first look, kept as the baseline", held: "nothing" }); return { ticket: null, line: `baseline of ${got.rows.length} chats` }; }
  return messagesIn(a, folder, rule, "Teams", "teams.md", "# Teams\n\nThe chats and mentions this folder's agent kept (time · who · text), newest last.", fresh, asked);
}

async function messagesIn(a: Agents, folder: string, rule: Rule, where: string, file: string, head: string, fresh: Message[], asked: boolean): Look {
  const about = aboutOf(folder, rule.sentence);
  const { kept, unclear } = await keepFor(a, rule, about, fresh.filter((m) => !m.mine));
  logTo(folder, file, head, kept.map(logLine));
  const dated = keepCalendar(folder, datesOf(kept, new Date((a.d.now ?? Date.now)()), where), clsOf(folder));
  const left = fresh.length - kept.length;
  const seen = `${where}: ${fresh.length} new, ${kept.length} for ${about.name.toUpperCase()}${left ? ` (${left} not${unclear ? `, ${unclear} unclear` : ""})` : ""}`;
  const asks = kept.filter(needsAnswer);
  if (!asks.length) {
    ledger(a, folder, { rule: rule.id, read: seen, made: kept.length ? `${file}${dated ? `, calendar.md (${dated})` : ""}` : "nothing", held: "nothing needs an answer" });
    return { ticket: null, line: kept.length ? `${kept.length} kept, none needs an answer` : "nothing new for this folder" };
  }
  ledger(a, folder, { rule: rule.id, read: seen, made: `${file}${dated ? `, calendar.md (${dated})` : ""}`, held: `${asks.length} need an answer: a ticket each` });
  const ts = await replies(a, folder, rule, about, asks, asked, where);
  return { ticket: ts[0] ?? null, line: `${kept.length} kept, ${asks.length} need an answer: ${asks.map((m) => whoOf(m, about)).join(", ")}` };
}

/** the latest draft in drafts.md: the quoted lines of its first block (pure) */
export function latestDraft(md: string): string {
  const blocks = md.split(/\n(?=## )/).filter((b) => b.startsWith("## ") || /^>/m.test(b));
  const top = blocks.find((b) => /^>/m.test(b)) ?? "";
  return top.split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "")).join("\n").trim();
}

/** the group chat: what came since the last look, into chat-log.md; a run for owed.md, drafts.md and the card */
export async function lookGc(a: Agents, folder: string, rule: Rule, asked = false): Look {
  if (signingIn(profileFor(folder))) { ledger(a, folder, { rule: rule.id, read: "WhatsApp", made: "nothing", held: "the sign-in window is open" }); return { ticket: null, line: "signing in" }; }
  const about = aboutOf(folder, rule.sentence);
  if (!about.group) { ledger(a, folder, { rule: rule.id, read: "WhatsApp", made: "nothing", held: "no group named: add `group: <its name>` at the top of policy.md" }); return { ticket: null, line: "no group named" }; }
  const last = readLast<{ last: string | null; keys: string[] }>(folder, "gc");
  let got;
  try { got = await readGroup(turnOf(folder), about.group, last); }
  catch (e) { const why = String((e as Error)?.message ?? e).split("\n")[0]; ledger(a, folder, { rule: rule.id, read: "WhatsApp", made: "nothing", held: `the look failed: ${why}` }); return { ticket: null, line: why }; }
  if (got.signedOut) return needsSignIn(a, folder, rule, "whatsapp");
  if (!got.found) { ledger(a, folder, { rule: rule.id, read: "WhatsApp", made: "nothing", held: `no chat "${about.group}" in the list` }); return { ticket: null, line: `no chat "${about.group}"` }; }
  const fresh = sinceLast(got.messages, last);
  saveLast(folder, "gc", { last: got.messages.at(-1)?.id ?? last?.last ?? null, keys: [...new Set([...(last?.keys ?? []), ...got.messages.map((m) => m.id)])].slice(-2000) });
  if (!fresh.length) { if (asked) ledger(a, folder, { rule: rule.id, read: `WhatsApp "${about.group}"`, made: "nothing", held: "nothing new" }); return { ticket: null, line: "nothing new" }; }
  logTo(folder, "chat-log.md", `# ${about.group}\n\nThe group, as this folder's agent read it (time · who · text), newest last. Read only: nothing is ever sent from here.`, fresh.map(chatLine));
  keepCalendar(folder, datesOf(fresh.filter((m) => !m.mine), new Date((a.d.now ?? Date.now)()), `WhatsApp "${about.group}"`), clsOf(folder));
  const at = (a.d.now ?? Date.now)();
  const draftsAt = join(folder, "drafts.md"), before = existsSync(draftsAt) ? statSync(draftsAt).mtimeMs : 0;
  const voice = voiceOf(a, folder);
  const lines = fresh.map((m) => `${m.at} · ${m.from} · ${m.text.replace(/\s+/g, " ").slice(0, 160)}`);
  const r = await a.trigger(folder, {
    id: `w-${at}`, at, source: rule.source, kind: "messages", thread: `gc:${about.group}:${dayOf(at)}`,
    data: {
      rule: rule.id, ...(asked ? { asked } : {}), site: "whatsapp", group: about.group, count: fresh.length,
      do: `${fresh.length} new messages in "${about.group}" are the last ${fresh.length} lines of chat-log.md (also below). Update owed.md: one line per thing Marco was asked or promised, who waits, by when (a real date), and where it came from (who, time, a few words); tick [x] only when the chat shows it done. If an answer from him is due, add one draft at the top of drafts.md (## <date> — replying to <who>, then the reply as > lines) in his voice${voice ? ` (read ${voice})` : ""}, and end with a card titled "Reply in the group: <a few words>" whose line is the draft's text. He copies and sends it himself: never open WhatsApp to type.`,
      messages: lines.join("\n").slice(-3500),
    },
  });
  let t = r.ticket;
  if (t && t.state === "waiting" && t.needs && existsSync(draftsAt) && statSync(draftsAt).mtimeMs !== before) {
    const draft = latestDraft(read(draftsAt));
    if (draft) { t = { ...t, needs: { ...t.needs, line: draft.slice(0, 400), choices: ["copied", "not needed"] } }; saveTicket(folder, t); }
  }
  return { ticket: t, line: `${fresh.length} new in "${about.group}"` };
}

/** run a comms rule's look; null when the rule is not one of these */
export function lookComms(a: Agents, folder: string, rule: Rule, asked: boolean): Look | null {
  if (rule.source === "mail") return lookMail(a, folder, rule, asked);
  if (rule.source === "teams") return lookTeams(a, folder, rule, asked);
  if (rule.source === "gc") return lookGc(a, folder, rule, asked);
  return null;
}

/** after a Blackboard walk: the folder's blackboard.md (every page, its click path, its text) and calendar.md */
export function afterWalk(folder: string, s: Snapshot, now = Date.now()): number {
  try { writeFileSync(join(folder, "blackboard.md"), blackboardMd(s, basename(folder))); } catch { /* the walk's result stands without it */ }
  return keepCalendar(folder, ahead(datesOfCourse(s, new Date(now)), new Date(now)), clsOf(folder));
}

/** what a source asked of him, for the ledger's "read" (index.ts summary) */
export function summaryOf(t: Trigger): string | null {
  const d = t.data as Record<string, any>;
  if (t.kind === "needs-sign-in") return `${nameOf(isSite(d.site) ? d.site : "blackboard")} asked for a sign-in`;
  if (t.kind === "message") return `${d.who ?? "someone"} wrote on ${d.site === "teams" ? "Teams" : nameOf(isSite(d.site) ? d.site : "outlook")}: ${String(d.message?.subject ?? d.message?.text ?? "").slice(0, 80)}`;
  if (t.kind === "messages") return `WhatsApp "${d.group}": ${d.count} new`;
  return null;
}
