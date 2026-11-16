# The engine

How the engine's code is laid out.

**Adding a part (#934).** A new HTTP route, socket message or piece of start-up wiring is a new file in `src/parts/`,
not a line in `src/index.ts`. The file's default export is a function given the registry (`src/parts.ts`):
`p.route("GET", "/things" | /^\/things\/(.+)$/, ({ req, res, path, match, HOME }) => …)` for a route,
`p.on("thing.get" | "thing.", (msg, { ws, face, send, everyone, HOME }) => …)` for a message (a type ending in `.`
takes every type it starts), `p.atStart((engine) => …)` for wiring. Every file there is loaded at start, so no list
names it; what else it needs it imports from the module that owns it. A route is asked after the door and before
index.ts's own routes; a message after index.ts's own cases, so the door, the 403 and the stage and let-go refusals
always come first. Two parts that answer the same route or type stop the engine at start, naming both files.
`test/parts.test.ts` holds `index.ts` to a ceiling of lines: when it fails, the new code goes in a part; when you make
`index.ts` shorter, lower the ceiling with it. The routes and messages still in `index.ts` move into parts once the
open PRs that touch them have landed.
