// A made-up person for the design page (#1088): Noa Patel, as the builder's seed (people/seed.mjs) makes her, in the
// explorer's own shape (sort.ts `Found`), stop by stop. Nobody here is real.
import type { Found } from "../sort";
import type { Scr } from "../Folder";
import type { StopId } from "../Lens";

export const SAID = "Second year at Westbrook, design major. I freelance for two clients. Training for a half marathon. Don't read my messages.";
export const NOW = new Date(2026, 10, 13);
export const SCREENS: Scr[] = [{ id: "built-in", w: 1512, h: 982, x: 0, y: 0, main: true }, { id: "studio", w: 2560, h: 1440, x: 1512, y: -300 }];
const f = (id: string, kind: Found["kind"], v: string, src: string, more: Partial<Found> = {}): Found => ({ id, k: more.k ?? kind, v, src, kind, sure: true, ...more });
export const FOUND: Record<StopId, Found[]> = {
  machine: [f("name", "machine", "Noa Patel", "this computer's account", { k: "name" }),
    ...["Figma", "Notion", "Slack", "Spotify", "Strava", "Google Chrome", "Claude", "Zoom"].map((a) => f(`app-${a}`, "machine", a, "Applications", { k: "app" }))],
  ai: [f("ai-claude", "ai", "Claude", "~/.claude", { signed: true }), f("ai-codex", "ai", "Codex", "~/.codex", { signed: false })],
  tools: [f("t-figma", "tool", "figma", "Claude's connections"), f("t-notion", "tool", "notion", "Claude's connections"), f("t-drive", "tool", "google-drive", "Claude's connections"),
    f("t-gh", "tool", "GitHub", "gh, signed in as noa-makes"), f("t-google", "tool", "Google", "Gmail, Drive, Calendar")],
  calendar: [
    f("e-art", "event", "ART 140 Drawing", "your calendar, Arts 3", { when: "Mon/Wed 10am", repeats: true }),
    f("e-psy", "event", "PSY 101", "your calendar, Lecture Hall 1", { when: "Mon/Wed 1pm", repeats: true }),
    f("e-des", "event", "DES 210 Studio", "your calendar, Hall B", { when: "Tue/Thu 2pm", repeats: true }),
    f("e-run", "event", "Long run", "your calendar", { when: "Sun 8am", repeats: true }),
    f("e-call", "event", "Lumen review call", "your calendar, Zoom", { when: "Wed, Nov 18 11am" }),
    f("e-crit", "event", "DES 210 crit", "your calendar, Hall B", { when: "Thu, Nov 19 3pm" }),
    f("e-race", "event", "Riverside Half Marathon", "your calendar, Riverside Park", { when: "Sun, Jan 17 7am" })],
  files: [
    f("f-des", "file", "DES 210 syllabus", "Documents/Westbrook/DES 210"), f("f-art", "file", "ART 140 syllabus", "Documents/Westbrook/ART 140"), f("f-psy", "file", "PSY 101 midterm guide", "Documents/Westbrook/PSY 101"),
    f("d-lumen", "file", "Lumen", "Documents/Clients", { k: "folder" }), f("f-contract", "file", "Lumen contract", "Documents/Clients/Lumen"), f("f-inv", "file", "Lumen invoice 014", "Documents/Clients/Lumen"),
    f("d-okra", "file", "Okra", "Documents/Clients", { k: "folder" }), f("f-okra", "file", "Okra brief v2", "Documents/Clients/Okra"),
    f("f-plan", "file", "half marathon plan", "Documents/Running"), f("f-resume", "file", "resume 2026", "Documents/Portfolio"), f("f-port", "file", "portfolio", "Documents/Portfolio")],
  projects: [f("p-lumen", "project", "lumen-site", "~/code/lumen-site", { owner: "lumen-studio" }), f("p-folio", "project", "noa-folio", "~/code/noa-folio", { owner: "noa-makes" })],
  browser: [f("s-canvas", "place", "canvas.westbrook.edu", "Chrome history, 55 visits in 30 days"), f("s-figma", "place", "figma.com", "Chrome history, 80 visits in 30 days"),
    f("s-gmail", "place", "mail.google.com", "Chrome history, 120 visits in 30 days"), f("s-strava", "place", "strava.com", "Chrome history, 21 visits in 30 days"),
    f("s-notion", "place", "notion.so", "Chrome history, 40 visits in 30 days"), f("s-behance", "place", "behance.net", "Chrome history, 12 visits in 30 days")],
};
