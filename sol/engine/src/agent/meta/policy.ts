// Agents' meta (#1327, pass 2): the few writes the meta makes to a place's policy.md, each whole-file and atomic. A rule
// is only ever appended (so the ids of the rules before it never move), rewritten in place by its id, or taken back
// out by its exact line (an undo of what was appended). Everything else in the file stays as written.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsePolicy } from "../store.js";
import { MODES, RUNGS, type Mode, type Rung } from "../harness.js";
import { nameOfFolder } from "./places.js";

const BULLET = /^(\s*[-*]\s+)\[([a-z]+)(?:\s*,\s*([a-z]+))?\]\s+([a-z][a-z0-9-]*)\s*:\s*(.+?)\s*$/i;
const pathOf = (home: string, folder: string) => join(home, folder, "policy.md");
const readText = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
function write(p: string, text: string) { const tmp = `${p}.${process.pid}.tmp`; writeFileSync(tmp, text); renameSync(tmp, p); }

/** a rule's bullet line */
export const bulletOf = (mode: Mode, rung: Rung, source: string, sentence: string) => `- [${mode}${rung === "read" ? "" : `, ${rung}`}] ${source}: ${sentence}`;

/** append a rule (policy.md made when the place has none); its id back */
export function appendRule(home: string, folder: string, line: string): string {
  const p = pathOf(home, folder);
  const text = readText(p) ?? `# ${nameOfFolder(folder)}'s policy\n`;
  write(p, `${text.replace(/\n*$/, "\n")}${line}\n`);
  const rules = parsePolicy(`${text}\n${line}\n`);
  return rules[rules.length - 1].id;
}
/** take an appended line back out (the last line equal to it); false when it is not there */
export function removeLine(home: string, folder: string, line: string): boolean {
  const p = pathOf(home, folder), text = readText(p);
  if (text === null) return false;
  const lines = text.split("\n"), i = lines.lastIndexOf(line);
  if (i < 0) return false;
  lines.splice(i, 1);
  write(p, lines.join("\n"));
  return true;
}
/** a rule's line as it is now, by its id; null when there is none */
export function lineOf(home: string, folder: string, ruleId: string): string | null {
  const text = readText(pathOf(home, folder));
  if (text === null) return null;
  const count = new Map<string, number>();
  for (const line of text.split("\n")) {
    const m = BULLET.exec(line);
    if (!m || !MODES.includes(m[2].toLowerCase() as Mode) || !RUNGS.includes((m[3]?.toLowerCase() ?? "read") as Rung)) continue;
    const source = m[4].toLowerCase(), n = (count.get(source) ?? 0) + 1;
    count.set(source, n);
    if (`${source}-${n}` === ruleId) return line;
  }
  return null;
}
/** rewrite one rule by its id: its mode, rung or sentence; the line before back, or null when there is no such rule */
export function rewriteRule(home: string, folder: string, ruleId: string, to: { mode?: Mode; rung?: Rung; sentence?: string }): string | null {
  const p = pathOf(home, folder), text = readText(p);
  if (text === null) return null;
  const before = lineOf(home, folder, ruleId);
  if (before === null) return null;
  const m = BULLET.exec(before)!;
  const line = `${m[1]}[${to.mode ?? m[2].toLowerCase()}${(to.rung ?? m[3]?.toLowerCase() ?? "read") === "read" ? "" : `, ${to.rung ?? m[3].toLowerCase()}`}] ${m[4]}: ${to.sentence ?? m[5]}`;
  if (line !== before) {
    const lines = text.split("\n");
    lines[lines.indexOf(before)] = line;
    write(p, lines.join("\n"));
  }
  return before;
}
/** put a rule's whole line back as it was (an undo of rewriteRule) */
export function restoreLine(home: string, folder: string, ruleId: string, line: string): boolean {
  const m = BULLET.exec(line);
  if (!m) return false;
  return rewriteRule(home, folder, ruleId, { mode: m[2].toLowerCase() as Mode, rung: (m[3]?.toLowerCase() ?? "read") as Rung, sentence: m[5] }) !== null;
}
export const hasPolicy = (home: string, folder: string) => existsSync(pathOf(home, folder));
