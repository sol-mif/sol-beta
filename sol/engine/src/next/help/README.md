# Help: the wire (#1615 BR1). Types: src/next/help/wire.ts. Walk ids: around folders ai bar needs yours; steps from 0.
- face → `next.help.open { ask? }` → asker gets `next.help.opened { session|null, title:"Help", walks, faq, starters }`.
  Open the Help tab with it; `session` is null until Help's first answer (then every `next.help.said` carries it).
- face → `next.help.ask { text }` → every window: `next.help.said { working:true, session }`, then
  `next.help.said { working:false, session, text, show?: {walk,step}, replay?: walk }` (or `{ failed:true, text }`).
  `show` = the "Show me" button: play that walk's step (next/tips). `replay` = "Replay <walk title>".
- The canvas bar keeps sending `next.canvas.say`. A "how do I / how can I / where is / what is…" comes back as
  `next.canvas.said { help:true, working:false, text (one line), show?, openHelp:true, ask }`; "Open in Help" sends
  `next.help.open { ask }`. If Help must think first: `{ help:true, working:true, session }` then the line.
- Help is read-only: it has one tool (help_find) and nothing else; it never changes a file or a setting.


## Where things are
- `faq.md`: the shipped plain-words answers (`## question`, its answer, an optional `Show me: walk step` line). Add an
  entry there and Help, help_find and the bar all have it; keep it general for every Sol user.
- `help.ts`: the six walks (WALKS, the face's ids, steps from 0), the faq reader, the matcher (findHelp, isHowAsk), the
  standing session (helpSay, kept in SOL_HOME/next/help.json, marked `help` so no list draws it).
- `../../parts/next-help.ts`: the messages above; `helpFromBar` is what the canvas bar (parts/next-canvas.ts) calls first.
- Tests: `src/next/help.test.ts`.
