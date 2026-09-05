#!/usr/bin/env bash
# Starts a dedicated Chrome with remote debugging on 127.0.0.1:<port> and an isolated profile.
# The MCP server calls this automatically when nothing is listening on the port.
#
#   DISCORD_MCP_PORT          port for the DevTools endpoint (default 9222; the server derives it from DISCORD_MCP_BROWSER_URL)
#   DISCORD_MCP_PROFILE_DIR   Chrome user-data-dir to use (default ~/.discord-unofficial-mcp/chrome-profile)
#   DISCORD_MCP_CHROME_BIN    explicit Chrome/Chromium binary (optional)
#
# Sign in to Discord ONCE in the window this opens; the session persists in the profile directory.
# Windows (CMD):        start chrome --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\.discord-unofficial-mcp\chrome-profile"
# Windows (PowerShell): Start-Process chrome -ArgumentList '--remote-debugging-port=9222',"--user-data-dir=`"$env:USERPROFILE\.discord-unofficial-mcp\chrome-profile`""
set -euo pipefail

PORT="${DISCORD_MCP_PORT:-9222}"
PROFILE="${DISCORD_MCP_PROFILE_DIR:-$HOME/.discord-unofficial-mcp/chrome-profile}"
ENDPOINT="http://127.0.0.1:$PORT/json/version"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to check the DevTools endpoint" >&2
  exit 1
fi

healthy() { curl -s -m 1 "$ENDPOINT" 2>/dev/null | grep -q '"webSocketDebuggerUrl"'; }

if healthy; then
  echo "Something is already listening on :$PORT (the server will verify it belongs to profile $PROFILE)"
  exit 0
fi

mkdir -p "$PROFILE"
chmod 700 "$PROFILE" 2>/dev/null || true
ARGS=(--remote-debugging-port="$PORT" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check)

launch_bin() { "$1" "${ARGS[@]}" >/dev/null 2>&1 & }

started=""
if [[ -n "${DISCORD_MCP_CHROME_BIN:-}" ]]; then
  if [[ -x "$DISCORD_MCP_CHROME_BIN" ]] || command -v "$DISCORD_MCP_CHROME_BIN" >/dev/null 2>&1; then
    launch_bin "$DISCORD_MCP_CHROME_BIN"; started="$DISCORD_MCP_CHROME_BIN"
  else
    echo "DISCORD_MCP_CHROME_BIN=$DISCORD_MCP_CHROME_BIN is not executable" >&2
    exit 1
  fi
elif [[ "$(uname)" == "Darwin" ]]; then
  for app in "Google Chrome" "Chromium" "Brave Browser" "Microsoft Edge"; do
    if [[ -d "/Applications/$app.app" || -d "$HOME/Applications/$app.app" ]]; then
      open -na "$app" --args "${ARGS[@]}" && started="$app" && break
    fi
  done
else
  for bin in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
    if command -v "$bin" >/dev/null 2>&1; then
      launch_bin "$bin"; started="$bin"; break
    fi
  done
fi

if [[ -z "$started" ]]; then
  echo "No Chrome/Chromium/Brave/Edge found. Install one or set DISCORD_MCP_CHROME_BIN." >&2
  exit 1
fi

for _ in $(seq 1 20); do
  sleep 1
  if healthy; then
    echo "$started ready on :$PORT (profile: $PROFILE)"
    exit 0
  fi
done

echo "$started was started but nothing answers on :$PORT after 20 s (is another program using the port? is a display available?)" >&2
exit 1
