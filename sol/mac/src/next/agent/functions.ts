// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// The 31 functions an AI calls (mine/look/home/functions.json, "functions" and "person_only"), as data: each with its
// group and its gate in words; "pause / resume / stop" is one function with three names, so 31 functions are 33 names.
// The same list is the person's moves (count 13): agent/calls.ts maps one onto the other. Ported as names only; the
// spec's prose stays in the mockup. Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).

export type Fn = { group: string; name: string; gate: string; names: string[] };

const ROWS: [string, string, string][] = [
  ["Read", "look", "do"], ["Read", "read", "do"], ["Read", "needs", "do"], ["Read", "since", "do"], ["Read", "find", "do"],
  ["Make", "make", "do if asked for, else draft"], ["Make", "place", "do on its own untouched pieces, else draft"], ["Make", "group", "ask"],
  ["Make", "split", "do on its own, else draft"], ["Make", "attach", "draft"],
  ["Run", "start", "do or draft by the AI's setting; ask over the limit"], ["Run", "split_run", "as start, for each part"], ["Run", "pass", "do"],
  ["Run", "redirect", "do"], ["Run", "pause / resume / stop", "do (stop of a split job: ask)"], ["Run", "check", "do if the region says so, else draft"],
  ["Run", "take_back", "ask"],
  ["Talk", "ask", "do"], ["Talk", "withdraw", "do"], ["Talk", "tell", "do"], ["Talk", "headline", "do"], ["Talk", "offer", "draft"], ["Talk", "point", "do"],
  ["Talk", "beside", "draft"],
  ["Diary", "write", "do"], ["Diary", "remove_line", "do"],
  ["Life", "sticky", "do"], ["Life", "run_sticky", "do"], ["Life", "finish", "draft"], ["Life", "drop", "ask"], ["Life", "due", "do"],
];

/** the functions, in the spec's order (CV.FN) */
export const FN: Fn[] = ROWS.map(([group, name, gate]) => ({ group, name, gate, names: name.split("/").map((s) => s.trim()) }));
export const fnByName = (n: string): Fn | undefined => FN.find((f) => f.names.includes(n));
/** every name an AI may call */
export const FN_NAMES: string[] = FN.flatMap((f) => f.names);
/** the person's own acts, in the spec's words (FN.person_only) */
export const PERSON_ONLY_WORDS = [
  "move the camera (pan, zoom, enter, leave)", "move a piece they placed", "accept or refuse a change", "answer a serious ask",
  "change a setting, including how far an AI may go", "keep or remove a project",
  "in the diary: pause the writing, turn its pages, remove or turn into a sticky a line of their own",
];
/** the spec was read (the mockup's FN.spec: false when functions.json was missing) */
export const SPEC = true;
