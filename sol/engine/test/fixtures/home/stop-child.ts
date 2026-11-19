// A Home that is killed half-way through a filing or its undo (test/home-reads.test.ts, "a stop"): run as its own
// process over a rig in the folder it is given, it kills itself with SIGKILL from the log's listener right after the
// line named, as the engine dying there would. The parent then opens the same folder again, as at a restart.
//   stop-child.ts <dir> file <k>       files "call mum today, make notes from the slides"; killed after the k-th line it
//                                      writes (1 the thing.file, 2 and 3 the thing.new, 4 the first judge.read)
//   stop-child.ts <dir> prep           files the same, whole; prints {ledgerId, thingIds}
//   stop-child.ts <dir> undo <id> <k>  presses undo of the filing <id>; killed after the k-th line it writes
import { rig } from "./rig.ts";
import { NOW } from "./seed.ts";
import { readSentence } from "../../../src/home/reads.ts";

const [dir, mode, a, b] = process.argv.slice(2);
const r = rig({ now: NOW, dir });
const f = r.face();
const parts = readSentence("call mum today, make notes from the slides", [], NOW).parts.map((p) => ({ text: p.text, read: p.read, folder: p.folder, at: p.at }));
const die = () => process.kill(process.pid, "SIGKILL");

if (mode === "prep") {
  const d = (await r.ask(f, { type: "home.file", parts })).find((m) => m.type === "home.done");
  process.stdout.write(JSON.stringify({ ledgerId: d.ledgerId, thingIds: d.thingIds }));
} else if (mode === "file" || mode === "undo") {
  const k = Number(mode === "file" ? a : b);
  let n = 0;
  r.log.on(() => { if (++n === k) die(); });
  await r.ask(f, mode === "file" ? { type: "home.file", parts } : { type: "home.undo", ledgerId: a });
}
