#!/usr/bin/env bash
# Kill any previously running omnidash server instances.
#
# Two-pronged approach:
# 1. PID file: kill the exact process recorded by the previous server startup.
#    This catches processes that have already released port 3000 but are still
#    alive (e.g., holding Kafka consumer group memberships).
# 2. Port fallback: kill anything still bound to TCP:3000.

set -euo pipefail

PID_FILE=".server.pid"

# --- Phase 1: kill from PID file ---
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && [ "$OLD_PID" -gt 1 ] 2>/dev/null; then
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[kill-server] Killing previous server (PID $OLD_PID)"
      kill -TERM "$OLD_PID" 2>/dev/null || true
      # Give the process a moment to clean up Kafka consumer membership
      sleep 0.5
      # Force-kill if it's still alive
      if kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID" 2>/dev/null || true
      fi
    fi
  fi
  rm -f "$PID_FILE"
fi

# --- Phase 2: port fallback ---
PORT_PIDS=$(lsof -ti:"${PORT:-3000}" 2>/dev/null || true)
if [ -n "$PORT_PIDS" ]; then
  echo "[kill-server] Killing processes on port ${PORT:-3000}: $PORT_PIDS"
  echo "$PORT_PIDS" | xargs kill -9 2>/dev/null || true
fi

# Short pause to let the OS reclaim the port before new server binds it
sleep 0.5
