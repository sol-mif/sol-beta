#!/usr/bin/env bash
# The engine and the face for eyes.mjs (#891, the seven human checks), on their own ports (engine 7813, face 1453), with
# a home of their own under /var/tmp/n10-eyes and Vite's cache under /tmp/n10-eyes-vite; never ~/sol-live, its port or
# its unit. Five sessions in one project folder: an earlier sitting whose blocks wait in the tray, and one new sitting
# for each stage the checks look at (one, three and six blocks), the last a sitting with nothing yet.
#   bash sol/mac/eyes-up.sh up      # prints the ids and the folder
#   bash sol/mac/eyes-up.sh down    # stops both, by their pids
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$HERE" rev-parse --show-toplevel)
FIX=$ROOT/sol/design/system/fixtures/stage
S=/var/tmp/n10-eyes
V=/tmp/n10-eyes-vite
EP=${EYES_ENGINE_PORT:-7813}; FP=${EYES_FACE_PORT:-1453}
A=7a1c0a00-0000-4000-8000-0000000891a0
S1=7a1c0a00-0000-4000-8000-0000000891b1
S3=7a1c0a00-0000-4000-8000-0000000891b3
S6=7a1c0a00-0000-4000-8000-0000000891b6
S0=7a1c0a00-0000-4000-8000-0000000891b0
if [ "${1:-}" = down ]; then
  # each pid is npx's or node's; its children (tsx, vite's workers) go with its group
  for p in engine face; do [ -f $S/$p.pid ] && kill -- -"$(cat $S/$p.pid)" 2>/dev/null; rm -f $S/$p.pid; done
  exit 0
fi
rm -rf $S/home $S/user $S/work
mkdir -p $S/home $S/user/.claude $S/work/side $V
git -C $S/work/side init -q
DIR=$S/work/side
P=$S/user/.claude/projects/$(echo "$DIR" | sed 's/[^A-Za-z0-9]/-/g')
mkdir -p "$P"
for sid in $A $S1 $S3 $S6 $S0; do node "$FIX/talk-transcript.mjs" "$sid" "$DIR" > "$P/$sid.jsonl"; done
touch -d '-5 hours' "$P/$A.jsonl"; touch -d '-4 hours' "$P/$S1.jsonl"; touch -d '-3 hours' "$P/$S3.jsonl"; touch -d '-2 hours' "$P/$S6.jsonl"
cd "$ROOT/sol/engine"
HOME=$S/user SOL_HOME=$S/home SOL_PORT=$EP SOL_FACE=http://127.0.0.1:$FP SOL_STAGE_ON=on TMPDIR=/var/tmp setsid nice -n 10 npx tsx src/index.ts > $S/engine.log 2>&1 &
echo $! > $S/engine.pid
cd "$ROOT/sol/mac"
VITE_ENGINE=ws://127.0.0.1:$EP setsid nice -n 10 node -e '
import("vite").then(async (v) => { const s = await v.createServer({ configFile: "vite.config.ts", cacheDir: "'$V'", server: { port: '$FP', strictPort: true, host: "127.0.0.1" } }); await s.listen(); console.log("face up"); });
' > $S/face.log 2>&1 &
echo $! > $S/face.pid
echo "A=$A S1=$S1 S3=$S3 S6=$S6 S0=$S0 DIR=$DIR"
