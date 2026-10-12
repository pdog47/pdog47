#!/usr/bin/env bash
# Applies user.js (and optionally the start page) to every Firefox profile
# in the Chromebook's Linux container. Close Firefox first.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

if pgrep -x firefox >/dev/null || pgrep -x firefox-esr >/dev/null; then
  echo "Close Firefox first, then run this again." >&2
  exit 1
fi

# Older Firefox keeps profiles in ~/.mozilla, newer builds can use ~/.config/mozilla.
profiles=()
for root in "$HOME/.mozilla/firefox" "$HOME/.config/mozilla/firefox"; do
  [ -d "$root" ] || continue
  for d in "$root"/*/; do
    [ -f "$d/prefs.js" ] && profiles+=("${d%/}")
  done
done

if [ ${#profiles[@]} -eq 0 ]; then
  echo "No Firefox profile found. Open Firefox once, close it, then rerun." >&2
  exit 1
fi

# Copy the start page somewhere stable and make it the homepage.
startpage_dir="$HOME/.local/share/startpage"
mkdir -p "$startpage_dir"
cp "$here/startpage.html" "$startpage_dir/index.html"

for p in "${profiles[@]}"; do
  if [ -f "$p/user.js" ]; then
    cp "$p/user.js" "$p/user.js.bak.$(date +%Y%m%d%H%M%S)"
  fi
  cp "$here/user.js" "$p/user.js"
  cat >> "$p/user.js" <<PREFS

// --- Start page (added by install.sh) ---
user_pref("browser.startup.homepage", "file://$startpage_dir/index.html");
user_pref("browser.startup.page", 1);
PREFS
  echo "Applied to: $p"
done

echo "Done. Open Firefox and check about:support or about:config if you want to confirm."
