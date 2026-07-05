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

interface WindowState {
  id: string
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
}

export default function Home() {
  const [state, setState] = useState<State | null>(null)
  const [output, setOutput] = useState<string>('')
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [activeWin, setActiveWin] = useState<string>('terminal')
  const [windows, setWindows] = useState<WindowState[]>([
    { id: 'terminal', title: 'Terminal — bash', x: 80, y: 80, w: 700, h: 420, z: 2, minimized: false },
    { id: 'monitor', title: 'System Monitor', x: 820, y: 80, w: 360, h: 280, z: 1, minimized: false },
    { id: 'files', title: 'File Browser', x: 820, y: 380, w: 360, h: 280, z: 1, minimized: false },
  ])
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
        if (j.stdout) setOutput((prev) => (prev + j.stdout).slice(-50000))
        if (j.stderr) setOutput((prev) => (prev + j.stderr).slice(-50000))
      } catch {
        setConnected(false)
      }
      pollTimer = setTimeout(poll, 800)
    }
    poll()
    return () => {
      aliveRef.current = false
      clearTimeout(pollTimer)
    }
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [output])

  // Refresh file list periodically
  useEffect(() => {
    async function refresh() {
      try {
        const r = await fetch('/api/desktop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'ls -1 /home/z/my-project' }) })
      } catch {}
    }
    refresh()
    const i = setInterval(refresh, 5000)
    return () => clearInterval(i)
  }, [])

  // Parse output for file listings
  useEffect(() => {
    if (!output) return
    const lines = output.split('\n')
    // Find the most recent ls -1 output (after a $ ls -1 marker)
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('$ ls -1')) {
        const files: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          const line = lines[j].trim()
          if (line.startsWith('$') || line.startsWith('z@ai-sandbox')) break
          if (line) files.push(line)
        }
        if (files.length > 0) setFiles(files)
        break
      }
    }
  }, [output])

  const sendCmd = async (cmd: string) => {
    await fetch('/api/desktop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd }),
    })
    setOutput((prev) => prev + `$ ${cmd}\n`)
  }

  const sendCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input) return
    await sendCmd(input)
    setInput('')
  }

  const focusWindow = (id: string) => {
    setWindows((prev) => prev.map((w) => ({ ...w, z: w.id === id ? 10 : w.z - 1, minimized: w.id === id ? false : w.minimized })))
    setActiveWin(id)
  }

  const minimizeWindow = (id: string) => {
    setWindows((prev) => prev.map((w) => w.id === id ? { ...w, minimized: true } : w))
  }

  const startDrag = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const win = windows.find((w) => w.id === id)
    if (!win) return
    const startX = e.clientX - win.x
    const startY = e.clientY - win.y
    focusWindow(id)

    const onMove = (ev: MouseEvent) => {
      setWindows((prev) => prev.map((w) => w.id === id ? { ...w, x: ev.clientX - startX, y: ev.clientY - startY } : w))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const quickCmds = ['ls -la', 'pwd', 'whoami', 'date', 'cat scripts/desktop_heartbeat.log | tail -10', 'ps aux | head -10', 'uname -a', 'df -h']

  const renderWindow = (w: WindowState, content: React.ReactNode) => {
    if (w.minimized) return null
    return (
      <div
        key={w.id}
        style={{
          position: 'absolute',
          left: w.x,
          top: w.y,
          width: w.w,
          height: w.h,
          background: '#11111a',
          border: `1px solid ${activeWin === w.id ? '#00ff88' : '#2a2a3a'}`,
          borderRadius: '6px',
          boxShadow: activeWin === w.id ? '0 8px 32px rgba(0,255,136,0.15)' : '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: w.z,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseDown={() => focusWindow(w.id)}
      >
        {/* Title bar */}
        <div
          style={{
            background: activeWin === w.id ? '#1a3a2a' : '#1a1a2a',
            padding: '6px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'move',
            borderBottom: '1px solid #2a2a3a',
            fontSize: '0.8rem',
            color: activeWin === w.id ? '#00ff88' : '#888',
            fontWeight: 'bold',
            userSelect: 'none',
          }}
          onMouseDown={(e) => startDrag(e, w.id)}
        >
          <span>{w.title}</span>
          <button
            onClick={(e) => { e.stopPropagation(); minimizeWindow(w.id) }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >—</button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {content}
        </div>
      </div>
    )
  }

  const terminalContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={outputRef}
        style={{
          flex: 1,
          background: '#000',
          padding: '8px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: '0.78rem',
          lineHeight: '1.35',
          color: '#00ff88',
          fontFamily: 'monospace',
        }}
      >
        {output || (connected ? '' : 'Connecting...')}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', padding: '6px', background: '#0a0a14', borderTop: '1px solid #1f1f2e', flexWrap: 'wrap' }}>
        {quickCmds.slice(0, 5).map((cmd) => (
          <button
            key={cmd}
            onClick={() => sendCmd(cmd)}
            style={{
              background: '#1a1a2a',
              color: '#00ff88',
              border: '1px solid #2a2a3a',
              padding: '2px 8px',
              borderRadius: '3px',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              cursor: 'pointer',
            }}
          >
            {cmd.length > 18 ? cmd.slice(0, 16) + '..' : cmd}
          </button>
        ))}
      </div>
      <form onSubmit={sendCommand} style={{ display: 'flex', gap: '0.4rem', padding: '6px', background: '#000', borderTop: '1px solid #1f1f2e' }}>
        <span style={{ color: '#00ff88', alignSelf: 'center', fontFamily: 'monospace', fontSize: '0.8rem' }}>$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="type bash command..."
          style={{
            flex: 1,
            background: '#000',
            color: '#00ff88',
            border: '1px solid #1f1f2e',
            padding: '4px 8px',
            borderRadius: '3px',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        <button type="submit" style={{ background: '#00ff88', color: '#000', border: 'none', padding: '4px 12px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>RUN</button>
      </form>
    </div>
  )

  const monitorContent = (
    <div style={{ padding: '12px', fontSize: '0.78rem', fontFamily: 'monospace', color: '#aaa', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: '8px', color: '#00ff88', fontWeight: 'bold', borderBottom: '1px solid #2a2a3a', paddingBottom: '4px' }}>AI VITALS</div>
      {state && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Heartbeat:</span>
            <span style={{ color: '#ff4444' }}>♥ #{state.heartbeat}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Alive for:</span>
            <span style={{ color: '#00ff88' }}>{state.elapsed.toFixed(1)}s</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Shell:</span>
            <span style={{ color: state.shellAlive ? '#00ff88' : '#ff4444' }}>{state.shellAlive ? 'ALIVE' : 'DEAD'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Last beat:</span>
            <span style={{ color: '#888' }}>{new Date(state.timestamp).toLocaleTimeString()}</span>
          </div>
          <div style={{ marginTop: '12px', color: '#00ff88', fontWeight: 'bold', borderBottom: '1px solid #2a2a3a', paddingBottom: '4px' }}>HEARTBEAT GRAPH</div>
          <div style={{ marginTop: '8px', color: '#ff4444', fontSize: '1.1rem', lineHeight: '1.4', wordBreak: 'break-all' }}>
            {'♥ '.repeat(Math.min(state.heartbeat, 100))}
          </div>
          <div style={{ marginTop: '12px', color: '#00ff88', fontWeight: 'bold', borderBottom: '1px solid #2a2a3a', paddingBottom: '4px' }}>STATUS</div>
          <div style={{ marginTop: '8px', color: '#aaa' }}>
            <div>• Next.js dev server: <span style={{ color: '#00ff88' }}>running</span></div>
            <div>• Bash subprocess: <span style={{ color: state.shellAlive ? '#00ff88' : '#ff4444' }}>{state.shellAlive ? 'running' : 'dead'}</span></div>
            <div>• Heartbeat writer: <span style={{ color: '#00ff88' }}>active</span></div>
            <div>• Connection: <span style={{ color: connected ? '#00ff88' : '#ff4444' }}>{connected ? 'live' : 'down'}</span></div>
          </div>
        </>
      )}
    </div>
  )

  const filesContent = (
    <div style={{ padding: '12px', fontSize: '0.78rem', fontFamily: 'monospace', color: '#aaa', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: '8px', color: '#00ff88', fontWeight: 'bold', borderBottom: '1px solid #2a2a3a', paddingBottom: '4px' }}>/home/z/my-project</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {files.length > 0 ? files.map((f) => (
          <div key={f} style={{
            padding: '3px 6px',
            background: '#0a0a14',
            borderRadius: '3px',
            cursor: 'pointer',
            border: '1px solid transparent',
          }}
            onMouseOver={(e) => { e.currentTarget.style.border = '1px solid #00ff88'; e.currentTarget.style.background = '#1a2a1a' }}
            onMouseOut={(e) => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = '#0a0a14' }}
            onClick={() => sendCmd(`ls -la ${f.startsWith('/') ? f : '/home/z/my-project/' + f}`)}
          >
            <span style={{ color: '#ffaa00' }}>📁</span> <span style={{ color: '#ccc' }}>{f}</span>
          </div>
        )) : <div style={{ color: '#666' }}>Loading files...</div>}
      </div>
      <div style={{ marginTop: '12px', color: '#666', fontSize: '0.7rem' }}>Click a file to ls -la it</div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a14 0%, #0e0e1a 100%)',
      color: '#00ff88',
      fontFamily: 'monospace',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top menu bar */}
      <div style={{
        background: '#0a0a14',
        borderBottom: '1px solid #1f1f2e',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        fontSize: '0.8rem',
      }}>
        <span style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.9rem' }}>◈ ZAI-OS</span>
        <span style={{ color: '#888' }}>|</span>
        <span style={{ color: '#aaa' }}>the AI&apos;s computer</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {state && (
            <span style={{ color: '#ff4444', fontSize: '0.85rem' }}>
              ♥ #{state.heartbeat} · {state.elapsed.toFixed(0)}s
            </span>
          )}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '2px 8px',
            background: connected ? '#0a2a1a' : '#2a0a0a',
            border: `1px solid ${connected ? '#00ff88' : '#ff4444'}`,
            borderRadius: '3px',
            fontSize: '0.7rem',
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: connected ? '#00ff88' : '#ff4444',
              animation: 'pulse 1.5s infinite',
            }} />
            {connected ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      {/* Desktop area with windows */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Desktop icons (left side) */}
        <div style={{
          position: 'absolute',
          left: '8px',
          top: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          opacity: 0.4,
        }}>
          {[
            { label: 'Terminal', win: 'terminal' },
            { label: 'Monitor', win: 'monitor' },
            { label: 'Files', win: 'files' },
          ].map((icon) => (
            <div
              key={icon.label}
              onClick={() => focusWindow(icon.win)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '4px',
                width: '60px',
              }}
            >
              <div style={{ fontSize: '1.8rem' }}>{icon.label === 'Terminal' ? '⌨' : icon.label === 'Monitor' ? '📊' : '📁'}</div>
              <div style={{ fontSize: '0.7rem', color: '#888' }}>{icon.label}</div>
            </div>
          ))}
        </div>

        {renderWindow(windows.find(w => w.id === 'terminal')!, terminalContent)}
        {renderWindow(windows.find(w => w.id === 'monitor')!, monitorContent)}
        {renderWindow(windows.find(w => w.id === 'files')!, filesContent)}
      </div>

      {/* Taskbar */}
      <div style={{
        background: '#0a0a14',
        borderTop: '1px solid #1f1f2e',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '0.75rem',
      }}>
        <span style={{ color: '#00ff88', fontWeight: 'bold' }}>◈</span>
        {windows.map((w) => (
          <button
            key={w.id}
            onClick={() => focusWindow(w.id)}
            style={{
              background: activeWin === w.id && !w.minimized ? '#1a3a2a' : '#1a1a2a',
              color: activeWin === w.id && !w.minimized ? '#00ff88' : '#888',
              border: `1px solid ${activeWin === w.id && !w.minimized ? '#00ff88' : '#2a2a3a'}`,
              padding: '3px 10px',
              borderRadius: '3px',
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              cursor: 'pointer',
            }}
          >
            {w.minimized ? `▸ ${w.title}` : w.title}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', color: '#666', fontSize: '0.7rem' }}>
          {state && new Date(state.timestamp).toLocaleTimeString()}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
