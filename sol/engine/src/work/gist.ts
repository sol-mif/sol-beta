// The gist: where a talk stood, in its own words, for a talk on the other seat to carry on from. The switch (#182) puts
// it in the box of the new talk, for Marco to read and send; the old handover (work.handover, PROTOCOL round 11) made it
// the first message of a Work session. Both read the same: the last 14 turns, each cut at 1400 characters, the whole at
// 9000, back-to-back lines of one speaker joined first (a Claude turn is many items).
export type Said = { who: string; text: unknown };
export type Item = { kind: string; text?: unknown; parent?: unknown };

export function gist(said: Said[], o: { title?: string; from: string; to: string; me?: string; you?: string }): string {
  const turns: { who: string; text: string }[] = [];
  for (const x of said) {
    const text = String(x.text ?? "").trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.who === x.who) last.text += "\n\n" + text;
    else turns.push({ who: x.who, text });
  }
  let brief = turns.slice(-14).map((x) => `${x.who === "me" ? o.me ?? "Marco" : o.you ?? "Sol"}: ${x.text.slice(0, 1400)}`).join("\n\n");
  if (brief.length > 9000) brief = "…" + brief.slice(-9000);
  return `Carried over from ${o.from}${o.title ? ` ("${String(o.title).slice(0, 120)}")` : ""}. Where it stood:\n\n${brief}\n\nCarry on from here ${o.to}.`;
}

// a Work thread's items as what was said: Marco's lines and Claude's answers, not its tools, thinking or subagents
export const saidOf = (items: Item[]): Said[] =>
  items.filter((i) => !i.parent && (i.kind === "me" || i.kind === "you")).map((i) => ({ who: i.kind, text: i.text }));

/** a session's summary as an orchestration session receives it when the session is put under it (two kinds of session,
 *  2026-11-14, the design's §2: "title, folder, branch, last three things it did, what it waits on, ~600 letters").
 *  The same said lines as gist, the same joining of one speaker's lines; its last three answers, a line each, cut to fit. */
export const JOINED_MAX = 600;
export function joinedGist(items: Item[], o: { id: string; title: string; cwd: string; branch?: string; waits: string }): string {
  const flat = (t: string) => t.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").replace(/\s+/g, " ").trim();
  const turns: string[] = [];
  let prev = "";
  for (const x of saidOf(items)) {
    const text = flat(String(x.text ?? ""));
    if (!text) { continue; }
    if (x.who === "you" && prev === "you") turns[turns.length - 1] += " " + text;
    else if (x.who === "you") turns.push(text);
    prev = x.who;
  }
  const head = `"${flat(o.title).slice(0, 80)}" (${o.id}) in ${o.cwd || "an unknown folder"}${o.branch ? `, on ${o.branch.slice(0, 60)}` : ""}.`;
  const tail = `Waits on: ${flat(o.waits).slice(0, 100)}.`;
  const last = turns.slice(-3);
  // each of the three gets an equal share of what the head and the tail leave, so the whole stays under JOINED_MAX
  const room = Math.max(0, JOINED_MAX - head.length - tail.length - 30);
  const each = last.length ? Math.floor(room / last.length) - 4 : 0;
  const did = last.map((t) => `- ${t.length > each ? t.slice(0, Math.max(0, each - 1)) + "…" : t}`);
  const out = [head, did.length ? `Last it did:\n${did.join("\n")}` : "It has said nothing yet.", tail].join("\n");
  return out.length < JOINED_MAX ? out : out.slice(0, JOINED_MAX - 2) + "…";
}
