#!/usr/bin/env bash
# Ensure the local Excalidraw DEV server is running on a known, fixed port.
#
# stdout on success (exit 0):
#   url=http://localhost:3999
#   repo=/Users/you/dev/excalidraw
#   bootstrap=/@fs/Users/you/dev/excalidraw/.whiteboard-bootstrap.js
#
# Exits 1 with an explanation on stderr if it cannot be started.
#
# Env:
#   WHITEBOARD_PORT   port to pin the whiteboard to   (default 3999)
#   EXCALIDRAW_REPO   path to the excalidraw clone    (default ~/dev/excalidraw)
set -uo pipefail

PORT="${WHITEBOARD_PORT:-3999}"
REPO="${EXCALIDRAW_REPO:-$HOME/dev/excalidraw}"
LOG="${TMPDIR:-/tmp}/excalidraw-whiteboard-$PORT.log"

# Resolve this script's own directory so the skill works wherever it is
# installed (~/.claude/skills, .agents/skills, a cloned repo, ...).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# A *dev* server specifically: the bootstrap needs `window.h`, which production
# builds do not expose. `@vite/client` in the HTML is the reliable dev marker.
is_dev_excalidraw() {
  local body
  body=$(curl -fsS --max-time 2 "http://localhost:$1/" 2>/dev/null) || return 1
  grep -qi excalidraw <<<"$body" && grep -q "@vite/client" <<<"$body"
}

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

# Vite only serves files under its own root, so stage the bootstrap inside the
# repo. Kept out of git via .git/info/exclude.
stage_bootstrap() {
  local src="$SCRIPT_DIR/bootstrap.js"
  local dst="$REPO/.whiteboard-bootstrap.js"
  [ -f "$src" ] || return 0
  cp "$src" "$dst" 2>/dev/null || return 0
  local ex="$REPO/.git/info/exclude"
  if [ -f "$ex" ] && ! grep -qxF ".whiteboard-bootstrap.js" "$ex"; then
    echo ".whiteboard-bootstrap.js" >>"$ex"
  fi
}

report() {
  echo "url=http://localhost:$PORT"
  echo "repo=$REPO"
  echo "bootstrap=/@fs$REPO/.whiteboard-bootstrap.js"
}

stage_bootstrap

# 1. Already up on the pinned port? This is the common case.
if is_dev_excalidraw "$PORT"; then
  report
  exit 0
fi

# 2. Something else is squatting the port. Say so plainly rather than starting a
#    second server somewhere unpredictable.
if port_in_use "$PORT"; then
  echo "Port $PORT is in use by something that is not an Excalidraw dev server." >&2
  echo "Free it, or pick another: WHITEBOARD_PORT=4001 $0" >&2
  exit 1
fi

# 3. Need to start it — check we can before trying.
if [ ! -d "$REPO" ]; then
  echo "Excalidraw repo not found at $REPO." >&2
  echo "  git clone https://github.com/excalidraw/excalidraw.git $REPO" >&2
  echo "  cd $REPO && corepack enable && yarn install" >&2
  echo "(or set EXCALIDRAW_REPO to an existing clone)" >&2
  exit 1
fi

if [ ! -d "$REPO/node_modules" ]; then
  echo "Dependencies not installed in $REPO." >&2
  echo "  cd $REPO && corepack enable && yarn install" >&2
  exit 1
fi

echo "starting excalidraw whiteboard on port $PORT..." >&2
: >"$LOG"
# --strictPort: fail loudly instead of drifting to another port, so the URL this
#   script reports is always the URL the server is on.
# --no-open:    the vite config sets `open: true`; this skill drives its own tab.
( cd "$REPO" && VITE_APP_PORT="$PORT" nohup yarn start --strictPort --no-open >"$LOG" 2>&1 & )

for _ in $(seq 1 60); do
  sleep 1
  if is_dev_excalidraw "$PORT"; then
    report
    exit 0
  fi
  # Bail out early on a hard failure instead of burning the full 60s.
  if grep -qiE "command not found|error when starting dev server|EADDRINUSE|Cannot find module" "$LOG" 2>/dev/null; then
    echo "Dev server failed to start:" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
done

echo "Dev server did not become ready in 60s. Last log lines:" >&2
tail -20 "$LOG" >&2
exit 1
