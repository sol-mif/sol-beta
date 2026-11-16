// A test engine's port, and the one engine a test talks to (#938). Since #921 one machine runs three check runners, so
// two engine suites run side by side: a port from a small fixed range (7990 + random 0..8) was often the other suite's,
// and a test then talked to that suite's engine and went red at random. So: the system names a port nobody holds, and
// a test believes /health only when the pid in it is the engine it started; anything else fails at once, by its name.
// Not a test file (test/*.test.ts), so the suite does not run it on its own.
import type { ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";

// a port the system says is free now: listened on as 0 and given back, for SOL_PORT (the engine's start takes a number,
// and its port goes into its addresses, so it cannot be asked to listen on 0 itself)
export const freePort = () => new Promise<number>((ok, no) => {
  const s = createServer();
  s.once("error", no);
  s.listen(0, "127.0.0.1", () => { const p = (s.address() as AddressInfo).port; s.close(() => ok(p)); });
});

// waits for the engine this test started to answer /health on its port, and gives back that answer; a /health from
// another pid (another run's engine on the port) or the engine ending before it answers is an error, never a pass
export async function ownHealth(engine: ChildProcess, port: number, tries = 150): Promise<any> {
  for (let i = 0; i < tries; i++) {
    if (engine.exitCode !== null || engine.signalCode !== null) throw new Error(`the test engine ended (${engine.exitCode ?? engine.signalCode}) before it answered on port ${port}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) {
        const h = await r.json() as { pid?: number };
        if (h.pid !== engine.pid) throw new Error(`port ${port} is answered by another engine (pid ${h.pid}), not the one this test started (pid ${engine.pid})`);
        return h;
      }
    } catch (e) { if (e instanceof Error && e.message.startsWith(`port ${port} is answered`)) throw e; }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the test engine did not come up on port ${port}`);
}
