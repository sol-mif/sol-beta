// A made-up person for the side-by-side's dev page (#1423): Dev Ruiz's AI setup, as the builder's seed (people/seed.mjs
// dev) makes it and the explorer reads it (explore.mjs readSetup). Nobody here is real.
import type { SetupRead } from "../setup";

export const DEV: SetupRead = {
  files: [
    { src: "~/.claude/CLAUDE.md", tool: "Claude Code", owner: "you", n: 4, lines: [{ n: 3, text: "Short answers, no summary at the end." }, { n: 4, text: "Commit by yourself once the tests pass." }, { n: 5, text: "Never push to main." }, { n: 6, text: "Use pnpm, never npm." }] },
    { src: "~/src/kite-api/CLAUDE.md", tool: "Claude Code", owner: "team", n: 2, lines: [{ n: 3, text: "Every endpoint gets a test in test/api." }, { n: 4, text: "Ask before changing a migration." }] },
    { src: "~/src/tinyrss/CLAUDE.md", tool: "Claude Code", owner: "you", n: 1, lines: [{ n: 1, text: "Keep it under 500 lines." }] },
  ],
  settings: [
    { k: "model", v: "sonnet", src: "~/.claude/settings.json", tool: "Claude Code", shared: true },
    { k: "autoCompactWindow", v: "120000", src: "~/.claude/settings.json", tool: "Claude Code", shared: true },
    { k: "defaultMode", v: "acceptEdits", src: "~/.claude/settings.json", tool: "Claude Code", shared: true },
  ],
  hooks: [{ event: "PreToolUse", on: "Bash", what: "no-force-push.sh", src: "~/.claude/settings.json" }],
  lists: [{ k: "allow", n: 2, src: "~/.claude/settings.json" }, { k: "deny", n: 1, src: "~/.claude/settings.json" }],
  kept: [{ k: "memory", n: 3, src: "~/.claude/projects" }],
  mcp: [{ name: "linear", src: "~/.claude.json", tool: "Claude Code" }, { name: "github", src: "~/.claude.json", tool: "Claude Code" }, { name: "sentry", src: "~/.claude.json", tool: "Claude Code" }, { name: "linear", src: "~/.codex/config.toml", tool: "Codex" }],
};
