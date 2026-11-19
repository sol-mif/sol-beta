// Fixtures for Agents (#1327, pass 2): invented people of varied shapes, none of it anyone's data. A nurse on shifts
// (her wards are the items of a rota source, one level down), a parent of two (the children are the items of a school
// source; the clubs are folders), a freelancer with client folders, a baker with a shop and a family, and an empty home.
// Each home is a temp folder: `make(spec)` writes every path in it.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Spec = Record<string, string>;
/** a fresh home with every file of the spec (a path ending in / is a folder) */
export function make(spec: Spec, name = "sol-agents-"): string {
  const home = mkdtempSync(join(tmpdir(), name));
  for (const [p, text] of Object.entries(spec)) {
    if (p.endsWith("/")) { mkdirSync(join(home, p), { recursive: true }); continue; }
    mkdirSync(dirname(join(home, p)), { recursive: true });
    writeFileSync(join(home, p), text);
  }
  return home;
}
const sticky = (title: string, ...notes: string[]) => [`- [${notes.some((n) => n.startsWith("did")) ? "x" : " "}] ${title}`, ...notes.map((n) => `  - ${n}`)].join("\n");
export const stickies = (...items: string[]) => `# your stickies\n\n${items.join("\n")}\n`;
export { sticky };

/** Noon, Mon 16 Nov 2026, local: "now" in every test */
export const NOW = new Date(2026, 10, 16, 12, 0).getTime();

/** a nurse on rotating shifts: each ward's rota into her calendar, three times in two wards */
export const NURSE: Spec = {
  "work/policy.md": "# Work's policy\n\n- [watch] stickies: when I press a sticky in Home, do what the sticky marked \"← now\" asks\n",
  "work/.agent/items.json": JSON.stringify({ rota: [{ id: "ward-a", name: "Ward A" }, { id: "ward-c", name: "Ward C" }, { id: "day-unit", name: "Day Unit" }] }),
  "work/stickies.md": stickies(
    sticky("Ward A rota from Oct 1 → my calendar", "asked Sep 18 20:10", "did: 13 shifts into my calendar · 2 swap asks set aside · read: rota · 20 min"),
    sticky("Ward A rota from Nov 1 → my calendar", "asked Oct 16 21:05", "did: 15 shifts into my calendar · read: rota · 20 min"),
    sticky("Ward C rota from Dec 1 → my calendar", "asked Nov 13 21:40", "did: 14 shifts into my calendar · 1 clash · read: rota · 25 min"),
    sticky("Bring the new badge"),
  ),
  "life/pay/payslip-oct.pdf": "%PDF",
  "life/pay/stickies.md": stickies(sticky("Check the October payslip", "asked Nov 2 09:00", "did: matched against my shifts · read: payslip-oct.pdf · 10 min")),
  "life/learning/cert.png": "png",
  "life/learning/stickies.md": stickies(sticky("Log the life support certificate", "asked Oct 3 10:00", "did: saved to credits.md")),
  "life/house/lease.txt": "lease",
  "life/house/stickies.md": stickies(sticky("Car insurance renews Dec 3")),
};

