#!/usr/bin/env bash
# The app's update feed beside Sol-mac.zip, run by the release workflow after the build:
#   bash sol/mac/release/feed.sh <Sol.app> <tag> <owner/repo>
# writes, in the folder it runs in, Sol-mac.app.tar.gz (Sol.app at its top, as tauri-plugin-updater unpacks it), its
# signature Sol-mac.app.tar.gz.sig (tauri signer: minisign with the key in TAURI_SIGNING_PRIVATE_KEY and
# TAURI_SIGNING_PRIVATE_KEY_PASSWORD), and latest.json. No key: nothing is written and it says so (exit 0), so the
# release goes out as before with only the zip. The signature checked against the app's own public key
# (tauri.conf.json plugins.updater.pubkey) when it has one: a key that does not match it fails the release, since every
# Sol would refuse that update. A feed is written whole or not at all.
set -euo pipefail
app=$1 tag=$2 repo=$3
here="$(cd "$(dirname "$0")" && pwd)"
mac="$(cd "$here/.." && pwd)"
out="$(pwd)"
feed() { node "$here/feed.mjs" "$@"; }
rm -f Sol-mac.app.tar.gz Sol-mac.app.tar.gz.sig latest.json
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "feed: no TAURI_SIGNING_PRIVATE_KEY (the sol-beta secret is not set yet): no app update this release, the zip only"
  exit 0
fi
version=$(feed version "$tag")
have=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
[ "$have" = "$version" ] || { echo "feed: Sol.app says $have, the tag $tag means $version: not built with the release's version" >&2; exit 1; }
done=
trap '[ -n "$done" ] || rm -f Sol-mac.app.tar.gz Sol-mac.app.tar.gz.sig latest.json' EXIT
COPYFILE_DISABLE=1 tar -czf Sol-mac.app.tar.gz -C "$(dirname "$app")" "$(basename "$app")"
(cd "$mac" && npx --no-install tauri signer sign --app-version "$version" "$out/Sol-mac.app.tar.gz" >/dev/null)
[ -s Sol-mac.app.tar.gz.sig ] || { echo "feed: tauri signer wrote no signature" >&2; exit 1; }
# the version is signed with the archive (requireSignedVersion in the app): an old archive cannot pass for a new one
base64 -d < Sol-mac.app.tar.gz.sig | sed -n 3p | tr '\t' '\n' | grep -qx "version:$version" \
  || { echo "feed: the signature does not carry the version $version" >&2; exit 1; }
pub=$(feed pubkey "$mac/src-tauri/tauri.conf.json")
if [ -n "$pub" ]; then
  feed verify Sol-mac.app.tar.gz Sol-mac.app.tar.gz.sig "$pub" "$version" \
    || { echo "feed: the signature is not the app's public key's (the secret and plugins.updater.pubkey are two different keys)" >&2; exit 1; }
  echo "feed: signature checked against the app's public key"
else
  echo "feed: the app has no updater public key yet (plugins.updater.pubkey): signature not checked against it"
fi
feed feed "$tag" "$repo" Sol-mac.app.tar.gz.sig "Sol $tag" > latest.json
done=1
echo "feed: $version, Sol-mac.app.tar.gz $(wc -c < Sol-mac.app.tar.gz | tr -d ' ') bytes"
