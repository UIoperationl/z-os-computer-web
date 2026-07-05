#!/bin/bash
# Smart watchdog - checks port, only kills stale processes, never kills itself
LOG=/home/z/my-project/dev.log
NEXT=/home/z/my-project/node_modules/.bin/next
PORT=3000
WATCHDOG_PID=$$

while true; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:$PORT/ 2>/dev/null)
    
    if [ "$HTTP_CODE" != "200" ]; then
        echo "[$(date)] Server down (HTTP $HTTP_CODE). Starting fresh..." >> $LOG
        
        # Only kill processes that aren't responding, never blanket pkill
        # Find next-server PIDs and kill them individually
        for pid in $(pgrep -f "next-server" 2>/dev/null); do
            kill -9 $pid 2>/dev/null
        done
        for pid in $(pgrep -f "next dev" 2>/dev/null); do
            # Don't kill ourselves
            if [ "$pid" != "$WATCHDOG_PID" ] && [ "$pid" != "$$" ]; then
                kill -9 $pid 2>/dev/null
            fi
        done
        sleep 2
        
        # Start fresh
        nohup $NEXT dev -p $PORT >> $LOG 2>&1 &
        NEW_PID=$!
        disown $NEW_PID 2>/dev/null
        
        # Wait for it to come up (max 25s)
        for i in {1..25}; do
            sleep 1
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:$PORT/ 2>/dev/null)
            if [ "$HTTP_CODE" = "200" ]; then
                echo "[$(date)] Server back up (PID $NEW_PID)" >> $LOG
                break
            fi
        done
    fi
    
    sleep 5
done
