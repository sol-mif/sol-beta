// The folders the engine itself makes in Sol's home (<SOL_HOME>), each with the file that makes it: never a person's
// place. One list, read by the places (places.ts diskFolders) and by next/carry.ts (SKIP: the move-in read, the folder
// make, the setup and look reads), so a new store of the engine's is added here and nowhere else.
// Only names the engine's code makes. A folder the person made or Home made for them (school, jobs, life, work, shelf
// and what is in them) is not here, and stays a place.

export const OWN_FOLDERS: ReadonlySet<string> = new Set([
  // the home's own stores
  "next",          // next/file.ts: every file of the new face
  "items",         // home/items.ts: the Things
  "things",        // kernel.ts, things.ts: the blocks' records
  "data",          // kernel.ts: what a block reads and writes through the gate
  "data-undo",     // dataundo.ts: the undo of that data
  "log",           // log.ts: the home's log
  "sources",       // home/tool.ts, home/policy.ts: the files source's scope and the policy versions
  "skills",        // skill.ts: the skill linked for Claude chats
  // what Sol keeps for the person while it works
  "memory",        // anticipate.ts: the talks it remembers
  "attachments",   // files.ts: what was dropped into a chat
  "voice",         // voice.ts, talks.ts: the model, the talks, the recordings
  "track",         // track.ts: the day's use
  "desk",          // desk.ts: the pages it makes
  "loose",         // agent/stickies.ts LOOSE: the stickies of no place yet
  "buttons",       // arrange.ts: the person's buttons
  "browser-profile", // browser.ts: the browser Sol drives
  // inside a project's own folder here (work/blocks.ts), and a package's
  "blocks", "sessions", "node_modules",
]);

/** a folder named as Sol names a project's own folder here (work/blocks.ts projectName: the project's folder name, lower
 *  case, anything but a-z 0-9 . _ - made "-") for a folder Claude Code has sessions of (`slugs`, ~/.claude/projects: each
 *  session folder's path with anything but A-Z a-z 0-9 made "-"). Asked only of an empty folder: one Sol made for a
 *  project and left with nothing in it (pure) */
export function isProjectStore(name: string, slugs: readonly string[]): boolean {
  const s = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return !!s.replace(/-/g, "") && slugs.some((x) => x.toLowerCase().endsWith("-" + s));
}

/** what Sol keeps in a project's own folder here besides those two folders (work/pieces.ts): when to look again at a piece */
const PROJECT_FILES = new Set(["pieces-seen.json", "pieces-trust.json"]);
/** a folder Sol keeps for one project (work/blocks.ts: <home>/<project>/sessions, <home>/<project>/blocks): it holds only
 *  Sol's stores, so it is Sol's own though it bears the project's name; `names` are what is in it (pure) */
export function holdsOnlyStores(names: { name: string; dir: boolean }[]): boolean {
  const ns = names.filter((x) => x.name !== ".DS_Store");
  return ns.length > 0 && ns.every((x) => (x.dir && (x.name === "sessions" || x.name === "blocks")) || (!x.dir && PROJECT_FILES.has(x.name)));
}
