// A folder's setup on the dev page and in tests (setup.html; the engine's next/setup-read.ts says it live): the setups the
// engine would read of the fixture's morning folders (cv/fixture.ts devData, folder/parts/fixture.ts LOOKS), in the
// engine's own words. Invented: no name, path or habit of a real person. infra holds almost nothing, so it is too early;
// money's "Organized" was set by the person; health is mostly pictures. No word for a kind of folder anywhere.
// Signed: marcocyl04-ux's agent (builder F10), BR1 (#1615).
import type { FolderSetup, ReadLine, SetupField } from "../../cv/moves/setup.ts";

/** the engine's takes for the three fields a read line names (next/setup.ts TAKES), a few each */
const TAKES: Record<string, { id: string; n: string }[]> = {
  job: [{ id: "build", n: "Making something" }, { id: "learn", n: "Learning: readings and deadlines, week by week" }, { id: "deliver", n: "Delivering: what's due, what waits on others" }, { id: "keep", n: "Things to keep and find again" }, { id: "plain", n: "Whatever you put here" }],
  order: [{ id: "thread", n: "By what each session works on, newest first" }, { id: "week", n: "By week, a folder for each" }, { id: "recent", n: "Newest first" }, { id: "kind", n: "By kind of file" }, { id: "date", n: "By date taken" }],
  look: [{ id: "workbench", n: "Workbench: tight, made for working" }, { id: "notebook", n: "Notebook: ruled and warm" }, { id: "desk", n: "Desk: each thing a card with its date" }, { id: "paper", n: "Paper: calm, for reading" }, { id: "gallery", n: "Gallery: pictures first" }, { id: "plain", n: "Plain" }],
};
const N: Record<string, string> = { job: "What it's for", order: "How its things are organized", look: "How it looks" };
const KEY = { for: "job", organized: "order", looks: "look" } as const;
const LN = { for: "For", organized: "Organized", looks: "Looks" } as const;

type L = [line: string, short: string, because: string, by?: "person"];
function setup(folder: string, at: { for?: L; organized?: L; looks?: L }, takes: Record<string, string>, o: { kept?: boolean; empty?: string } = {}): FolderSetup {
  const lines: ReadLine[] = (["for", "organized", "looks"] as const).filter((k) => at[k]).map((k) => {
    const [line, short, because, by] = at[k]!;
    return { key: k, field: KEY[k], n: LN[k], line, short, because, k: `setup:${folder}:${k}`, by: by ?? "sol" };
  });
  const fields: SetupField[] = (["job", "order", "look"] as const).map((f) => {
    const t = TAKES[f].find((x) => x.id === takes[f]) ?? TAKES[f][TAKES[f].length - 1];
    return { field: f, n: N[f], take: t.id, name: t.n, by: lines.some((l) => l.field === f && l.by === "person") ? "person" : "default", takes: TAKES[f] };
  });
  const read = o.empty
    ? { empty: true, line: "Too early to say what this folder is for", sol: false, lines: [], why: o.empty }
    : { empty: false, line: lines.map((l) => l.short).join(" · "), sol: !o.kept && lines.some((l) => l.by === "sol"), lines };
  return { folder, scope: folder, because: [], history: false, set: o.kept ? { at: 0, by: "person" } : null, fields, look: takes.look ?? "plain", sorts: false, read };
}

export const SETUPS: Record<string, FolderSetup> = {
  api: setup("api", {
    for: ["Work on login and the db", "login and the db", "its 2 chats are mostly about login and the db"],
    organized: ["As its code is: each subfolder a part of it", "as its code is", "it keeps a history of its changes, so its subfolders are its code"],
    looks: ["What is next on the front, the rest by date", "what's next first", "it has dates ahead, the next Fri"],
  }, { job: "build", order: "thread", look: "workbench" }),
  web: setup("web", {
    for: ["Making something, every change kept", "making something", "web keeps a history of its changes (a .git folder)"],
    organized: ["As its code is: each subfolder a part of it; one row on phones before anything ships", "as its code is", "it keeps a history of its changes, so its subfolders are its code, and line 3 of its CLAUDE.md"],
    looks: ["Its latest changes on the front", "latest changes first", "it keeps a history of its changes"],
  }, { job: "build", order: "thread", look: "workbench" }),
  infra: setup("infra", {}, {}, { empty: "it holds 2 things so far" }),
  cli: setup("cli", {
    for: ["Documents to read and keep", "documents to read and keep", "3 of its 5 files are documents"],
    organized: ["Newest first", "newest first", "nothing in its names or subfolders sets an order"],
    looks: ["A list to read, newest on top", "a list to read", "3 of its 5 files are documents"],
  }, { job: "keep", order: "recent", look: "paper" }),
  home: setup("home", {
    for: ["What is coming up, next Rent", "what's coming up", "Sol saw dates in lease.pdf and plumber.txt, the next one Mon"],
    organized: ["Newest first", "newest first", "nothing in its names or subfolders sets an order"],
    looks: ["What is next on the front, the rest by date", "what's next first", "it has dates ahead, the next Mon"],
  }, { job: "deliver", order: "recent", look: "desk" }),
  money: setup("money", {
    for: ["What is coming up, next Card bill", "what's coming up", "Sol saw a due date in card-statement.pdf, the next one Dec 1"],
    organized: ["By kind of file", "by kind of file", "you set it", "person"],
    looks: ["What is next on the front, the rest by date", "what's next first", "it has dates ahead, the next Dec 1"],
  }, { job: "deliver", order: "kind", look: "desk" }, { kept: true }),
  health: setup("health", {
    for: ["Pictures to keep and look through", "pictures to keep and look through", "11 of its 14 files are pictures"],
    organized: ["By date taken", "by date taken", "most of its 14 files are named by month"],
    looks: ["Pictures first, as a grid", "pictures first", "11 of its 14 files are pictures"],
  }, { job: "keep", order: "date", look: "gallery" }),
};
