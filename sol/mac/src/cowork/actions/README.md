# Adding an action to the action board

An action is one thing a card's menu can do. It is a team block of kind `action` (#429): declared once, drawn by one
file in this folder, and live in a project once the team turns it on.

1. Make a branch: `<your-login>/action-<what>`.
2. Declare it in `sol/mac/src/cowork/blocks/blocks.json`, one entry in `blocks`:

   ```json
   { "id": "my-action", "kind": "action", "name": "copy the link", "start": "off",
     "shows": "an item in a card's menu on the action board",
     "does": ["copy the issue's link"], "agents": [] }
   ```

   `name` is the menu's words: lower case, a verb first. `start: "off"` means a project has it only once its team
   agrees, in the project settings (blocks); Sol's first actions start `"on"` so nothing anyone saw changed.
3. Add `sol/mac/src/cowork/actions/<what>.ts`, in this shape:

   ```ts
   import type { ActionDef } from "./index";

   const myAction: ActionDef = {
     when: (card) => !!card.url,             // which cards show it
     run: (card, team) => navigator.clipboard?.writeText(card.url),
   };
   export default myAction;
   ```

   `card` is one issue on the board: `repo`, `number`, `title`, `column`, `assignees`, `labels`, `url`, `pr`,
   `branch`, `sign`. `team` is the Cowork state: `team.me`, `team.state.roster`, `team.board`, and
   `team.ask(type, body)` to send a `team.*` message to Sol (PROTOCOL.md, round 17 and on).
4. Add it to `DRAWN` in `index.ts`: one import, one line keyed by its id.
5. Build the face (`cd sol/mac && npm run build`), turn it on in a project's settings, look at it in Cowork, open a
   draft PR that names its issue.

`copy-link.ts` is the smallest one there is; start from it. An action does what a person could do from the card by
hand. It never writes where the person did not ask, and anything it writes carries their signature.
