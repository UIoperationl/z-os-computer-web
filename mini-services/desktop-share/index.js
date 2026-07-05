// WebSocket shell server - exposes bash to browser
// Plus heartbeat that broadcasts "alive" signal every 2 seconds
const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");

const PORT = 3001;
const HEARTBEAT_FILE = "/home/z/my-project/scripts/desktop_heartbeat.log";

const wss = new WebSocket.Server({ port: PORT });
console.log(`Desktop share WS server on port ${PORT}`);

// Write heartbeat every 2 seconds
let beatCount = 0;
const startedAt = Date.now();
setInterval(() => {
  beatCount++;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const line = `[${elapsed}s] heartbeat #${beatCount} — AI still alive`;
  fs.writeFileSync(HEARTBEAT_FILE, line + "\n", { flag: "a" });
  // Broadcast heartbeat to all clients
  const msg = JSON.stringify({
    type: "heartbeat",
    beat: beatCount,
    elapsed: parseFloat(elapsed),
    timestamp: new Date().toISOString(),
  });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
  // Trim heartbeat file to last 100 lines
  try {
    const lines = fs.readFileSync(HEARTBEAT_FILE, "utf8").split("\n");
    if (lines.length > 100) {
      fs.writeFileSync(HEARTBEAT_FILE, lines.slice(-100).join("\n"));
    }
  } catch {}
}, 2000);

wss.on("connection", (ws) => {
  console.log("Client connected");

  // Spawn a bash shell for this client
  const shell = spawn("bash", ["--noprofile", "--norc", "-i"], {
    env: {
      ...process.env,
      TERM: "xterm-256color",
      PS1: "z@ai-sandbox:\\w$ ",
    },
    cwd: "/home/z/my-project",
  });

  // Send shell output back to client
  shell.stdout.on("data", (data) => {
    ws.send(
      JSON.stringify({ type: "stdout", data: data.toString("utf8") })
    );
  });
  shell.stderr.on("data", (data) => {
    ws.send(
      JSON.stringify({ type: "stderr", data: data.toString("utf8") })
    );
  });
  shell.on("exit", (code) => {
    ws.send(JSON.stringify({ type: "exit", code }));
    ws.close();
  });

  // Receive commands from client
  ws.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === "stdin") {
        shell.stdin.write(parsed.data);
      } else if (parsed.type === "resize") {
        // Try to set terminal size
        try {
          shell.stdout.emit("resize", parsed.cols, parsed.rows);
        } catch {}
      }
    } catch (e) {
      console.error("Parse error:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    try {
      shell.kill("SIGKILL");
    } catch {}
  });

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: "stdout",
      data:
        "\n╔══════════════════════════════════════════════════════════╗\n" +
        "║  ZAI SANDBOX — REMOTE DESKTOP (terminal mode)            ║\n" +
        "║  You are now using the AI's computer.                    ║\n" +
        "║  Bash commands run in real time on the sandbox.          ║\n" +
        "║  Heartbeat pulses every 2s proving the AI is alive.      ║\n" +
        "╚══════════════════════════════════════════════════════════╝\n\n" +
        "Try: ls, pwd, whoami, date, cat scripts/desktop_heartbeat.log\n" +
        "Type 'exit' to close your session.\n\n",
    })
  );
});
