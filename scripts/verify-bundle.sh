#!/usr/bin/env bash
# Launch the bundled PhantomOS.app and probe every API route.
# Fails non-zero if any route does not respond.
#
# Usage: bash scripts/verify-bundle.sh
#
# Requires: port 3849 free (no dev server running).

set -u

APP=""
for d in apps/desktop/release/mac-universal apps/desktop/release/mac-arm64 apps/desktop/release/mac; do
  if [[ -d "$d/PhantomOS.app" ]]; then APP="$d/PhantomOS.app"; break; fi
done
if [[ -z "$APP" ]]; then
  echo "error: no PhantomOS.app found in release dirs" >&2; exit 2
fi
PORT=3849
BASE="http://127.0.0.1:${PORT}/api"

if [[ ! -d "$APP" ]]; then
  echo "error: $APP not found — run 'bun run dist:mac' first" >&2
  exit 2
fi

if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "error: port ${PORT} is in use — stop your dev server (kill \$(lsof -tiTCP:${PORT}))" >&2
  exit 2
fi

# Clear quarantine so the unsigned bundle can launch
xattr -cr "$APP" 2>/dev/null || true
xattr -dr com.apple.provenance "$APP" 2>/dev/null || true

LOG=$(mktemp -t phantom-verify)
echo "launching $APP (logs: $LOG)"
"$APP/Contents/MacOS/PhantomOS" >"$LOG" 2>&1 &
APP_PID=$!
trap 'kill $APP_PID 2>/dev/null; pkill -P $APP_PID 2>/dev/null; wait 2>/dev/null' EXIT

# Wait up to 60s for server ready
for i in {1..60}; do
  if curl -fsS "${BASE}/hunter" >/dev/null 2>&1; then
    echo "server up after ${i}s"
    break
  fi
  sleep 1
  if [[ $i == 60 ]]; then
    echo "error: server did not come up in 60s. logs:" >&2
    tail -50 "$LOG" >&2
    exit 3
  fi
done

# One GET per route module. Paths must return 2xx, 3xx, or 404 (valid route, just no data).
# A connection refused or 5xx means the route failed to mount.
ROUTES=(
  "/achievements"
  "/chat/conversations"
  "/claude/slash-commands"
  "/cockpit/overview"
  "/git-identity"
  "/graph/stats/all"
  "/hunter"
  "/hunter-stats/lifetime"
  "/journal/list"
  "/orchestrator/none/strategies"
  "/pane-states/none"
  "/plans"
  "/preferences"
  "/projects"
  "/quests/daily"
  "/servers"
  "/sessions"
  "/sessions/active"
  "/stats"
  "/system-metrics"
  "/tasks/by-cwd?cwd=/tmp"
  "/terminal-sessions/none"
  "/worktrees"
  "/worktrees/none/files"
)

FAIL=0
PASS=0
printf '\n%-45s %s\n' "ROUTE" "STATUS"
printf '%s\n' "------------------------------------------------------------"
for path in "${ROUTES[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE}${path}" || echo "000")
  if [[ "$code" =~ ^[2345][0-9][0-9]$ && "$code" != "500" && "$code" != "502" && "$code" != "503" ]]; then
    printf '%-45s %s OK\n' "$path" "$code"
    PASS=$((PASS+1))
  else
    printf '%-45s %s FAIL\n' "$path" "$code"
    FAIL=$((FAIL+1))
  fi
done

echo
echo "passed: $PASS   failed: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "server log tail:"
  tail -60 "$LOG"
  exit 1
fi
