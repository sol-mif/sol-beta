// the SDK's query swapped for a stand-in (a resolve hook, as aside.test.ts does), so the real openRun, Run.start and the
// wire run with no CLI and no model. Import this before anything of src/. Every call of query is kept in `sdk.calls`
// (its options too); `sdk.make` builds the stand-in's answer, by default the n10 fake that reads the run's inbox
// the way the CLI does (n10-fake.ts: its folder is the HOME and the state of the test).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { T, wait, fakeQuery } from "./n10-fake.ts";

export { T, wait, fakeQuery };
delete process.env.CLAUDE_CONFIG_DIR;

export type Call = { prompt: any; options: any };
export const sdk: { calls: Call[]; made: any[]; make: (a: Call) => any } = {
  calls: [], made: [],
  make: (a) => fakeQuery(a.prompt),
};
(globalThis as any).__workQuery = (a: Call) => { sdk.calls.push(a); const q = sdk.make(a); sdk.made.push(q); return q; };

const stub = join(T, "sdk-stub.mjs");
mkdirSync(T, { recursive: true });
registerHooks({
  resolve(spec, ctx, next) {
    if (spec !== "@anthropic-ai/claude-agent-sdk") return next(spec, ctx);
    const url = next(spec, ctx).url;
    writeFileSync(stub, `export * from ${JSON.stringify(url)};\nexport const query = (a) => globalThis.__workQuery(a);\n`);
    return { url: pathToFileURL(stub).href, shortCircuit: true };
  },
});
