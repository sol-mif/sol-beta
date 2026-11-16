# Sol's own blocks (Stable)

Each folder here is one of Sol's own features written as a block, the same kind a person's AI writes into
`home/things/<id>/`: a `record.json` and an engine half. The kernel loads them beside the home's (the design's step 7):
the home's block of the same id is found first, unless it is taken out. Sol's code here is never written by the engine.
Taking one of these out is kept in Sol's folder (`stable/<home>.json`). Its versions come with Sol. Its card and its
press work as for any block (`GET /things` `stable`, `POST /things/<id>/approve`). The wire is in the protocol, beside the seat seam.

| block | room | what it shows |
|---|---|---|
| `file-it` | big | The big room's first tenant: `gh` with the key `github`, `screencapture` and `sips`, Sol's helper `sol-windows` (`../helpers/`), the screen, `~/Library/Caches/Sol/file-it`, Sol's tool `tracker`. `team.file` goes through it once it is pressed and the key pasted. |
| `sticky` | small | The small room's example: the note is its own data (`stores: ["note"]`), nothing beyond its wall, no card, one tool `note`. It shows the mechanism only: the engine's own sticky note (`sticky.ts`, the face's corner, the seat's `sticky` tool) went from `main` on 2026-11-08 (#729, #718), so no face shows this note and `engine/sticky.json` is not read. Whether a note comes back in Home (#692) is the face's call. |

## The rest, not moved yet (step 8's list)

Each row is one feature from the design's table "Sol 自己的插件". Columns: the room it would run in, which of the
five actions it uses, and what stops it moving today. The actions: put a piece on screen, give the AI a tool, hear
and keep, a time or a wake-up, provide an ability. A gap that comes back in many rows is named once, below the table.

| feature | today | room | actions | where it is stuck |
|---|---|---|---|---|
| Desk | `desk.ts` | small | screen, tool | State is per conversation, and a block's tool is called without the turn behind it (no session id): **G1**. The face draws it from `desk` messages: **G2**. |
| Grab, shelf | `grab.ts`, `shelf.ts` | big (the design says small) | screen (notch card), hear and keep | Grab runs `screencapture -i` and lists Sol's windows: the screen and a program, so a big room (sol-windows is there now). The shelf keeps files in `home/shelf/`, which a block can never declare (the home is guarded); its own folder outside the home would do. Every face is told the list: **G2**. |
| Layout, presets | `arrange.ts` | small | tool, hear and keep | Closest to moving: one person's file, a merge and a check. Its file is `home/arrangement.json`, read by the face too: the face would read the block's data instead (**G2**). The "ask once after 100 presses" needs the face's presses on the log: **G3**. |
| Run | `run.ts` | big | screen, tool | It runs any command a message holds, in the conversation's folder: a program and a folder that are not known ahead, so no record can name them. It stays the shell's (a person's press runs it, never a block). |
| Suggest a group | `suggest.ts` | small | hear and keep | Small and nearly ready. It draws a card under the answer: **G2**. Which conversation the call came from: **G1**. |
| Anticipate, eye, names, private, notch skill, talks | `anticipate.ts`, `eye.ts`, `names.ts`, `private.ts`, `skill.ts`, `talks.ts` | big for listen and the Gemini review (the design says small); small for names, private, skill | hear and keep, a time | The helper `sol/mac/listen` (Swift, the microphone) is a native program: the second door, the way `sol-windows` came in (**G4**). A talk's review goes to Gemini: `sol.fetch` with a key `gemini` (decided 2026-11-07: the Gemini path stays as it is for now). The eye is the app's own state, told by the notch: it stays the shell's, and blocks ask it through `tracker`. |
| The creature's state | `creature.ts` | small | hear and keep, screen | It hears nearly everything (turns, receipts, errors), and much of that is not on the log: **G3**. The face's plan calls it "the body and voice as blocks": the face's lead leads it. |
| Work's tools (plan, wrap-up, other sessions, hand-off) | `work/tools.ts` | small | tool | Each tool acts on the session that calls it: **G1**. |
| Aside, change seat | `work/aside.ts`, `work/gist.ts` | small | tool | **G1**, and they start a seat's turn: a block cannot start one (open question 33). |
| Work's panes, copies, who has it open | `work/panes.ts`, `copies.ts`, `holders.ts`, `reconcile.ts`, `mine.ts`, `machine.ts`, `rename.ts` | big | screen, tool | git and any folder a session is in: no record names them ahead. Like Run, these stay the shell's until a folder can be granted for one press. |
| Attachments | `files.ts` | small (the design's), the shell's here | tool | It writes files into `home/attachments/` and hands them to the seat: a block never writes the home outside its data, so as a block it would keep them as its own data. Until then it stays the shell's. |
| Chat, feed, hand-off, show, share, the two doors (the brief and `team_note`), where I am | `team/talk.ts`, `feed.ts`, `hand.ts`, `show.ts`, `share.ts`, `note.ts`, `here.ts` | small through the relay's seam | screen, tool, hear and keep | They go through the relay (the hub), and the relay is not a seam yet (**G5**). Until then they would need a big room with the hub's host and a key. |
| Board, calendar, decisions, polls, goal, things in a room | `team/board.ts`, `kit.ts`, `calendar.ts`, `decisions.ts`, `polls.ts`, `goal.ts`, `things.ts` | small through the record's seam | screen, tool | They read and write the team's record (GitHub today, `team/record.ts`). That is a seam (`record()`), but not one a block reaches: **G5**. A big room with `gh` and the key `github` works now (as file it does), with a card that says "anything your GitHub account can". |
| Try, ship, mark, leads, claims, owner's press | `team/try.ts`, `ship.ts`, `mark.ts`, `leads.ts`, `claims.ts`, `press.ts` | big | tool, hear and keep | git and gh on the person's checkout: the checkout is a folder the record would name, but it is where Sol's own code is (a block that writes it rewrites Sol). They stay the shell's. |
| Moving a room | `team/move.ts`, `moved.ts`, `take.ts` | big | tool | gh, git and the hub: as above. |
| The night's work | `team/night.ts` | big | a time | `needs.every` keeps the time; the work is gh and git on the checkout: as Try. |
| Start a session in a room | `team/start.ts` | small | screen, tool | It starts a Work session: a block cannot (**G1**, open question 33). |
| Modes (Home, Cowork, Social, build) | the face's `mode` | none | screen | Data and no engine half (#629): nothing to move here. |
| The router (Sol starts work itself) | none | small | hear and keep, a time | Not built (X20: an option for now). |

### The gaps that come back

- **G1, the turn behind a call.** A block's tool gets its arguments and nothing about who called it: no session,
  no seat's turn, no folder. Desk, Work's tools, suggest and aside all act on the calling conversation. Wanted: the
  shell hands `{ seat, session }` to the tool's run (read only, not something a block can claim), as a seventh piece
  of `sol`.
- **G2, a place on screen for an engine half.** Sol's own faces are the Mac app's, told by messages (`desk`,
  `shelf.items`). A block's face is a `vN.html` in a place. A bridge is one way: the shell relays what the block
  answers in the old message, and the face does not change (the sticky note did this until its face went, #729).
  Each move needs that bridge, or the face reading the block's data.
- **G3, the log carries less than the features hear.** Presses in the face, a talk's turns and receipts are not on
  the log. The kinds a block can hear are the kernel's and the seats'.
- **G4, the second door: native helpers.** `engine/helpers/` builds Sol's own helpers from source (clang).
  `sol/mac/listen` is Swift: the same way, with `swiftc`, or a built file shipped with the app.
- **G5, the relay and the record as seams a block reaches.** `team/record.ts` is already a seam inside the engine;
  a `sol.call` of a narrow record tool would let a small room read and write cards without a key in a room of its own.
