// Settings' own world for the dev page and the tests (#1604, slice 6): the mockup's Sam (redesign/ui.html, "Sam's
// world"), carried over as the merged mockup carried it, whatever scenario is loaded. Used only when the store holds a
// fixture (cv/moves/settings.ts seeds it on load); a real Sol builds its world from the engine (cv/wire/settings.ts)
// and never shows a line of this. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { C, defaults, type AiW, type HistRow, type Kind, type Serv, type Tool, type Way, type World } from "./model.ts";
import type { Known } from "../known.ts";

export const SAM_AIS: AiW[] = [
  { id: "inbox", n: "Inbox keeper", hue: 1, spent: 0.8, m: ["Archive one newsletter you never open", "Sort 200 old emails into folders", "Delete mail older than a year", "Send the reply to Ms. Lee"] },
  { id: "shift", n: "Shift planner", hue: 2, spent: 1.4, m: ["Add this week’s shifts to your calendar", "Rearrange next month around a new rota", "Remove a shift that was cancelled", "Message Priya about swapping Saturday"] },
  { id: "bill", n: "Bill watcher", hue: 3, spent: 0.35, m: ["Note a new bill in your list", "Plan this month’s payments by due date", "Delete an old bill record", "Pay the phone bill, $42"] },
  { id: "course", n: "Course catch-up", hue: 4, spent: 6.2, m: ["Summarise today’s Biology lecture", "Rebuild your notes for a whole chapter", "Clear last term’s notes", "Email the group about the slides"] },
  { id: "weekly", n: "Weekly review", hue: 5, spent: 0.9, m: ["Write Sunday’s recap", "Reshuffle next week’s plan", "Archive finished tasks", "Send the recap to your tutor"] }];

const LEARNED: Known[] = [
  { k: "learned:1", fact: "You call the history essay “the beast”.", source: "a name you used on 12 Nov", by: "sol", place: null },
  { k: "learned:2", fact: "You like to read a note to a teacher before it is sent.", source: "you pressed “Read it first” 3 times", by: "sol", place: null },
  { k: "learned:3", fact: "You want bills paid two days early, never on the day.", source: "your pick on 10 Nov", by: "person", place: null },
  { k: "learned:4", fact: "Sunday evenings are for the weekly review, so I stay quiet then.", source: "a habit I saw over 3 Sundays", by: "sol", place: null },
  { k: "learned:5", fact: "Home life stays quiet unless something is wrong.", source: "your pick on 13 Nov", by: "person", place: null }];

export const SERV: Serv[] = [
  { id: "gmail", n: "Gmail", may: ["read mail", "write drafts"], not: "send or delete anything", by: "Inbox keeper, Course catch-up", off: "Inbox keeper can’t see your mail now." },
  { id: "cal", n: "Google Calendar", may: ["read events", "add events"], not: "delete your events", by: "Shift planner, Weekly review", off: "Shift planner can’t put shifts on your calendar now." },
  { id: "portal", n: "School portal", may: ["read assignments", "read lecture slides"], not: "hand anything in", by: "Course catch-up", off: "Course catch-up can’t read new lectures now." },
  { id: "bank", n: "Northline bank", may: ["read bills due"], not: "pay anything. You press Pay.", by: "Bill watcher", off: "Bill watcher can’t find bills in your bank now." }];
export const KINDS: Kind[] = [
  { id: "writing", n: "Your writing and notes", by: "Course catch-up, Weekly review", here: "Course catch-up can’t read your notes, so it can only summarise the slides.", model: "Course catch-up reads your notes to build your summaries." },
  { id: "mail", n: "Your mail", by: "Inbox keeper", here: "Inbox keeper can sort by sender, but not read what is inside.", model: "Inbox keeper reads mail to sort it and draft replies." },
  { id: "cal", n: "Your calendar and shifts", by: "Shift planner, Weekly review", here: "Shift planner can’t check for clashes with your own plans.", model: "Shift planner checks your calendar for clashes." },
  { id: "bills", n: "Your bills and payments", by: "Bill watcher", here: "Bill watcher finds bills, but not the amounts. You type those.", model: "Bill watcher reads amounts to draft the payment." },
  { id: "voice", n: "What you say to me", by: "The talk bar", here: "Your voice is turned into words on this machine and then thrown away.", model: "Your voice goes to the model for better listening, then is thrown away." }];
