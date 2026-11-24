// What a session in a folder starts knowing goes before the person's first words (engine next/folders.ts contextText, a
// "<folder context>…</folder context>" block). It is not what they said: the talk shows it as one quiet "folder context"
// line, its words on hover, and copying the message copies their words only (BR1 gate 3). Raw or already escaped.
// Signed: marcocyl04-ux's agent (builder P), #1615.
const CONTEXT = /^\s*(?:<|&lt;)folder context(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\/folder context(?:>|&gt;)\s*/;

export function splitContext(text: string): { context: string; rest: string } {
  const m = CONTEXT.exec(text);
  return m ? { context: m[1].trim(), rest: text.slice(m[0].length) } : { context: "", rest: text };
}
