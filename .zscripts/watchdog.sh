#!/bin/bash
# Self-healing watchdog - double-forked to survive turn endings
# Checks every 15s if Next.js is alive, restarts if not
# Also reinstalls node_modules if they got wiped by container reboot

PROJECT_DIR="/home/z/my-project"
LOG_FILE="$PROJECT_DIR/dev.log"
NEXT_BIN="$PROJECT_DIR/node_modules/.bin/next"
HEARTBEAT_LOG="$PROJECT_DIR/scripts/watchdog_heartbeat.log"
BUN="/usr/local/bin/bun"

mkdir -p "$PROJECT_DIR/scripts"

while true; do
  # Check if node_modules exists (gets wiped on container reboot)
  if [ ! -f "$NEXT_BIN" ]; then
    echo "[$(date)] node_modules missing. Running bun install..." >> $HEARTBEAT_LOG
    cd "$PROJECT_DIR"
    $BUN install >> "$LOG_FILE" 2>&1
    echo "[$(date)] bun install complete" >> $HEARTBEAT_LOG
    sleep 3
  fi
  
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/keepalive 2>/dev/null)
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "[$(date)] Server down (HTTP $HTTP_CODE). Restarting..." >> $HEARTBEAT_LOG
    
    # Kill stale next processes
    for pid in $(pgrep -f "next-server" 2>/dev/null); do kill -9 $pid 2>/dev/null; done
    for pid in $(pgrep -f "next dev" 2>/dev/null); do kill -9 $pid 2>/dev/null; done
    sleep 2
    
    # Make sure scripts dir and heartbeat log exist
    mkdir -p "$PROJECT_DIR/scripts"
    touch "$PROJECT_DIR/scripts/desktop_heartbeat.log"
    
    # Restart with double-fork (reparent to PID 1)
    cd "$PROJECT_DIR"
    (
      (
        exec setsid $NEXT_BIN dev -p 3000 > "$LOG_FILE" 2>&1 < /dev/null
      ) &
    )
    disown 2>/dev/null || true
    
    # Wait for ready
    for i in {1..30}; do
      sleep 1
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/api/keepalive 2>/dev/null)
      if [ "$HTTP_CODE" = "200" ]; then
        echo "[$(date)] Server back up" >> $HEARTBEAT_LOG
        break
      fi
    done
  fi
  
  sleep 15
done
