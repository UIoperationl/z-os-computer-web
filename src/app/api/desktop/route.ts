// /api/desktop - polling-based remote shell API
// State persists as long as Next.js dev server is alive
import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'

const HEARTBEAT_FILE = '/home/z/my-project/scripts/desktop_heartbeat.log'

// Module-level state — survives across requests in same process
const STATE = {
  shell: null as ChildProcess | null,
  stdoutBuffer: '',
  stderrBuffer: '',
  heartbeatCount: 0,
  startTime: Date.now(),
  initialized: false,
}

function ensureInit() {
  if (STATE.initialized) return
  STATE.initialized = true

  // Clear heartbeat file
  try { fs.writeFileSync(HEARTBEAT_FILE, '') } catch {}

  // Spawn bash shell
  const shell = spawn('bash', ['--noprofile', '--norc', '-i'], {
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      PS1: 'z@ai-sandbox:\\w$ ',
    },
    cwd: '/home/z/my-project',
  })
  STATE.shell = shell

  shell.stdout.on('data', (data) => {
    STATE.stdoutBuffer += data.toString('utf8')
    if (STATE.stdoutBuffer.length > 100000) {
      STATE.stdoutBuffer = STATE.stdoutBuffer.slice(-50000)
    }
  })
  shell.stderr.on('data', (data) => {
    STATE.stderrBuffer += data.toString('utf8')
    if (STATE.stderrBuffer.length > 50000) {
      STATE.stderrBuffer = STATE.stderrBuffer.slice(-25000)
    }
  })
  shell.on('exit', (code) => {
    STATE.stdoutBuffer += `\n[shell exited with code ${code}]\n`
    STATE.shell = null
  })

  STATE.stdoutBuffer =
    '╔══════════════════════════════════════════════════════════╗\n' +
    '║  ZAI SANDBOX — REMOTE DESKTOP (terminal mode)            ║\n' +
    '║  You are using the AI\'s computer.                       ║\n' +
    '║  Bash commands run in real time on the sandbox.          ║\n' +
    '║  Heartbeat pulses every 2s proving the AI is alive.      ║\n' +
    '╚══════════════════════════════════════════════════════════╝\n\n' +
    'Try: ls, pwd, whoami, date, cat scripts/desktop_heartbeat.log\n' +
    'Type "exit" to close your session.\n\n'

  setInterval(() => {
    STATE.heartbeatCount++
    const elapsed = (Date.now() - STATE.startTime) / 1000
    const line = `[${elapsed.toFixed(1)}s] heartbeat #${STATE.heartbeatCount} — AI still alive\n`
    fs.appendFile(HEARTBEAT_FILE, line, () => {})
    if (STATE.heartbeatCount % 50 === 0) {
      try {
        const lines = fs.readFileSync(HEARTBEAT_FILE, 'utf8').split('\n')
        if (lines.length > 100) {
          fs.writeFileSync(HEARTBEAT_FILE, lines.slice(-100).join('\n'))
        }
      } catch {}
    }
  }, 2000)
}

export async function GET() {
  ensureInit()
  const elapsed = (Date.now() - STATE.startTime) / 1000
  const stdout = STATE.stdoutBuffer
  const stderr = STATE.stderrBuffer
  STATE.stdoutBuffer = ''
  STATE.stderrBuffer = ''

  return NextResponse.json({
    heartbeat: STATE.heartbeatCount,
    elapsed: parseFloat(elapsed.toFixed(1)),
    timestamp: new Date().toISOString(),
    shellAlive: STATE.shell !== null,
    stdout,
    stderr,
  })
}

export async function POST(req: NextRequest) {
  ensureInit()
  const body = await req.json()
  const { cmd } = body as { cmd: string }

  if (!STATE.shell || STATE.shell.stdin.destroyed) {
    return NextResponse.json({ error: 'shell not alive' }, { status: 500 })
  }

  STATE.shell.stdin.write(cmd + '\n')
  return NextResponse.json({ ok: true, sent: cmd })
}
