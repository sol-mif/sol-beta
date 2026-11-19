// owned by slice 3 (Near), docs/port/slices.md
// Near's phrases for the talk pill (#1615; the mockup's runs.js runsSay, as it is): "Ada, fix the login bug in api"
// opens a starter where it will run, "start it" starts it in place, "new session", "give this to Ada", the run moves by
// name ("check Ada", "redirect Ada to …"), and a split job's parts ("open part 2", "back to the job"). The chain lowercases
// the words before they reach here, so a name is found whatever its case. Tried before the shared phrases (say/index.ts).
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { D, M, S, done, render, type Phrase } from "../core.ts";
import { aiNamed, current, focused, setOf } from "../../near/runs.ts";
import { closePart, closeStarter, openPart, sessionOfAI } from "../moves/near.ts";

/** "… in api": the folder named at the end, and the words before it (runs.js regionIn) */
export function regionIn(w: string): { words: string; region: string | null } {
  const m = /\s+in (?:the )?([\w-]+)(?: repo)?\s*$/i.exec(w);
  if (!m) return { words: w, region: null };
  const r = D.regions.find((x) => x.id.toLowerCase() === m[1].toLowerCase() || x.name.toLowerCase().startsWith(m[1].toLowerCase()));
  return r ? { words: w.slice(0, m.index).trim(), region: r.id } : { words: w, region: null };
}

const phrases: Phrase[] = [
  // while a starter is open: start it, close it, give it to another AI
  { hears: /^(start|start it|go|go ahead|yes|do it)$/, run: () => { const c = focused(); return c ? M.start(c.id) : null; } },
  { hears: /^(close|cancel|never ?mind)$/, run: () => (focused() ? closeStarter() : null) },
  { hears: /^(?:use|ask|give it to) (\w+)(?: instead)?$/, run: (m) => {
    const c = focused(), ai = aiNamed(m[1]);
    if (!c || !ai) return null;
    const was = { ai: c.ai, reach: c.reach };
    c.ai = ai; c.reach = setOf(ai).reach; render();
    return done(true, c.id, () => { Object.assign(c, was); render(); });
  } },
  // "Ada, fix the login bug in api": a starter for that AI, where the words say
  { hears: /^(\w+)[,:]\s*(.+)$/, run: (m) => {
    const ai = aiNamed(m[1]);
    if (!ai) return null;
    const x = regionIn(m[2]);
    return M.start({ ai, words: x.words, region: x.region || undefined });
  } },
  { hears: /^(new session|start a session|start something|new)$/, run: () => M.start({}) },
  { hears: /^give (?:this|it) to (\w+)$/, run: (m) => {
    const ai = aiNamed(m[1]), cur = current(), p = cur ? D.pieces[cur] : undefined;
    return ai && p ? M.start({ ai, given: [p.id], region: p.region }) : null;
  } },
  { hears: /^check (\w+)$/, run: (m) => { const id = sessionOfAI(m[1]); return id ? M.check(id) : null; } },
  { hears: /^redirect (\w+) to (.+)$/, run: (m) => { const id = sessionOfAI(m[1]); return id ? M.redirect(id, m[2]) : null; } },
  // a split job's parts at Near
  { hears: /^(back|out|back to the job|close the part)$/, run: () => (S.part ? closePart() : null) },
  { hears: /^open (?:part )?(\d+|\w+)(?:'s part)?$/, run: (m) => {
    if (S.dist !== "near") return null;
    const j = S.piece ? D.pieces[S.piece] : undefined;
    if (!j?.parts) return null;
    const x = /^\d+$/.test(m[1]) ? j.parts[+m[1] - 1] : j.parts.find((q) => String(q.ai).toLowerCase() === m[1]);
    return x ? openPart(x.id) : null;
  } },
];
export default phrases;
