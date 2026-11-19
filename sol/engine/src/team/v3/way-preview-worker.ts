// Cowork ways, step 4b part 4: a preview in a worker of its own (way-preview.ts), so a long replay never holds the
// engine's thread; way-wire.ts starts one a preview and ends it when it answers or runs out of time.
import { parentPort, workerData } from "node:worker_threads";
import { previewOf, type PreviewIn } from "./way-preview.js";

try { parentPort?.postMessage(previewOf(workerData as PreviewIn)); }
catch (e) { parentPort?.postMessage({ ok: false, why: "failed", error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }); }
