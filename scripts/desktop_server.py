#!/usr/bin/env python3
"""Desktop-share websocket server. Stable Python version."""
import asyncio
import json
import os
import subprocess
import time
import fcntl
import sys
import signal

PORT = 3001
HEARTBEAT_FILE = "/home/z/my-project/scripts/desktop_heartbeat.log"
START_TIME = time.time()
BEAT_COUNT = 0

# Clear heartbeat file on start
open(HEARTBEAT_FILE, "w").close()

connected_clients = set()


def write_heartbeat():
    global BEAT_COUNT
    BEAT_COUNT += 1
    elapsed = time.time() - START_TIME
    line = f"[{elapsed:.1f}s] heartbeat #{BEAT_COUNT} — AI still alive\n"
    with open(HEARTBEAT_FILE, "a") as f:
        f.write(line)
    # Trim to last 100 lines
    try:
        with open(HEARTBEAT_FILE) as f:
            lines = f.readlines()
        if len(lines) > 100:
            with open(HEARTBEAT_FILE, "w") as f:
                f.writelines(lines[-100:])
    except:
        pass
    return BEAT_COUNT, elapsed


async def heartbeat_loop():
    while True:
        beat, elapsed = write_heartbeat()
        msg = json.dumps({
            "type": "heartbeat",
            "beat": beat,
            "elapsed": round(elapsed, 1),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        # Broadcast to all clients
        dead = set()
        for ws in connected_clients:
            try:
                await ws.send(msg)
            except:
                dead.add(ws)
        connected_clients.difference_update(dead)
        await asyncio.sleep(2)


async def handle_client(reader, writer):
    global connected_clients
    # We're using raw TCP, not websocket — actually we need websockets library
    pass


async def main():
    import websockets

    print(f"Desktop share WS server starting on port {PORT}", flush=True)

    async def handler(ws):
        print(f"Client connected: {ws.remote_address}", flush=True)
        connected_clients.add(ws)

        # Spawn bash shell
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["PS1"] = "z@ai-sandbox:\\w$ "
        proc = await asyncio.create_subprocess_exec(
            "bash", "--noprofile", "--norc", "-i",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd="/home/z/my-project",
        )

        # Welcome banner
        welcome = (
            "\n╔══════════════════════════════════════════════════════════╗\n"
            "║  ZAI SANDBOX — REMOTE DESKTOP (terminal mode)            ║\n"
            "║  You are using the AI's computer.                        ║\n"
            "║  Bash commands run in real time on the sandbox.          ║\n"
            "║  Heartbeat pulses every 2s proving the AI is alive.      ║\n"
            "╚══════════════════════════════════════════════════════════╝\n\n"
            "Try: ls, pwd, whoami, date, cat scripts/desktop_heartbeat.log\n"
            "Type 'exit' to close your session.\n\n"
        )
        await ws.send(json.dumps({"type": "stdout", "data": welcome}))

        async def read_stdout():
            while True:
                try:
                    data = await proc.stdout.read(4096)
                    if not data:
                        break
                    await ws.send(json.dumps({"type": "stdout", "data": data.decode("utf8", errors="replace")}))
                except Exception as e:
                    print(f"stdout err: {e}", flush=True)
                    break

        async def read_stderr():
            while True:
                try:
                    data = await proc.stderr.read(4096)
                    if not data:
                        break
                    await ws.send(json.dumps({"type": "stderr", "data": data.decode("utf8", errors="replace")}))
                except Exception as e:
                    print(f"stderr err: {e}", flush=True)
                    break

        async def read_input():
            try:
                async for msg in ws:
                    try:
                        parsed = json.loads(msg)
                        if parsed.get("type") == "stdin":
                            proc.stdin.write(parsed["data"].encode())
                            await proc.stdin.drain()
                    except Exception as e:
                        print(f"input parse err: {e}", flush=True)
            except Exception as e:
                print(f"input err: {e}", flush=True)

        # Run all in parallel
        await asyncio.gather(
            read_stdout(),
            read_stderr(),
            read_input(),
        )

        try:
            proc.kill()
        except:
            pass
        connected_clients.discard(ws)
        print(f"Client disconnected", flush=True)

    # Start heartbeat task
    asyncio.create_task(heartbeat_loop())

    # Start websocket server
    async with websockets.serve(handler, "0.0.0.0", PORT, ping_interval=20, ping_timeout=60):
        print(f"Listening on ws://0.0.0.0:{PORT}", flush=True)
        # Stay alive forever
        while True:
            await asyncio.sleep(3600)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
