// node --test src/*.test.ts: the tickets switch (build.tickets, one/tickets.ts): its own switch, off by default, and never
// among the switches that turn on by themselves where this Sol runs as concept (MINE_ON); the engine is told of it as
// work.tickets.on, and an orchestration session then routes (engine work/one.ts). tickets.ts itself is not imported
// here: it reaches the engine's address (engine.ts, import.meta.env), which only Vite gives; the key is read as written there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSwitch, MINE_ON } from "./flag.ts";

const KEY = "build.tickets";
const env = (kv: Record<string, string> = {}, search = "") => ({ search: () => search, target: null, storage: () => ({ getItem: (k: string) => kv[k] ?? null, setItem: () => {} }) as any });
const src = () => readFileSync(new URL("./one/tickets.ts", import.meta.url), "utf8");
test("build.tickets is its own switch, off by default, on by its row or the link", () => {
  assert.match(src(), /export const TICKETS_FLAG = "build\.tickets";/);
  assert.equal(buildSwitch(KEY, env()).get(), false);
  assert.equal(buildSwitch(KEY, env({ [KEY]: "1" })).get(), true);
  assert.equal(buildSwitch(KEY, env({}, `?${KEY}=on`)).get(), true);
});
test("nothing turns build.tickets on by default", () => {
  assert.equal(MINE_ON.has(KEY), false);
});
test("the window tells the engine the switch, and the face reads the tickets' words in the talk", () => {
  assert.match(src(), /type: "work\.tickets\.on", on,/);
  for (const f of ["./home/Home.tsx", "./work/WorkApp.tsx"]) assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /\n  useTicketsToEngine\(\);/, f);
  assert.match(readFileSync(new URL("./Settings.tsx", import.meta.url), "utf8"), /an orchestration session hands each piece of work to its own session/);
  assert.match(readFileSync(new URL("./one/engineSaid.ts", import.meta.url), "utf8"), /<ticket reports>"\)\) return "reports came in from its tickets"/);
});
