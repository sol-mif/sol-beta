// node --test src/*.test.ts: the app's own update line (#1824, J1b) is in the new face too, the old face's ShellLine
// itself (cowork/ShellLine.tsx, shellWord.ts), mounted once over the talk pill, with no second copy of its logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (p: string) => readFileSync(join(here, p), "utf8");
const filesIn = (d: string): string[] => readdirSync(join(here, d), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? filesIn(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []);

test("the new face mounts the old face's ShellLine once, over the pill, and keeps no copy of its words", () => {
  const next = read("next/Next.tsx");
  assert.match(next, /import \{ ShellLine \} from "\.\.\/cowork\/ShellLine";/);
  assert.match(next, /import "\.\/appup\.css";/);
  assert.equal(next.match(/<ShellLine \/>/g)?.length, 1);
  assert.ok(next.indexOf("<ShellLine />") > next.indexOf("<Pill />"), "drawn after the pill, in the shell");
  const own = filesIn("next").filter((f) => /team\.shell|app_update_|shellView|wordOf/.test(read(f)));
  assert.deepEqual(own, [], "the new face reads team.shell and the shell's state only through ShellLine");
  const css = read("next/appup.css");
  assert.match(css, /\.nx\.at-settings \.nx-appup \{ display: none; \}/);
  assert.match(css, /\.nx:has\(\.ask-col \.appup\) \.nx-appup \{ display: none; \}/, "a session's Composer has its own: never two");
});
