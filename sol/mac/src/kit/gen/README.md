# gen: UI on the fly, from the one system (#1245)
An agent writes a spec, JSON: `{ "piece": "Block", "props": { "title": "the build" }, "state": "working", "children": [ ... ] }`.
The pieces, their props, states and what each may hold are the table in `spec.ts` (`PIECES`); nothing else is drawn.
Name no colour, size, font, shadow or motion: a piece takes them from the tokens by its role and state (`sol/design/system/rules.md`).
Say a state by the piece's state (done, waiting, broken), or a meaning by a `Sticker` or `Coin` with `role` done, ask or wrong.
Anything else is not refused but rewritten by `lint.ts`, each rewrite a note: read the notes and write the next spec without them.
Call `compose(spec)` (`api.ts`) for `{ element, notes }`; `Gen({ spec })` (`render.tsx`) draws one in React.
Try one on the dev page, `gen.html` (or `gen.html?spec=<base64 of the JSON>`); the tests: `node --test src/kit/gen/lint.test.ts`.

## say: a sentence, made a spec
An agent speaks in sentences, so `say(sentence)` (`say.ts`) composes a spec from plain words with no model call: the
sentence is cut into clauses at commas, colons and "with"; the first names the thing and gives the block its title,
each other clause adds a piece; the result goes through the lint, so it is always the one system (`sayOut` returns the
notes too). Try it in `gen.html`'s "say it" field (or `gen.html?say=<words>`); the tests: `node --test src/kit/gen/say.test.ts`.
Example: "a run laying out the spreads, three steps, the second one now, 6 of 10".

| word | piece |
| --- | --- |
| a run (job, task) | `Block`, working; its steps as `Row`s |
| N steps · the second one now | a `Row` each; the one now picked (pearl) with "now" aside |
| N of M | `Meter`, its label "N of M" |
| files (covers, images, photos) · png | `FileTile`s in a row `Stack`, the kind from the clause |
| a question (ask) · yours now | `Block`, waiting; an ask `Coin` and its words in a row |
| a decision to … | an ask `Coin` and its words in a row |
| the count of … · big | `Num`, or `Text` as a number when big; no number said: `Ping` (fanned when big) |
| a handover of … from … | `Block` titled with what, a caption `Text` with who |
| a thread (chat) · N lines | a `List` of N `Row`s |
| N sessions · one active | `SessionRow`s, the active one in pearl |
| a done stamp at 9:04 · decided at 8:41 | `Sticker`, done, at the corner |
| a card (block), a note | `Block` titled with its words |
| any other clause | `Text` with the clause |

What it refuses: a sentence that names no thing above becomes a note card (a `Block` titled "a note" with the sentence
as `Text`) and one note saying so, never a throw; more than 8 of one thing is cut to 8, with a note. It never names a
colour, size, font or motion: those come from the piece (rules 17, 20, 23).
