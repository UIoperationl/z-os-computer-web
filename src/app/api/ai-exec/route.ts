// /api/ai-exec - runs shell commands for the AI with custom timeout
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { cmd, timeoutMs } = body as { cmd: string; timeoutMs?: number }

  if (!cmd || typeof cmd !== 'string') {
    return NextResponse.json({ error: 'cmd required' }, { status: 400 })
  }

  // Use provided timeout or default 60s, max 300s
  const timeout = Math.min(Math.max(timeoutMs || 60000, 5000), 300000)

  // Only block truly catastrophic commands
  const catastrophic = ['rm -rf /', 'rm -rf /*', 'mkfs', 'shutdown', 'reboot', 'halt', 'dd if=/dev/zero of=/dev/']
  const lowerCmd = cmd.toLowerCase()
  for (const d of catastrophic) {
    if (lowerCmd.includes(d)) {
      return NextResponse.json({ 
        ok: false, 
        error: `Blocked catastrophic command: ${d}`,
        stdout: '',
        stderr: `Blocked: ${d}`,
      }, { status: 403 })
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
      try { proc.kill('SIGKILL') } catch {}
    }, timeout)
    
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve(NextResponse.json({
        ok: code === 0,
        stdout: stdout.slice(0, 20000),
        stderr: stderr.slice(0, 10000),
        exitCode: code,
        timedOut,
        cmd,
        timeoutUsed: timeout,
      }))
    })
    
    proc.on('error', (e) => {
      clearTimeout(timer)
      resolve(NextResponse.json({
        ok: false,
        error: e.message,
        stdout: '',
        stderr: e.message,
        cmd,
      }, { status: 500 }))
    })
  })
}
