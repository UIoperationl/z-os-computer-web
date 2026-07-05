// /api/ai-exec - runs shell commands for the AI
// Uses async spawn with timeout (NOT execSync which blocked event loop and crashed Next.js)
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { cmd, timeoutMs = 8000 } = body as { cmd: string; timeoutMs?: number }

  if (!cmd || typeof cmd !== 'string') {
    return NextResponse.json({ error: 'cmd required' }, { status: 400 })
  }

  // Block obviously dangerous commands
  const dangerous = ['rm -rf /', 'mkfs', 'shutdown', 'reboot', ':(){:|:&};:']
  const lowerCmd = cmd.toLowerCase()
  for (const d of dangerous) {
    if (lowerCmd.includes(d)) {
      return NextResponse.json({ error: `blocked: ${d}` }, { status: 403 })
    }
  }

  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', cmd], {
      cwd: '/home/z/my-project',
      env: { ...process.env, TERM: 'dumb' },
    })
    
    let stdout = ''
    let stderr = ''
    let timedOut = false
    
    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGKILL')
    }, timeoutMs)
    
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve(NextResponse.json({
        ok: true,
        stdout: stdout.slice(0, 10000), // cap output
        stderr: stderr.slice(0, 5000),
        exitCode: code,
        timedOut,
      }))
    })
    
    proc.on('error', (e) => {
      clearTimeout(timer)
      resolve(NextResponse.json({
        ok: false,
        error: e.message,
      }, { status: 500 }))
    })
  })
}
