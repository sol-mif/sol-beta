// People's part (#1297, src/parts/people.ts): the socket messages it takes, and team.people.reply's answers. Loaded
// through a stand-in registry, so nothing reads GitHub and nothing starts.
import { test } from "node:test";
import assert from "node:assert/strict";
import part from "../src/parts/people.ts";

type Hear = (m: any, h: any) => unknown;
function load() {
  const on = new Map<string, Hear>(), routes: string[] = [];
  part({ on: (t: string, fn: Hear) => { on.set(t, fn); }, route: (m: string, p: string) => { routes.push(`${m} ${p}`); }, atStart: () => {} } as any);
  return { on, routes };
}
const asked = async (fn: Hear, m: object) => {
  const out: any[] = [];
  await fn({ rid: "r1", ...m }, { ws: {}, send: (_ws: unknown, x: unknown) => { out.push(x); } });
  return out;
};

test("People's part takes team.people and team.people.reply (team.*, so track.ts counts it under Cowork), and GET /team/people", () => {
  const { on, routes } = load();
  assert.deepEqual([...on.keys()].sort(), ["team.people", "team.people.reply"]);
  assert.deepEqual(routes, ["GET /team/people"]);
});

test("team.people.reply: refused while reach's tools are off, naming the switch; not ok while reach is not started", async () => {
  const { on } = load();
  const was = process.env.SOL_REACH_TOOLS;
  try {
    process.env.SOL_REACH_TOOLS = "off";
    const [off] = await asked(on.get("team.people.reply")!, { id: "hand000001", accept: true });
    assert.deepEqual(off, { type: "team.people.reply", rid: "r1", ok: false, said: "refused: reach's tools are off (Settings › reach.tools)" });
    process.env.SOL_REACH_TOOLS = "on";
    const [notStarted] = await asked(on.get("team.people.reply")!, { id: "hand000001", accept: true });
    assert.equal(notStarted.ok, false);
    assert.equal(notStarted.said, "reach is not started in this Sol");
  } finally { if (was === undefined) delete process.env.SOL_REACH_TOOLS; else process.env.SOL_REACH_TOOLS = was; }
});
