#!/usr/bin/env bash
# Starts a dedicated Chrome with remote debugging on 127.0.0.1:<port> and an isolated profile.
# The MCP server calls this automatically when nothing is listening on the port.
#
#   DISCORD_MCP_PORT          port for the DevTools endpoint (default 9222)
#   DISCORD_MCP_PROFILE_DIR   Chrome user-data-dir to use (default ~/.discord-unofficial-mcp/chrome-profile)
#   DISCORD_MCP_CHROME_BIN    explicit Chrome/Chromium binary (optional)
#
# Sign in to Discord ONCE in the window this opens; the session persists in the profile directory.
# Windows: start chrome --remote-debugging-port=9222 --user-data-dir=%USERPROFILE%\.discord-unofficial-mcp\chrome-profile
set -euo pipefail

PORT="${DISCORD_MCP_PORT:-9222}"
PROFILE="${DISCORD_MCP_PROFILE_DIR:-$HOME/.discord-unofficial-mcp/chrome-profile}"
ENDPOINT="http://127.0.0.1:$PORT/json/version"

healthy() { curl -s -m 1 "$ENDPOINT" 2>/dev/null | grep -q '"Browser"'; }

if healthy; then
  echo "Chrome is already listening on :$PORT"
  exit 0
fi

mkdir -p "$PROFILE"
chmod 700 "$PROFILE" 2>/dev/null || true
ARGS=(--remote-debugging-port="$PORT" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check)

if [[ -n "${DISCORD_MCP_CHROME_BIN:-}" ]]; then
  "$DISCORD_MCP_CHROME_BIN" "${ARGS[@]}" >/dev/null 2>&1 &
elif [[ "$(uname)" == "Darwin" ]]; then
  open -na "Google Chrome" --args "${ARGS[@]}"
else
  started=0
  for bin in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
    if command -v "$bin" >/dev/null 2>&1; then
      "$bin" "${ARGS[@]}" >/dev/null 2>&1 &
      started=1
      break
    fi
  done
  if [[ $started -eq 0 ]]; then
    echo "No Chrome/Chromium binary found. Set DISCORD_MCP_CHROME_BIN." >&2
    exit 1
  fi
fi

for _ in $(seq 1 20); do
  sleep 1
  if healthy; then
    echo "Chrome ready on :$PORT (profile: $PROFILE)"
    exit 0
  fi
done

echo "Chrome did not come up on :$PORT within 20 s" >&2
exit 1
