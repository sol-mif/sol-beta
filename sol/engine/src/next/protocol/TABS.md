### tabs

From BR1 (#1615; `engine/src/next/tabs.ts`, answered by `parts/next-tabs.ts`). Behind `ui.next`: off, nothing is
answered and nothing is read or written. Only Sol's own windows are answered; any other connection hears
`{ type, ok: false, why: "only Sol's own windows" }` and nothing is read. The asker hears its answer with its `rid`;
after a change every window hears `next.tabs` with the row. A tab is another view of a piece that keeps its place on
the canvas: closing one moves nothing. The Canvas tab is always first and is never kept or closed (`front: null`).
- `next.tabs` → `{ ok: true, tabs, front, taken, quiet }`. A tab: `{ id, by: "person" | "ai", kind?, fresh?, at }`;
  `id` is the piece's id as the window knows it, `fresh` marks an AI's tab not yet in front (the window shows ✦).
  `taken: { <kind>: { day, n } }` counts the tabs the person took out today per kind; `quiet: { <kind>: day }` is the
  day they answered "Keep in place".
- `next.tab.open { id, front?, by, kind? }` → the row. One tab per piece; opening one already there only fronts it.
  `front` is kept only for `by: "person"`: an AI's tab arrives behind, fresh. Each new tab the person opens counts once
  toward `taken[kind]`. At most 40 tabs; past that the oldest not in front goes. `swapped: <id>` says the piece stood
  under that id until now (a new session's starter, once started): its tab gives up its place in the row, the front
  and its count to the new one, so a ⌘N counts once, as a session; the window's close of the old id after it finds
  nothing.
- `next.tab.close { id }` → the row and `closed`, the tab as it was (so an Undo opens it again). The tab in front
  closing brings the Canvas forward. `{ id: "canvas" }` is refused.
- `next.tab.front { id }` → the row; `{ id: "canvas" }` (or null) is the Canvas. A fresh tab is fresh no longer.
- `next.tab.quiet { kind }` → the row: Sol does not offer "open these as tabs" for that kind again today.
A folder can be kept as a tab: `next.tab.open { id: "folder:<folder id>", by: "person", front: true }` keeps `{ id, by,
kind: "folder", at }`. A folder's id always carries `kind: "folder"` (sent without, or with another kind, it is set), and
`kind: "folder"` on any other id is dropped. It is kept, fronted and closed like any tab (the window opens the folder's
page form for it) and is not counted toward `taken`: the offer below is for sessions and pages.
The window offers once, after four of one kind taken out in a day: "You've taken 4 sessions out to tabs today. Open
sessions as tabs from now on?" Yes keeps the knob `open-session` (or `open-page`) at `tab` through `next.fit.set
{ knob, scope: "~", take: "tab", source: "Sol offered" }` (S15); "Keep in place" sends `next.tab.quiet`.

Kept in `SOL_HOME/next/tabs.json` `{ v: 1, tabs, front, taken, quiet }`, written whole, a broken file set aside as
`tabs.broken-<time>.json` (file.ts). An AI has the hand's three verbs as sol tools, offered only while `ui.next` is on
(`next/tabs-tool.ts`, listed through `next/workspace-tool.ts`): `open_piece { piece }`, `take_to_tab { piece, front? }`,
`put_back { piece }`, `piece` a piece's id, a session's id or its name. Each is handed to every window as
`next.tab.ai { verb: "open" | "tab" | "back", piece, front? }`; the window finds the piece and does what the hand would.
A tab an AI takes out arrives behind with ✦ and comes forward only when asked and only while the person is not typing
in the talk bar; putting back a tab the person opened leaves them a line with Undo.
