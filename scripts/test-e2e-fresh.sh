#!/usr/bin/env bash
#
# Runs Playwright e2e tests against a fully fresh build + preview server.
#
# Why this exists: relying on Playwright's `webServer` reuse (or a preview
# server left running from a previous session) is unreliable here — stale
# `wrangler dev` / `workerd` processes can pile up on :8787 across sessions,
# and a test run against a stale build can pass or fail for the wrong
# reason. This script always kills anything already on the port, rebuilds,
# boots a fresh preview server, waits for it, runs the tests, then tears the
# server down again — so a pass/fail here reflects the current code, not
# leftover state.
#
# Usage:
#   pnpm test:e2e:fresh e2e/preview/offline-indicator-consistency.spec.ts
#   pnpm test:e2e:fresh e2e/preview/offline-indicator-consistency.spec.ts -g "some test name"
#   pnpm test:e2e:fresh                      # runs the full e2e suite
#
# Any arguments are forwarded to `npx playwright test ... --project=preview`.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=8787
cd "$REPO_ROOT"

PREVIEW_PID=""

cleanup() {
  echo "==> [cleanup] tearing down preview server"
  if [[ -n "$PREVIEW_PID" ]]; then
    kill -9 "$PREVIEW_PID" 2>/dev/null
  fi
  pkill -9 -f "start-preview.mjs" 2>/dev/null
  pkill -9 -f "wrangler.*--cwd .output dev" 2>/dev/null
  pkill -9 -f "workerd serve" 2>/dev/null
}
trap cleanup EXIT

echo "==> [1/4] Killing any stale preview-server processes from previous runs"
pkill -9 -f "start-preview.mjs" 2>/dev/null
pkill -9 -f "wrangler.*--cwd .output dev" 2>/dev/null
pkill -9 -f "workerd serve" 2>/dev/null
sleep 1

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is still occupied after cleanup — aborting." >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  exit 1
fi

LOG_FILE="$(mktemp -t preview-server-XXXXXX.log)"
echo "==> [2/4] Building + starting a fresh preview server (log: $LOG_FILE)"
npm run preview > "$LOG_FILE" 2>&1 &
PREVIEW_PID=$!

echo "==> [3/4] Waiting for server on :$PORT (this includes the full build)"
READY=0
for _ in $(seq 1 180); do
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    READY=1
    break
  fi
  if ! kill -0 "$PREVIEW_PID" 2>/dev/null; then
    echo "Preview server process exited early. Log:" >&2
    cat "$LOG_FILE" >&2
    exit 1
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  echo "Timed out waiting for preview server to come up. Log:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

# Give wrangler a moment past the port opening before hammering it with tests.
sleep 1

echo "==> [4/4] Running: npx playwright test $* --project=preview"
BASE_URL="http://localhost:$PORT" npx playwright test "$@" --project=preview
TEST_EXIT=$?

echo "==> Playwright exit code: $TEST_EXIT"
if [[ "$TEST_EXIT" -ne 0 ]]; then
  echo "==> Preview server log follows (may help explain the failure):"
  cat "$LOG_FILE"
fi

exit "$TEST_EXIT"
