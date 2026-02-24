#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
# Kill ALL omnidash server instances before starting a new one.
#
# Three-phase approach so no zombie escapes:
#
# Phase 1 — PID file: kill the exact process the last server startup recorded.
#   Catches processes that already released port 3000 but are still alive and
#   holding Kafka consumer group memberships (the rebalancing-storm root cause).
#
# Phase 2 — CWD scan: find every node/tsx process whose working directory is
#   this project root and kill it. This catches ALL historical zombies regardless
#   of whether they ever wrote a PID file or held port 3000.
#
# Phase 3 — Port fallback: kill anything still bound to TCP:3000.
#
# Phases 1 and 3 are fast. Phase 2 uses lsof per-PID but only iterates over
# node/tsx processes (typically <10 on a dev machine), so it's cheap in practice.

set -euo pipefail

# Resolve project root relative to this script so the script works from any cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_DIR/.server.pid"
CURRENT_PID=$$

# --- Phase 1: kill from PID file ---
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && [ "$OLD_PID" -gt 1 ] && [ "$OLD_PID" != "$CURRENT_PID" ] 2>/dev/null; then
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[kill-server] Phase 1: killing PID-file process $OLD_PID"
      kill -TERM "$OLD_PID" 2>/dev/null || true
      # 3s grace period: KafkaJS needs time to complete the consumer group leave-group
      # handshake and flush any pending offset commits before we SIGKILL. 0.3s was too
      # short and caused consumer group rebalance storms on the next server startup.
      sleep 3
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
fi

# --- Phase 2: CWD scan — kill every node/tsx process rooted in this project ---
# pgrep finds processes by exact name; lsof checks their working directory.
# We skip our own PID and the PID file's already-killed process.
NODE_PIDS=$(pgrep -x node 2>/dev/null || true)
TSX_PIDS=$(pgrep -x tsx 2>/dev/null || true)
ALL_PIDS="$NODE_PIDS $TSX_PIDS"

for PID in $ALL_PIDS; do
  [ -z "$PID" ] && continue
  [ "$PID" = "$CURRENT_PID" ] && continue

  # Get the working directory of this process via lsof
  CWD=$(lsof -a -d cwd -p "$PID" 2>/dev/null | awk 'NR>1 {print $NF}' | head -1)
  if [ "$CWD" = "$PROJECT_DIR" ]; then
    echo "[kill-server] Phase 2: killing process $PID (cwd=$PROJECT_DIR)"
    kill -9 "$PID" 2>/dev/null || true
  fi
done

# --- Phase 3: port fallback ---
PORT_PIDS=$(lsof -ti:"${PORT:-3000}" 2>/dev/null || true)
if [ -n "$PORT_PIDS" ]; then
  echo "[kill-server] Phase 3: killing port ${PORT:-3000} pids: $PORT_PIDS"
  echo "$PORT_PIDS" | xargs kill -9 2>/dev/null || true
fi

# Short pause so the OS reclaims the port before the new server binds it
sleep 0.5
