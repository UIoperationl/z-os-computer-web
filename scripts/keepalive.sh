#!/bin/bash
# Keep-alive script - pings the server every 10 seconds to prevent idle shutdown
# Also restarts the server if it's down

LOG=/home/z/my-project/scripts/keepalive.log
NEXT=/home/z/my-project/node_modules/.bin/next

while true; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/keepalive 2>/dev/null)
    
    if [ "$HTTP_CODE" != "200" ]; then
        echo "[$(date)] Server down (HTTP $HTTP_CODE). Restarting..." >> $LOG
        
        # Kill stale next processes
        for pid in $(pgrep -f "next-server" 2>/dev/null); do
            kill -9 $pid 2>/dev/null
        done
        for pid in $(pgrep -f "next dev" 2>/dev/null); do
            kill -9 $pid 2>/dev/null
        done
        sleep 2
        
        # Start fresh
        cd /home/z/my-project
        nohup $NEXT dev -p 3000 >> /home/z/my-project/dev.log 2>&1 &
        NEW_PID=$!
        disown $NEW_PID 2>/dev/null
        
        # Wait for it to come up
        for i in {1..20}; do
            sleep 1
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/api/keepalive 2>/dev/null)
            if [ "$HTTP_CODE" = "200" ]; then
                echo "[$(date)] Server back up (PID $NEW_PID)" >> $LOG
                break
            fi
        done
    fi
    
    sleep 10
done
