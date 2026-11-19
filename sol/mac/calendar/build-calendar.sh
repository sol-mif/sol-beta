#!/usr/bin/env bash
# build-calendar.sh: builds Home's calendar helper (this folder) into bin/calendar beside this script, where Home's
# stage looks for it (sol/design/home/stage/calendar.mjs). One swiftc call, the Info.plist baked in so macOS can ask.
# Signed like build-listen.sh: this Mac's Apple Development certificate when there is one, so the grant survives a
# rebuild; SOL_SIGN=<identity> picks another, SOL_SIGN=- forces ad hoc. Prints the path; non-zero on failure.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$src/bin"
xcrun swiftc -O -swift-version 5 \
  -target "$(uname -m)-apple-macos14.0" \
  -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$src/Info.plist" \
  -o "$src/bin/calendar" \
  "$src/main.swift"
id=${SOL_SIGN:-$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)}
[ -n "$id" ] || id=-
if ! codesign --force --sign "$id" --identifier sol.calendar "$src/bin/calendar" >/dev/null 2>&1; then
  echo "build-calendar: signing with \"$id\" failed; signed ad hoc instead (the grant will not survive a rebuild)" >&2
  codesign --force --sign - --identifier sol.calendar "$src/bin/calendar" >/dev/null 2>&1 || true
fi
echo "$src/bin/calendar"
