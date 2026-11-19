# Moving sessions in the side: each gesture, its press, what you see (step 3b, design #1183 §2; walked in src/side-moves.test.ts)

- Loose row onto an orchestration row: drag it there. The row lights "carry here", the session folds under it, and the row's words read one more under.
- The fold: an orchestration row's left mark turns into the arrow under the pointer; press it (or the row's words) to open or fold the sessions it runs. Its press area is the row's whole left end. Orchestration rows have no hover pin; pin them from the row menu.
- Child stays: drop it anywhere inside its own group (its orchestrator's row, a sibling, the group's room) and nothing moves (#1205, the folder rule).
- Child out, onto the let-go strip or a folder: while you drag a child, a dashed strip above its group says "drop here to let go"; a drop there, or on a folder's tray, lets it go. On a tray of another folder it also moves folder.
- Spring-open: hold a dragged session over a folded orchestration row for 600 ms and it opens.
- While you drag, every orchestration row that could take the session darkens its outline.
- Child out, onto a loose row: drag it onto any row nothing runs. It lets go and stays in its own folder; the folder is not changed.
- Child to another orchestrator: drag it onto that row, its room, or one of its children (that row lights "carry here" before you let go). It moves there, and both rows' words change at the same moment.
- Orchestrator onto an orchestrator: drag one onto the other. It nests, with its own children under the top row.
- A loop: drag an orchestrator onto one it runs. Nothing moves. The row shakes once (120 ms) and its title says "that would run it under itself".
- A nested orchestrator onto its own child: the same loop. It shakes and nothing moves; it is never let go from its orchestrator.
- ⌘↓ on the picked row: it goes under the nearest orchestration row above it, skipping the one it's already under. The row menu shows "put under X ⌘↓". Only while a row is picked and the side is seen.
- ⌘↑ on the picked row: the orchestrator lets it go. The row menu shows "release ⌘↑".
- Undo: after any of these, the side's foot shows "moved under X · undo" or "let go from X · undo" for 8 s. ⌘Z (with the pointer or focus in the side; in the stage ⌘Z stays the stage's) or undo puts the session back.
- An orchestration session renews by itself when its talk fills (60% of its window): it writes a handover, a fresh copy takes its title, its pin, its place (nested stays nested), its stage and every session under it; the old copy is archived as "<title>, until <date>". While it writes, its row's words say "handing over". If you were in it, the view moves to the fresh copy; an open fold stays open. Its sessions never show loose in between. Row menu: "fresh copy now" does the same on your press (#1207).
