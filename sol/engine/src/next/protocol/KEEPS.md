### keeps

From #1879 step 3 (`engine/src/next/keeps.ts`, answered by `parts/next-keeps.ts`). Behind `ui.next`: off, nothing is
answered and nothing is read or written. Only Sol's own windows are answered; any other connection hears
`{ type, ok: false, why: "only Sol's own windows" }` and nothing is read. The asker hears its answer with its `rid`;
after `next.seen`, `next.pin` or `next.use` changes something every window hears `next.keeps`. These four feed the
sidebar's Check in boxes (Done while away, Back to, Kept) and its Recent group.
- `next.keeps` → `{ ok: true, present, seen, pinned, uses }`. `present` is a time or `null` (never); `seen`, `pinned`
  and `uses` are `{ <id>: time }` (times in ms).
- `next.present` → `{ ok: true, at, was }`. The person was present in a Sol window (focus, a key or a press; the window
  debounces to once a minute and the engine keeps at most one a minute too). `was` is the time kept before this one,
  `null` on an empty account: the window counts "while you were away" (the Diary's and the plane's, and Done while
  away) from the `was` of its first ping, or from `present` of its first `next.keeps`, not from when it loaded.
- `next.seen { id }` → `{ ok: true, present, seen, pinned, uses }`: this session or page was seen through the new face
  (fronted as a tab, or opened on the canvas). It feeds Back to: what changed since it was last seen.
- `next.pin { id, pinned? }` → the same: pinned (`pinned: false` takes the pin off; pinning again keeps the first time).
  It feeds Kept. An AI's verb and a press are not here yet.
- `next.use { folder }` → the same: the folder was opened or a session of it came in front; at most once a minute per
  folder. It feeds Recent: the 4 folders used most recently, apart from the one in front.
At most 400 seen, 100 pinned and 200 folders are kept; past that the oldest time goes.

Kept in `SOL_HOME/next/present.json` `{ v: 1, at }`, `seen.json` `{ v: 1, seen }`, `pinned.json` `{ v: 1, pinned }` and
`uses.json` `{ v: 1, folders }`, each written whole and a broken one set aside as `<name>.broken-<time>.json`
(file.ts); the answer's `aside` names what a read set aside.
