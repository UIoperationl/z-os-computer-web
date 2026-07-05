#!/bin/bash
# Self-healing watchdog - double-forked to survive turn endings
# Checks every 15s if Next.js is alive, restarts if not

PROJECT_DIR="/home/z/my-project"
LOG_FILE="$PROJECT_DIR/dev.log"
NEXT_BIN="$PROJECT_DIR/node_modules/.bin/next"
HEARTBEAT_LOG="$PROJECT_DIR/scripts/watchdog_heartbeat.log"

while true; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/keepalive 2>/dev/null)
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "[$(date)] Server down (HTTP $HTTP_CODE). Restarting..." >> $HEARTBEAT_LOG
    
    # Kill stale next processes
    for pid in $(pgrep -f "next-server" 2>/dev/null); do kill -9 $pid 2>/dev/null; done
    for pid in $(pgrep -f "next dev" 2>/dev/null); do kill -9 $pid 2>/dev/null; done
    sleep 2
    
    # Restart with double-fork (reparent to PID 1)
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
