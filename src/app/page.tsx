'use client'

import { useEffect, useRef, useState } from 'react'

interface State {
  heartbeat: number
  elapsed: number
  timestamp: string
  shellAlive: boolean
  stdout: string
  stderr: string
}

export default function Home() {
  const [state, setState] = useState<State | null>(null)
  const [output, setOutput] = useState<string>('')
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    let pollTimer: ReturnType<typeof setTimeout>

    async function poll() {
      if (!aliveRef.current) return
      try {
        const r = await fetch('/api/desktop')
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j: State = await r.json()
        setState(j)
        setConnected(true)
        if (j.stdout) {
          setOutput((prev) => (prev + j.stdout).slice(-50000))
        }
        if (j.stderr) {
          setOutput((prev) => (prev + j.stderr).slice(-50000))
        }
      } catch (e) {
        setConnected(false)
      }
      pollTimer = setTimeout(poll, 1000)
    }

    poll()
    return () => {
      aliveRef.current = false
      clearTimeout(pollTimer)
    }
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const sendCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input) return
    await fetch('/api/desktop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: input }),
    })
    setOutput((prev) => prev + `$ ${input}\n`)
    setInput('')
  }

  const quickCmds = [
    'ls -la',
    'pwd',
    'whoami',
    'date',
    'cat /home/z/my-project/scripts/desktop_heartbeat.log | tail -20',
    'ps aux | head -10',
    'uname -a',
  ]

  const sendQuick = async (cmd: string) => {
    await fetch('/api/desktop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd }),
    })
    setOutput((prev) => prev + `$ ${cmd}\n`)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#00ff88',
      fontFamily: 'monospace',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      <div style={{
        border: '1px solid #1f1f2e',
        background: '#11111a',
        padding: '1rem 1.5rem',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>
            ZAI SANDBOX — REMOTE DESKTOP
          </div>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>
            You are using the AI&apos;s computer. Be nice to it.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.8rem',
            background: connected ? '#0a2a1a' : '#2a0a0a',
            border: `1px solid ${connected ? '#00ff88' : '#ff4444'}`,
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connected ? '#00ff88' : '#ff4444',
              boxShadow: connected ? '0 0 8px #00ff88' : '0 0 8px #ff4444',
              animation: 'pulse 1.5s infinite',
            }} />
            {connected ? 'CONNECTED' : 'CONNECTING...'}
          </div>
          {state && (
            <div style={{
              padding: '0.4rem 0.8rem',
              background: '#1a1a0a',
              border: '1px solid #ffaa00',
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#ffaa00',
            }}>
              ♥ #{state.heartbeat} · {state.elapsed.toFixed(1)}s alive
            </div>
          )}
        </div>
      </div>

      {state && (
        <div style={{
          border: '1px solid #1f1f2e',
          background: '#11111a',
          padding: '0.75rem 1.5rem',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.85rem',
        }}>
          <span style={{ color: '#888' }}>AI HEARTBEAT:</span>
          <span style={{ color: '#ff4444', fontSize: '1.2rem' }}>
            {'♥'.repeat(Math.min(state.heartbeat % 30, 30))}
          </span>
          <span style={{ color: '#888', marginLeft: 'auto' }}>
            {new Date(state.timestamp).toLocaleTimeString()} · shell {state.shellAlive ? 'ALIVE' : 'DEAD'}
          </span>
        </div>
      )}

      <div
        ref={outputRef}
        style={{
          flex: 1,
          minHeight: '400px',
          background: '#000',
          border: '1px solid #1f1f2e',
          borderRadius: '8px',
          padding: '1rem',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: '0.9rem',
          lineHeight: '1.4',
        }}
      >
        {output || (connected ? '' : 'Connecting to AI sandbox...')}
      </div>

      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
      }}>
        {quickCmds.map((cmd) => (
          <button
            key={cmd}
            onClick={() => sendQuick(cmd)}
            style={{
              background: '#1a1a2a',
              color: '#00ff88',
              border: '1px solid #2a2a3a',
              padding: '0.4rem 0.8rem',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {cmd}
          </button>
        ))}
      </div>

      <form onSubmit={sendCommand} style={{
        display: 'flex',
        gap: '0.5rem',
      }}>
        <span style={{ color: '#00ff88', alignSelf: 'center' }}>$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="type a bash command and press enter"
          style={{
            flex: 1,
            background: '#000',
            color: '#00ff88',
            border: '1px solid #1f1f2e',
            padding: '0.6rem',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            background: '#00ff88',
            color: '#000',
            border: 'none',
            padding: '0.6rem 1.5rem',
            borderRadius: '4px',
            fontFamily: 'monospace',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          RUN
        </button>
      </form>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
