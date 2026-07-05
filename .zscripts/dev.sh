#!/bin/bash
# dev.sh - executed by /start.sh at container boot (if it exists)
# Starts Next.js dev server as a persistent process parented to PID 1

set -e

PROJECT_DIR="/home/z/my-project"
LOG_FILE="$PROJECT_DIR/dev.log"
NEXT_BIN="$PROJECT_DIR/node_modules/.bin/next"

# Start Next.js with double-fork to reparent to PID 1 (tini)
# This makes it survive chat turn endings
(
  (
    exec setsid $NEXT_BIN dev -p 3000 > "$LOG_FILE" 2>&1 < /dev/null
  ) &
)
disown 2>/dev/null || true

# Wait for it to be ready
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    echo "Next.js dev server is ready"
    break
  fi
  sleep 1
done
