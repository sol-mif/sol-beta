### workspace changes

From the BR1 carry (#1615; `engine/src/next/workspace.ts`, answered by `parts/next-workspace.ts`). Behind `ui.next`: off,
nothing is answered and nothing is read or written. Only Sol's own windows are answered; any other connection hears
`{ type, ok: false, why: "only Sol's own windows" }` and nothing is read. Answers go to the asker alone, with its `rid`.
A plan is a setup Sol suggests: a `title`, one `reason`, its `evidence` and its `operations`. Nothing changes until the
person keeps it; they may skip any operation, or correct its `name`, `text`, `items` or `region`, first.
- `next.workspace` → `{ ok: true, plans, waiting }`: every plan, newest first; `waiting` counts those still `proposed`.
  A plan: `{ id, title, reason, source?, created, revision, status: "proposed" | "kept" | "discarded" | "undone",
  evidence: [{ ref, claim, type: "stated-intent" | "inference", label }], operations, guards, decisions?, applied?,
  keptAt?, discardedAt?, undoneAt? }`. `source` is where it came from, absent when unknown (never guessed).
- `next.workspace.propose { spec, source? }` → `{ ok: true, plan }` or `{ ok: false, why }`. `spec` is `{ title, reason,
  evidence?: [{ ref, claim, type }], operations: [1..40] }`; every operation has a unique `key` and a `reason`:
  - `{ op: "create_folder", name, type: "home" | "build" | "mixed" }`: home, a folder under `SOL_HOME` (a place for
    stickies); build, a Build group (`work.group` add); mixed is kept but refused at keep;
  - `{ op: "create_piece", kind, name, region, text?, items? }`: `region` is `"$<key>"` of a Home folder in the plan, or a
    Home folder's path under `SOL_HOME`. `note`: one sticky (title `name`, what it asks `text`, one line of 300 at most);
    `checklist`: one sticky per item. `session`, `quick-tools`, `automations-index`, `custom-tool` are kept but refused
    at keep (`cant: "Sol can't make this kind yet"`);
  - `{ op: "move_piece", ref, region }` and `{ op: "update_piece", ref, name?, text? }`: `ref` is a sticky,
    `{ kind: "sticky", folder, key }` (`key` its title).
  A `ref` in evidence may also be `{ kind: "folder", folder }` or `{ kind: "group", id }`. Every piece named must be
  there now, and the plan's dependencies are checked on a dry run (the refused kinds aside); nothing is applied.
- `next.workspace.preview { id, decisions? }` → `{ ok: true, preview: { id, title, reason, revision, evidence, rows:
  [{ key, op, kept, says, reason, cant? }], ready, why?, says: "Nothing changes until you keep it." } }`. Nothing is
  written. `decisions` is `[{ key, keep?: false, patch? }]`.
- `next.workspace.keep { id, decisions?, revision }` → `{ ok: true, plan }` (its `applied: { made, changed }`) or
  `{ ok: false, why }`, nothing written. Refused when the revision is not the plan's, when any piece the evidence names
  or any sticky it changes reads otherwise than when proposed, when an accepted operation is a kind Sol can't make yet,
  when a new folder's name or a sticky's title is taken (made beside, never over), or when a skipped folder is needed.
  Everything is checked before anything is written; a write failing midway is rolled back.
- `next.workspace.discard { id }` → `{ ok: true, plan }`: closed; nothing but the plan is touched.
- `next.workspace.undo { id }` → `{ ok: true, plan }` or `{ ok: false, why }`, nothing written: a kept plan's stickies
  removed, its edits and moves put back, its folders and groups taken away. Refused when anything it made or changed
  was edited, moved or added to since (a folder holding other work, a group with a session in it).
After a keep or an undo, every window hears `agent.changed { folder }` for each Home folder touched, and
`work.sessions` when a Build group was made or taken back.

Kept in `SOL_HOME/next/workspace.json` `{ v: 1, events }`, one event per act (`ws.propose`, `ws.keep`, `ws.discard`,
`ws.undo`), never edited; the plans are a fold of the events. Sol's own suggestions enter through `workspace.ts`
`propose(home, spec, source)`. A conversation reaches it through the sol tool `suggest_setup { title, reason,
operations }` (`next/workspace-tool.ts`), offered only while `ui.next` is on: the suggestion is stored with source "a
conversation", nothing changes, and every window hears `next.workspace.changed { id }` and asks `next.workspace` again.