/** a parent of two: each child's Friday letter into the family's week; two clubs as folders */
export const PARENT: Spec = {
  "kids/policy.md": "# Kids' policy\n",
  "kids/.agent/items.json": JSON.stringify({ school: [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben" }] }),
  "kids/stickies.md": stickies(
    sticky("Ana's Friday letter → our week", "asked Oct 30 18:00", "did: 4 dates into our calendar · 2 forms set aside · read: school · 15 min"),
    sticky("Ben's Friday letter → our week", "asked Nov 6 18:30", "did: 5 dates into our calendar · trip money noted · read: school · 15 min"),
    sticky("Ana's Friday letter → our week", "asked Nov 13 18:10", "did: 3 dates into our calendar · bag list · read: school · 15 min"),
    sticky("Book the dentist"),
  ),
  "clubs/swim/times.csv": "race,time",
  "clubs/swim/stickies.md": stickies(sticky("Gala times → our week", "asked Nov 1 19:00", "did: 3 races into our calendar · read: times.csv · 5 min")),
  "clubs/football/fixtures.csv": "match,date",
  "clubs/football/stickies.md": stickies(sticky("Wash the kit")),
  "house/stickies.md": stickies(sticky("Groceries for Sunday")),
};

/** a freelancer with client folders: a Friday update to each client from the week's hours */
export const FREELANCER: Spec = {
  "clients/acme/hours.md": "| day | h |",
  "clients/acme/design.fig": "fig",
  "clients/acme/stickies.md": stickies(
    sticky("Friday update → Acme", "asked Oct 30 16:00", "did: update drafted to the client from hours.md · read: hours · 25 min"),
    sticky("Friday update → Acme", "asked Nov 6 16:10", "did: update drafted to the client from hours.md · read: hours · 20 min"),
    sticky("Update the checkout screens by Dec 1"),
  ),
  "clients/northwind/hours.md": "| day | h |",
  "clients/northwind/onboarding.fig": "fig",
  "clients/northwind/stickies.md": stickies(sticky("Friday update → Northwind", "asked Nov 13 16:05", "did: update drafted to the client from hours.md · read: hours · 30 min")),
  "clients/bloom/logo.fig": "fig",
  "clients/bloom/stickies.md": stickies(sticky("Update the logo when they're back")),
  "business/invoices/oct.pdf": "%PDF",
};

/** the same freelancer's existing rules, before the meta (no stickies): two jobs in two clients, one in a third */
export const FREELANCER_RULES: Spec = {
  "clients/acme/policy.md": "# Acme's policy\n\n- [watch, draft] clock: Fri 16:00 the week's hours from hours.md into a short update in drafts/update.md for Acme\n- [watch, draft] clock: 09:00 on the last day the month's hours from hours.md into invoices/month.md\n- [watch] stickies: when I press a sticky in Home, do what it asks\n",
  "clients/northwind/policy.md": "# Northwind's policy\n\n- [watch, draft] clock: Fri 17:30 the week's hours from hours.md into a short update in drafts/update.md for Northwind\n- [do, draft] clock: 08:00 on the last day the month's hours from hours.md into invoices/month.md\n",
  "clients/bloom/policy.md": "# Bloom's policy\n\n- [watch] folder: a new file in brief/ → read it into notes.md\n",
};

/** a home neither of pass 1's two held-out changes has seen (orchestrator, 2026-11-17): a bike-repair shop, a youth
 *  football team, a family. People are answered on mail and a group chat, said "write back", "respond" and "answer";
 *  its chains run through folders (a photo → a ticket → the parts) or only by purpose (a plan → the drills, no file
 *  shared). Written blind, before any run; UNSEEN_TRUTH is what a person would call its agents */
export const UNSEEN: Spec = {
  "shop/policy.md": "# policy\n\n- [watch, draft] mail: when a customer writes to the shop inbox about a repair, write back with the price and the earliest free slot\n- [watch] folder: a new photo of a bike in intake/ → a repair ticket in tickets/\n- [watch] folder: a new ticket in tickets/ → the parts it needs onto parts-order.md\n- [watch, draft] clock: Friday 16:00 everything on parts-order.md into an order for the supplier\n",
  "shop/intake/.keep": "",
  "shop/tickets/.keep": "",
  "team/policy.md": "# policy\n\n- [watch, draft] gc: when a parent asks in the team chat about a match, respond with the kick-off time and the pitch\n- [watch] clock: Sunday 18:00 plan the week's two training sessions\n- [watch, draft] clock: Monday 07:00 the drills for this week's sessions for the other coaches\n- [watch] clock: Saturday 08:00 the forecast for the pitch into weather.md\n",
  "family/policy.md": "# policy\n\n- [watch, draft] mail: when the school emails about the kids, answer it with a draft for me\n- [watch] clock: every day 20:00 the family calendar into week.md\n",
};
/** UNSEEN's agents as a person would name them: answering people in three places is one; the repair chain is one; the
 *  training plan and its drills are one; the forecast and the calendar stay routines */
export const UNSEEN_TRUTH = {
  agents: [["family#mail-1", "shop#mail-1", "team#gc-1"], ["shop#clock-1", "shop#folder-1", "shop#folder-2"], ["team#clock-1", "team#clock-2"]],
  routines: ["family#clock-1", "team#clock-3"],
};

const rules = (...rs: string[]) => `# policy\n\n${rs.map((r) => `- ${r}\n`).join("")}`;
/** Sam (the calm brief's tests c and d): a student with a job. Two course folders read the course site at night
 *  (worded apart, so code cannot say), a work rota, the bills, and answering people in two places; two one-step rules.
 *  14 rules, 4 parts */
export const SAM: Spec = {
  "school/biology/syllabus.md": "# syllabus", "school/biology/notes.md": "", "school/biology/prep.md": "",
  "school/biology/policy.md": rules(
    "[watch] clock: 03:00 the new pages of the course site on Blackboard into notes.md",
    "[watch] clock: 07:30 today's study plan from notes.md into plan.md",
    "[watch] clock: 20:00 the class prep from plan.md into prep.md"),
  "school/history/syllabus.md": "# syllabus", "school/history/notes.md": "", "school/history/prep.md": "",
  "school/history/policy.md": rules(
    "[watch] clock: 02:30 read the course site's new readings on Blackboard and put them into notes.md",
    "[watch] clock: 21:00 the class prep from notes.md into prep.md"),
  "work/policy.md": rules(
    "[watch] mail: the rota from the shift mail into rota.md",
    "[watch] clock: 08:05 the shifts from rota.md into calendar.md",
    "[watch, draft] mail: each message a coworker sends me → a reply in drafts/"),
  "money/policy.md": rules(
    "[watch] clock: Monday 09:00 the bills due from bills.md into due.md",
    "[watch, draft] clock: Monday 09:30 a payment for each line of due.md into payments.md",
    "[watch] clock: Friday 17:00 what was paid from payments.md into paid.md"),
  "home/policy.md": rules(
    "[watch, draft] mail: each message a friend sends me → a reply in drafts/",
    "[watch] clock: Sunday 19:00 a review of the week into review.md",
    "[watch] clock: Saturday 10:00 a reminder to water the plants into today.md"),
};
/** Sam's agents at the first open as the brief says them (the two courses are one only after "together") */
export const SAM_TRUTH = {
  agents: [["school/biology#clock-1", "school/biology#clock-2", "school/biology#clock-3"], ["school/history#clock-1", "school/history#clock-2"],
    ["work#clock-1", "work#mail-1"], ["money#clock-1", "money#clock-2", "money#clock-3"], ["home#mail-1", "work#mail-2"]],
  routines: ["home#clock-1", "home#clock-2"],
};

/** a third home, written blind (2026-11-17) before any wording was scored on it: a small landlord, a student society,
 *  a freelance illustrator. Chains pass work through folders (one rule puts files into a folder, the next reads them
 *  there), and two have no file between their steps at all (a statement, then chasing who has not paid; a quote,
 *  then following it up). THIRD_TRUTH is what a person would call its agents */
export const THIRD: Spec = {
  "flats/rents.csv": "tenant,due,paid", "flats/orders/.keep": "",
  "flats/policy.md": rules(
    "[watch, draft] mail: when a tenant reports something broken, a work order for it saved in orders/",
    "[watch] folder: each new work order in orders/ → booked with the handyman, the slot written onto the order",
    "[watch, draft] clock: the 1st of each month 09:00 a rent statement for each tenant from rents.csv",
    "[watch, draft] clock: the 5th of each month 09:00 a polite nudge to each tenant whose rent has not arrived",
    "[watch] clock: Sunday 20:00 which bins go out this week, posted to the building's noticeboard"),
  "society/members.csv": "name,email,joined", "society/signups/.keep": "", "society/minutes/.keep": "", "society/events.md": "# events",
  "society/policy.md": rules(
    "[watch] folder: a new sign-up form in signups/ → the person added to members.csv",
    "[watch, draft] clock: Monday 10:00 a welcome email to everyone who joined members.csv last week",
    "[watch] clock: Wednesday 21:00 the minutes of tonight's committee meeting from its recording, filed in minutes/",
    "[watch, draft] clock: Thursday 09:00 the action points from the newest minutes, each sent to whoever owns it",
    "[watch, draft] gc: a question in the society chat about an event → an answer from events.md"),
  "studio/rates.md": "# rates", "studio/exports/.keep": "", "studio/invoices/.keep": "",
  "studio/policy.md": rules(
    "[watch, draft] mail: when a client sends a brief, a quote from rates.md",
    "[watch, draft] clock: two days after a quote is sent with no reply, a friendly follow-up",
    "[watch] folder: a finished piece exported to exports/ → an invoice for its client, kept in invoices/",
    "[watch, draft] clock: Friday 15:00 a reminder for each invoice that has gone 30 days unpaid",
    "[watch] clock: every morning 08:00 three drawing prompts into sketchbook.md"),
};
export const THIRD_TRUTH = {
  agents: [["flats#folder-1", "flats#mail-1"], ["flats#clock-1", "flats#clock-2"], ["society#clock-1", "society#folder-1"],
    ["society#clock-2", "society#clock-3"], ["studio#clock-1", "studio#mail-1"], ["studio#clock-2", "studio#folder-1"]],
  routines: ["flats#clock-3", "society#gc-1", "studio#clock-3"],
};

/** a baker with a shop and a family: orders, a supplier by mail, the family's week */
export const BAKER: Spec = {
  "shop/policy.md": "# Shop's policy\n\n- [watch, draft] mail: every 60 min 06:00–20:00 the supplier's mail into supplier.md; one that needs my answer → a draft\n- [watch] clock: 05:30 the day's orders from orders.md into bake-list.md\n- [watch] clock: 21:00 the takings from till.csv into week.md\n- [watch] folder: a new file in invoices/ → into costs.md\n",
  "shop/orders.md": "| order |",
  "family/policy.md": "# Family's policy\n\n- [watch] clock: Sunday 18:00 the week's meals into meals.md\n",
};

/** nobody's anything yet */
export const EMPTY: Spec = {};

/** a nurse whose wards are folders: four wards hold the same sort of thing (a handover folder, the open tasks), one of
 *  them does more (two more sources, more files); a shared group project sits under the same parent */
export const WARDS: Spec = {
  ...Object.fromEntries(["north", "east", "south"].flatMap((w) => [
    [`wards/${w}/handover/mon.md`, "- bed 3"],
    [`wards/${w}/notes.md`, "notes"],
    [`wards/${w}/policy.md`, "# policy\n\n- [watch] folder: a new file in handover/ → the open tasks into tasks.md\n"],
    [`wards/${w}/stickies.md`, stickies(sticky("Handover → the open tasks"), sticky("Check the obs chart"))],
  ])),
  "wards/west/handover/mon.md": "- bed 3",
  "wards/west/notes.md": "notes",
  "wards/west/tasks.xlsx": "xlsx",
  "wards/west/stock.csv": "item,count",
  "wards/west/audits/q3.pdf": "%PDF",
  "wards/west/policy.md": "# policy\n\n- [watch] folder: a new file in handover/ → the open tasks into tasks.md\n- [watch] mail: the pharmacy's mail into stock.csv\n- [watch, draft] teams: the bed manager's messages → a draft reply\n",
  "wards/west/stickies.md": stickies(sticky("Handover → the open tasks"), sticky("Check the obs chart"), sticky("Order the dressings"), sticky("Audit the drug cupboard")),
  "wards/union-project/slides.pptx": "pptx",
  "wards/union-project/minutes/one.docx": "docx",
  "wards/union-project/notes.md": "notes",
  "wards/union-project/policy.md": "# policy\n\n- [watch] gc: the group chat's new messages into minutes/\n",
  "wards/union-project/stickies.md": stickies(sticky("Meet the group on Thursday"), sticky("Draft the poster")),
};

/** a parent with two clubs: one nightly job, written tersely in one club and with extra outputs in the other */
export const CLUB_NEWS: Spec = {
  "clubs/chess/policy.md": "# policy\n\n- [watch] clock: every night 21:00 read the club's page and put what changed into news.md\n",
  "clubs/swim/policy.md": "# policy\n\n- [watch] clock: every night 21:30 read the club's page and put what changed into news.md; list the new gala dates in dates.md, and draft a note to the coach\n",
};

/** a baker's two morning clock rules in two places: one drafts reminders to customers, one makes a stall sheet */
export const TWO_CLOCKS: Spec = {
  "shop/policy.md": "# policy\n\n- [watch, draft] clock: 08:00 draft a reminder to each customer whose order is unpaid\n",
  "market/policy.md": "# policy\n\n- [watch] clock: 08:30 on a market day, make the stall sheet\n",
};

/** a parent of two whose children are folders: each child's school letter into the family calendar, the same job
 *  written two ways (one terse, one longer); a club beside them under another parent */
export const LETTERS: Spec = {
  "kids/ana/letters/oct.md": "letter",
  "kids/ana/calendar.md": "# calendar",
  "kids/ana/policy.md": "# policy\n\n- [watch] mail: the school's Friday letter → its dates into calendar.md\n",
  "kids/ben/letters/oct.md": "letter",
  "kids/ben/calendar.md": "# calendar",
  "kids/ben/policy.md": "# policy\n\n- [watch, draft] mail: each Friday read the letter from school and add the trips and dates to calendar.md; the forms into forms.md\n",
};
/** the baker's home with two chains in the shop (the calm pass: an agent is rules where one makes what the next reads):
 *  the supplier's mail into supplier.md, then its questions from supplier.md into a reply list; the takings into
 *  week.md, then the week's takings into a Sunday summary. The orders, the invoices and the family's meals stay one rule
 *  each (routines). The ids of BAKER's rules are kept: the new ones come after them */
export const BAKER_CHAINS: Spec = {
  ...BAKER,
  "shop/policy.md": `${BAKER["shop/policy.md"]}- [watch] clock: 07:00 the questions from supplier.md into a list in replies.md\n- [watch] clock: Sunday 20:00 the takings from week.md into a note in summary.md\n`,
};
/** the parent of two again, each child's folder a chain: the school's letter into the child's calendar.md, then each
 *  morning the day's dates from that calendar.md into a note. The two children's chains are worded apart (one reads
 *  more, makes forms too), so code alone keeps them two agents */
export const LETTERS_CHAINED: Spec = {
  "kids/ana/letters/oct.md": "letter",
  "kids/ana/calendar.md": "# calendar",
  "kids/ana/policy.md": "# policy\n\n- [watch] mail: the school's Friday letter → its dates into calendar.md\n- [watch] clock: 07:00 the day's dates from calendar.md into a note in today.md\n",
  "kids/ben/letters/oct.md": "letter",
  "kids/ben/calendar.md": "# calendar",
  "kids/ben/policy.md": "# policy\n\n- [watch, draft] mail: each Friday read the letter from school; its trips and dates into calendar.md, the forms into forms.md\n- [watch] clock: 07:30 the day's trips and dates from calendar.md into a note in today.md\n",
};
/** the same two rules, one in a child's folder and one in a club's: places of two kinds */
export const LETTERS_TWO_KINDS: Spec = {
  "kids/ana/letters/oct.md": "letter",
  "kids/ana/policy.md": LETTERS["kids/ana/policy.md"],
  "kids/ana/calendar.md": "# calendar",
  "clubs/swim/letters/oct.md": "letter",
  "clubs/swim/calendar.md": "# calendar",
  "clubs/swim/policy.md": "# policy\n\n- [watch] mail: each Friday read the letter from the club and add the galas and dates to calendar.md\n",
};
