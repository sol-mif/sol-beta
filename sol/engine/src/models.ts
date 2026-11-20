// The models each seat offers, as the companies give them (#863): no names written here but the fallback.
// Claude: the CLI's own list (supportedModels), the newest version of each family, read at start and every six hours
// and kept in models.json beside settings.json, so a cold start shows the last list. Codex: its own model cache, in its
// order; its first is the default. A pick that is an older version of a family runs as that family's newest, unless KEEP
// names it: a kept version stays in the list beside its family's newest whenever the CLI still offers it, and runs as itself.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { query, type ModelInfo } from "@anthropic-ai/claude-agent-sdk";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "models.json");
// Older versions kept on purpose (#863: Fable 5.1 stays beside Fable 5.2). Add an id here to keep another; remove it to let
// that version follow its family's newest again.
export const KEEP = ["claude-fable-5-1"];
export const FALLBACK = { models: ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], default: "claude-opus-5-5" };
const ORDER = ["fable", "opus", "sonnet", "haiku"];   // most able first; a family not named here comes after them

// The kept list is written with it: a file written under another KEEP (or before KEEP) is not trusted, so a cold start
// never offers a list that leaves out a kept version and the faces never move a saved pick of it to the newest.
export function cached(text: string, keep = KEEP): { models: string[]; default: string } | null {
  try {
    const d = JSON.parse(text);
    if (Array.isArray(d.models) && d.models.length && typeof d.default === "string" && JSON.stringify(d.keep) === JSON.stringify(keep)) return { models: d.models, default: d.default };
  } catch {}
  return null;
}
let onDisk = false;
let claude: { models: string[]; default: string } = (() => {
  let text = "";
  try { text = readFileSync(FILE, "utf8"); } catch {}
  const d = cached(text);
  onDisk = !!d;
  return d ?? FALLBACK;
})();

// "claude-fable-5-2" -> fable 5.2; "claude-haiku-4-5-20251001" -> haiku 4.5; "claude-opus-5" -> opus 5.0
export function family(id: string): { name: string; version: number[] } | null {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/);
  return m ? { name: m[1], version: [Number(m[2]), Number(m[3] ?? 0)] } : null;
}
const newer = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];

// The CLI's rows, aliases and old versions alike, made into one id per family, its newest, most able family first; a
// version KEEP names and the CLI offers stays too, right after its family's newest (newer kept ones first).
export function flagships(rows: Pick<ModelInfo, "value" | "resolvedModel">[], keep = KEEP): { models: string[]; default: string } {
  const best = new Map<string, { id: string; version: number[] }>();
  const kept = new Map<string, { id: string; version: number[] }[]>();
  for (const r of rows) {
    const id = r.resolvedModel ?? r.value;
    const f = family(id);
    if (!f) continue;
    if (keep.includes(id) && !kept.get(f.name)?.some((k) => k.id === id)) kept.set(f.name, [...(kept.get(f.name) ?? []), { id, version: f.version }]);
    const had = best.get(f.name);
    if (!had || newer(f.version, had.version) > 0) best.set(f.name, { id, version: f.version });
  }
  const rank = (n: string) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
  const models = [...best.keys()].sort((a, b) => rank(a) - rank(b)).flatMap((n) => {
    const top = best.get(n)!.id;
    return [top, ...(kept.get(n) ?? []).filter((k) => k.id !== top).sort((a, b) => newer(b.version, a.version)).map((k) => k.id)];
  });
  const said = rows.find((r) => r.value === "default")?.resolvedModel;
  const def = said ? latest(said, models, keep) : undefined;
  return { models, default: def && models.includes(def) ? def : models.find((m) => family(m)?.name === "opus") ?? models[0] };
}

// A Claude id moved to its family's newest in the list (the list puts each family's newest first); anything else as it is.
const newest = (id: string, models: string[]) => {
  const f = family(id);
  return (f && models.find((m) => family(m)?.name === f.name)) || id;
};
// The id a pick runs as: a kept version, or one the list offers, as itself; an older version as its family's newest.
export function latest(id: string, models = claude.models, keep = KEEP): string {
  return keep.includes(id) || models.includes(id) ? id : newest(id, models);
}

export const claudeModels = () => claude.models;
export const claudeDefault = () => claude.default;
// The cheapest Claude the person's list offers: the newest of the least able family it names (haiku before sonnet before
// opus); null when the list names none of the known families (#1485: the blank sticky's "which place?" without Jev).
export function cheapest(models = claude.models): string | null {
  const known = models.filter((m) => ORDER.includes(family(m)?.name ?? ""));
  if (!known.length) return null;
  const rank = (m: string) => ORDER.indexOf(family(m)!.name);
  return known.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

// One CLI started only to ask; no prompt is ever sent. It reads the person's own settings (~/.claude/settings.json), so
// what they narrow there (availableModels, modelPicker, a model env such as ANTHROPIC_DEFAULT_OPUS_MODEL) narrows the
// list as it does in Claude Code; their hooks are off for it, so a SessionStart hook does not run every six hours.
export const ASK = { cwd: tmpdir(), settingSources: ["user" as const], settings: { disableAllHooks: true } };
export async function refreshClaude(): Promise<boolean> {
  async function* never(): AsyncGenerator<never> { await new Promise(() => {}); }
  const q = query({ prompt: never(), options: ASK });
  let wait: NodeJS.Timeout | undefined;
  try {
    const next = flagships(await Promise.race([q.supportedModels(), new Promise<never>((_, no) => { wait = setTimeout(() => no(new Error("no answer in 60 s")), 60_000); })]));
    if (!next.models.length) return false;
    const changed = JSON.stringify(next) !== JSON.stringify(claude);
    claude = next;
    if (changed || !onDisk) {
      writeFileSync(`${FILE}.tmp`, JSON.stringify({ ...next, keep: KEEP }, null, 2));
      renameSync(`${FILE}.tmp`, FILE);
      onDisk = true;
      console.log(`models: Claude offers ${next.models.join(", ")} (default ${next.default})`);
    }
    return changed;
  } catch (err) {
    console.log(`models: Claude's list not read, keeping ${claude.models.join(", ")}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    return false;
  } finally {
    clearTimeout(wait);
    q.close();
  }
}

// Codex: what its own cache lists as visible, in its order (its "priority"); the first is its default.
function codexCache(): any[] {
  try {
    const cache = JSON.parse(readFileSync(join(homedir(), ".codex", "models_cache.json"), "utf8"));
    return (cache.models ?? []).filter((m: any) => m.visibility === "list").sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99));
  } catch { return []; }
}
export function codexModels(): string[] {
  const out = codexCache().map((m) => m.slug as string);
  return out.length ? out : ["gpt-6.1-sol"];
}
export const codexDefault = () => codexModels()[0];

// Codex's window for a model, from the same cache; Claude's result message says its own.
export function codexWindow(model?: string): number {
  const m = codexCache().find((x) => x.slug === (model ?? codexDefault()));
  return m?.context_window ? Math.round(m.context_window * (m.effective_context_window_percent ?? 100) / 100) : 258400;
}