export const TOOLS: Record<string, Tool> = {
  wispr: { n: "Wispr Flow", kind: "dictation", what: "Dictation", say: "Hold fn to talk as you do now. What you say lands in the talk bar, in a sticky, anywhere I listen. My own speech rests until you turn it back on." },
  granola: { n: "Granola", kind: "notes", what: "Meeting notes", say: "Meeting notes land in School and Work as stickies, with their actions as small stickies of their own. My own notes rest until you turn them back on." } };
export const EXTRA: Record<string, Serv> = { reminders: { id: "reminders", n: "Apple Reminders", may: ["read reminders", "add reminders"], not: "delete any" } };
const WAYS: Way[] = [
  { id: "studying", n: "Studying", sum: "Course catch-up goes ahead, Inbox keeper waits, steps out of sight, no fuss when things finish.", takes: { "autonomy:course": "ahead", "autonomy:inbox": "only", working: "result", attention: "money", marking: "quiet" } },
  { id: "shift", n: "Shift week", sum: "Shift planner goes ahead, taps you for questions and breaks, text a step larger.", takes: { "autonomy:shift": "ahead", "autonomy:inbox": "small", attention: "asksbreaks", size: "l", marking: "lift" } },
  { id: "deep", n: "Deep work", sum: "Nothing taps you, the window steps back, every AI goes ahead on small things only.", takes: { attention: "quiet", look: "back", working: "result", marking: "quiet", "autonomy:inbox": "small", "autonomy:course": "small", "autonomy:weekly": "small", "autonomy:shift": "small", "autonomy:bill": "asks" } }];

/** Sam's Settings, with the nine changes of the mockup's history (ui.html seed) */
export function samWorld(): World {
  const S = defaults(SAM_AIS, C(LEARNED)), H: HistRow[] = [];
  H.push({ when: "Mon 9 Nov, 08:30", label: "The default, from your first day", how: "set up for you", snap: C(S) });
  const step = (when: string, label: string, how: string, f: () => void, why?: string) => { f(); H.push({ when, label, how, snap: C(S), ...(why ? { why } : {}) }); };
  step("Tue 10 Nov, 18:20", "Course catch-up: Goes ahead, tells me after", "you picked it", () => { S.kept["autonomy:course"] = "ahead"; });
  step("Thu 12 Nov, 21:05", "A little humour: A dry line now and then", "you picked it", () => { S.kept["v-humour"] = "dry"; });
  step("Fri 13 Nov, 09:12", "Shift planner: Goes ahead on small things", "you picked it", () => { S.kept["autonomy:shift"] = "small"; });
  step("Sat 14 Nov, 11:30", "Weekly review: Goes ahead, tells me after", "you asked in words", () => { S.kept["autonomy:weekly"] = "ahead"; });
  step("Sun 15 Nov, 19:40", "Your writing: Suggest beside it", "you picked it", () => { S.kept.writing = "suggest"; });
  step("Mon 16 Nov, 22:10", "How much I say: A little more", "your AI tuned it", () => { S.kept["v-length"] = "mid"; }, "You asked “what does that mean for me?” after 5 of my last 8 one-line answers.");
  step("Tue 17 Nov, 07:40", "Show the AI’s steps: Just the result", "your AI tuned it", () => { S.kept.working = "result"; }, "You haven’t opened the hidden steps once in two weeks.");
  step("Tue 17 Nov, 20:46", "Size of everything you read: Larger", "you picked it", () => { S.kept.size = "l"; });
  step("Wed 18 Nov, 08:05", "Size of everything you read: As it is", "you turned it back", () => { S.kept.size = "m"; });
  return { ais: C(SAM_AIS), prefs: S, hist: H, undo: [], own: {}, ways: C(WAYS), eveOk: false, serv: SERV, kinds: KINDS, tools: TOOLS, extra: EXTRA, live: false };
}
