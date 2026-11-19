#!/bin/bash
# Try the one onboarding (#1088) and its side-by-side (#1423) for real, beside your own Sol and never in it: a throwaway
# home, a test engine on its own port with HOME set to that home, and the face built for that engine. Your own Sol, its
# engine, ~/.sol and your files are not touched; everything the try writes lives in $SOL_TRY (default /tmp/sol-try).
#   try.sh dev | noa | ines | sam | lee   a made-up person (seed.mjs)
#   try.sh me                             your own AI setup, copied without keys (mirror.mjs): your rules, settings,
#                                         hooks, MCP servers by name; calendar, files and browser stay empty
#   try.sh stop                           ends the test engine and the face's server
#   --build                               rebuilds the face (after a change in sol/mac); it is built once otherwise
# Then open the printed address (Sol's browser block, or any browser). Again from the start: run it again.
# Ports: SOL_TRY_ENGINE (7811) and SOL_TRY_FACE (7792); the engine needs node-pty (npm install in sol/engine).
set -euo pipefail
who="${1:-}"; build="${2:-}"
T="${SOL_TRY:-/tmp/sol-try}"
EP="${SOL_TRY_ENGINE:-7811}"; FP="${SOL_TRY_FACE:-7792}"
here="$(cd "$(dirname "$0")" && pwd)"
mac="$(cd "$here/../../.." && pwd)"
engine="$(cd "$mac/../engine" && pwd)"

stop() {
  for f in "$T/engine.pid" "$T/face.pid"; do
    [ -f "$f" ] || continue
    pid="$(cat "$f")"
    # only this try's own processes: the pid's command must be ours
    if ps -o command= -p "$pid" 2>/dev/null | grep -qE "src/index.ts|http.server $FP"; then pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; fi
    rm -f "$f"
  done
}

case "$who" in
  stop) stop; echo "try: stopped"; exit 0 ;;
  dev|noa|ines|sam|lee|me) ;;
  *) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

for p in "$EP" "$FP"; do
  holder="$(lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  # ours when it is a pid this try started, or that pid's child (tsx runs the engine as its child)
  parent="$( [ -n "$holder" ] && ps -o ppid= -p "$holder" | tr -d ' ' || true)"
  if [ -n "$holder" ] && ! grep -qxE "$holder|${parent:-none}" "$T/engine.pid" "$T/face.pid" 2>/dev/null; then
    echo "try: port $p is held by another program (pid $holder); set SOL_TRY_ENGINE / SOL_TRY_FACE to free ones" >&2; exit 1
  fi
done
(cd "$engine" && node -e 'require.resolve("node-pty")' 2>/dev/null) || { echo "try: the engine has no node-pty, so the explorer cannot open its terminal: npm install in $engine" >&2; exit 1; }

stop
mkdir -p "$T"
rm -rf "$T/home" "$T/sol-home" "$T/state" "$T/rooms" "$T/profile" "$T/team.json"
mkdir -p "$T/sol-home" "$T/state" "$T/rooms" "$T/profile"
if [ "$who" = me ]; then node "$here/mirror.mjs" "$T/home"; else node "$here/seed.mjs" "$who" "$T/home"; fi

# the face, built for this engine's port into $T/dist, with its own Vite cache (a shared one is rewritten under a live face)
if [ "$build" = "--build" ] || [ ! -f "$T/dist/index.html" ] || [ "$(cat "$T/dist.port" 2>/dev/null)" != "$EP" ]; then
  cat > "$T/vite.config.ts" <<EOF
import base from "$mac/vite.config.ts";
export default async (env: any) => { const b = typeof base === "function" ? await (base as any)(env) : base;
  return { ...b, root: "$mac", cacheDir: "$T/cache", build: { ...b.build, outDir: "$T/dist", emptyOutDir: true } }; };
EOF
  echo "try: building the face for ws://127.0.0.1:$EP"
  (cd "$mac" && VITE_ENGINE="ws://127.0.0.1:$EP" ./node_modules/.bin/vite build --config "$T/vite.config.ts" --logLevel error > "$T/build.log" 2>&1) \
    || { grep -v '^    at ' "$T/build.log" | head -8 >&2; echo "try: the face did not build; a package it names as unresolved is missing: npm install in $mac" >&2; exit 1; }
  echo "$EP" > "$T/dist.port"
fi

nohup python3 -m http.server "$FP" --bind 127.0.0.1 --directory "$T/dist" > "$T/face.log" 2>&1 &
echo $! > "$T/face.pid"
# the engine sees only this environment: the throwaway home, its own state, offline from the team; no seat, so the
# onboarding's model turn falls back to its rules, as on a machine with no AI signed in
(cd "$engine"; env -i PATH="$PATH" SHELL=/bin/zsh USER="$USER" TMPDIR="${TMPDIR:-/tmp}" LANG=en_US.UTF-8 TERM=xterm-256color \
  HOME="$T/home" PORT="$EP" SOL_PORT="$EP" SOL_HOME="$T/sol-home" SOL_STATE="$T/state/work.json" SOL_TEAM="$T/team.json" \
  SOL_PROFILE="$T/profile" SOL_DIST="$T/dist" SOL_FACE="http://127.0.0.1:$FP" SOL_LOG="$T/engine.log" SOL_ROOMS="$T/rooms" \
  SOL_QUIET=1 SOL_TEAM_OFFLINE=1 GIT_TERMINAL_PROMPT=0 nohup ./node_modules/.bin/tsx src/index.ts > "$T/engine.out" 2>&1 &
  echo $! > "$T/engine.pid")

for _ in $(seq 1 60); do grep -q "engine up" "$T/engine.out" 2>/dev/null && break; sleep 0.5; done
grep -q "engine up" "$T/engine.out" || { echo "try: the engine did not start; see $T/engine.out" >&2; tail -5 "$T/engine.out" >&2; exit 1; }
echo "try: $who is ready → http://127.0.0.1:$FP/?onboard=again   (home: $T/home; stop: $0 stop)"
