// A folder's parts on the dev page and in tests (model.ts): the looks the engine would send for the fixture's morning
// folders (cv/fixture.ts devData). Invented: no name, path or habit of a real person. api has five facts and shows four;
// infra has none and is plain; web had "Coming up" hidden by the person; home, money and health share dates, so a hide
// there asks of the other two. No word for a kind of folder anywhere. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import type { Look } from "./model.ts";

export const LOOKS: Record<string, Look> = {
  api: {
    order: ["working", "changed", "coming", "with", "files"],
    seen: [
      { part: "working", k: "seen:api:open", fact: "Two sessions are open in api right now.", words: "2 AI chats open now", items: [{ what: "Fix login · checking the token once", at: "now" }, { what: "Migrate db · asks you", at: "02:16" }] },
      { part: "changed", k: "seen:api:history", fact: "api keeps a history of its changes: 14 this week.", words: "Saved 14 changes this week", items: [{ what: "login: check the token once", at: "2 h" }, { what: "db: add the orders index", at: "Thu" }] },
      { part: "coming", k: "seen:api:dates", fact: "Sol saw a date in release-notes.md: the next release is on Friday.", words: "Next date: Fri", items: [{ what: "Release", at: "Fri" }] },
      { part: "with", k: "seen:api:names", fact: "Two names come back in api's notes and reviews.", words: "People named in 6 reviews", items: [{ what: "Ines" }, { what: "Tomas" }] },
    ],
    files: [{ what: "src/", at: "today" }, { what: "release-notes.md", at: "Mon" }],
  },
  web: {
    order: ["changed", "coming", "files"],
    seen: [
      { part: "changed", k: "seen:web:history", fact: "web keeps a history of its changes: 6 this week.", words: "Saved 6 changes this week", items: [{ what: "nav: one row on phones", at: "Tue" }] },
      { part: "coming", k: "seen:web:dates", fact: "Sol saw a launch date in plan.md.", words: "Next date: Dec 2", items: [{ what: "Launch", at: "Dec 2" }] },
    ],
    files: [{ what: "pages/", at: "Tue" }, { what: "plan.md", at: "Oct" }],
    hid: [{ part: "coming", reach: "here" }],
  },
  infra: { order: [], seen: [], files: [{ what: "notes.txt", at: "Oct" }, { what: "IMG_2231.jpg", at: "Sep" }, { what: "untitled.pages", at: "Aug" }] },
  cli: {
    order: ["read", "files"],
    seen: [{ part: "read", k: "seen:cli:once", fact: "Three PDFs here were opened once and not again.", words: "3 PDFs you opened once", items: [{ what: "Flags, a guide", at: "12 p" }, { what: "Exit codes", at: "3 p" }] }],
    files: [{ what: "main.go", at: "Wed" }],
  },
  home: {
    order: ["coming", "with", "files"],
    seen: [
      { part: "coming", k: "seen:home:dates", fact: "Sol saw dates in lease.pdf and plumber.txt.", words: "Next date: Mon", items: [{ what: "Rent", at: "Mon" }, { what: "Plumber", at: "Thu" }] },
      { part: "with", k: "seen:home:names", fact: "Two names come back in the mail kept here.", words: "People named in 9 emails", items: [{ what: "Ines" }, { what: "Rui" }] },
    ],
    files: [{ what: "lease.pdf", at: "Nov 1" }],
  },
  money: {
    order: ["coming", "read", "files"],
    seen: [
      { part: "coming", k: "seen:money:dates", fact: "Sol saw a due date in card-statement.pdf.", words: "Next date: Dec 1", items: [{ what: "Card bill", at: "Dec 1" }] },
      { part: "read", k: "seen:money:once", fact: "Two PDFs here were opened once and not again.", words: "2 PDFs you opened once", items: [{ what: "Tax guide 2026", at: "40 p" }, { what: "Bank terms", at: "6 p" }] },
    ],
    files: [{ what: "budget.numbers", at: "today" }],
  },
  health: {
    order: ["photos", "coming", "files"],
    seen: [
      { part: "photos", k: "seen:health:pictures", fact: "Most new files here are pictures: 11 of the last 14.", words: "Most new files are pictures", items: [{ what: "scan-1.jpg" }, { what: "scan-2.jpg" }, { what: "rash.heic" }, { what: "receipt.png" }] },
      { part: "coming", k: "seen:health:dates", fact: "Sol saw a date in dentist.txt.", words: "Next date: Tue", items: [{ what: "Dentist", at: "Tue" }] },
    ],
    files: [{ what: "dentist.txt", at: "Nov 12" }],
  },
};
