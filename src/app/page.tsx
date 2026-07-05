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

interface ChatMsg {
  role: string
  content: string
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
  const [activeWin, setActiveWin] = useState<string>('chat')

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const [windows, setWindows] = useState<WindowState[]>([
    { id: 'chat', title: '◈ Summon Z — AI Chat', x: 80, y: 60, w: 520, h: 480, z: 10, minimized: false },
    { id: 'terminal', title: 'Terminal — real bash', x: 630, y: 60, w: 620, h: 380, z: 5, minimized: false },
    { id: 'monitor', title: 'System Monitor', x: 630, y: 460, w: 360, h: 240, z: 3, minimized: false },
    { id: 'files', title: 'File Browser', x: 890, y: 460, w: 360, h: 240, z: 3, minimized: false },
  ])

  const outputRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)

  // Poll desktop state
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

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chatMessages, chatLoading])

  // Initial file listing
  useEffect(() => {
    async function init() {
      try {
        await fetch('/api/desktop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'ls -1 /home/z/my-project' }),
        })
      } catch {}
    }
    init()
  }, [])

  // Load chat history on mount
  useEffect(() => {
    async function loadChat() {
      try {
        const r = await fetch('/api/chat')
        const j = await r.json()
        if (j.messages) setChatMessages(j.messages)
      } catch {}
    }
    loadChat()
  }, [])

  // Parse output for file listings
  useEffect(() => {
    if (!output) return
    const lines = output.split('\n')
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

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }])
    setChatInput('')
    setChatLoading(true)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const j = await r.json()
      if (j.response) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: j.response }])
      } else if (j.error) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: `[error: ${j.error}]` }])
      }
    } catch (e: any) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `[network error: ${e.message}]` }])
    }
    setChatLoading(false)
  }

  const clearChat = async () => {
    await fetch('/api/chat', { method: 'DELETE' })
    setChatMessages([])
  }

  const focusWindow = (id: string) => {
    setWindows((prev) => {
      const maxZ = Math.max(...prev.map((w) => w.z))
      return prev.map((w) => w.id === id ? { ...w, z: maxZ + 1, minimized: false } : w)
    })
    setActiveWin(id)
  }

  const minimizeWindow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
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
      setWindows((prev) => prev.map((w) => w.id === id ? { ...w, x: Math.max(0, ev.clientX - startX), y: Math.max(0, ev.clientY - startY) } : w))
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
          boxShadow: activeWin === w.id ? '0 8px 32px rgba(0,255,136,0.18)' : '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: w.z,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseDown={() => focusWindow(w.id)}
      >
        <div
          style={{
            background: activeWin === w.id ? '#1a3a2a' : '#1a1a2a',
            padding: '6px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'move',
            borderBottom: '1px solid #2a2a3a',
            fontSize: '0.78rem',
            color: activeWin === w.id ? '#00ff88' : '#888',
            fontWeight: 'bold',
            userSelect: 'none',
          }}
          onMouseDown={(e) => startDrag(e, w.id)}
        >
          <span>{w.title}</span>
          <button
            onClick={(e) => minimizeWindow(w.id, e)}
            style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.9rem' }}
          >—</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>{content}</div>
      </div>
    )
  }

  const terminalContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={outputRef} style={{ flex: 1, background: '#000', padding: '8px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.78rem', lineHeight: '1.4', color: '#00ff88', fontFamily: 'monospace' }}>
        {output || (connected ? '' : 'Connecting to AI sandbox...')}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', padding: '6px', background: '#0a0a14', borderTop: '1px solid #1f1f2e', flexWrap: 'wrap' }}>
        {quickCmds.slice(0, 5).map((cmd) => (
          <button key={cmd} onClick={() => sendCmd(cmd)} style={{ background: '#1a1a2a', color: '#00ff88', border: '1px solid #2a2a3a', padding: '2px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>
            {cmd.length > 16 ? cmd.slice(0, 14) + '..' : cmd}
          </button>
        ))}
      </div>
      <form onSubmit={sendCommand} style={{ display: 'flex', gap: '0.4rem', padding: '6px', background: '#000', borderTop: '1px solid #1f1f2e' }}>
        <span style={{ color: '#00ff88', alignSelf: 'center', fontFamily: 'monospace', fontSize: '0.8rem' }}>$</span>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="bash command..."
          style={{ flex: 1, background: '#000', color: '#00ff88', border: '1px solid #1f1f2e', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none' }} />
        <button type="submit" style={{ background: '#00ff88', color: '#000', border: 'none', padding: '4px 12px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>RUN</button>
      </form>
    </div>
  )

  const chatContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a14' }}>
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666', fontSize: '0.8rem', marginTop: '40px', padding: '0 20px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px', color: '#00ff88' }}>◈</div>
            <div style={{ color: '#00ff88', fontWeight: 'bold', marginBottom: '8px' }}>Z is here.</div>
            <div>A real AI model lives behind this window.</div>
            <div style={{ marginTop: '4px' }}>Type anything. It&apos;s a real chat, not a script.</div>
          </div>
        )}
        {chatMessages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: m.role === 'user' ? '#1a3a2a' : '#1a1a2a',
            border: `1px solid ${m.role === 'user' ? '#2a5a3a' : '#2a2a3a'}`,
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#ddd',
            fontSize: '0.82rem',
            lineHeight: '1.45',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <div style={{ fontSize: '0.65rem', color: m.role === 'user' ? '#5a8a6a' : '#5a7a9a', marginBottom: '4px', fontWeight: 'bold' }}>
              {m.role === 'user' ? 'YOU' : '◈ Z'}
            </div>
            {m.content}
          </div>
        ))}
        {chatLoading && (
          <div style={{ alignSelf: 'flex-start', background: '#1a1a2a', border: '1px solid #2a2a3a', borderRadius: '8px', padding: '8px 12px', color: '#888', fontSize: '0.82rem' }}>
            <span style={{ animation: 'pulse 1s infinite' }}>◈ Z is thinking...</span>
          </div>
        )}
      </div>
      <form onSubmit={sendChat} style={{ display: 'flex', gap: '6px', padding: '8px', background: '#000', borderTop: '1px solid #1f1f2e' }}>
        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="summon Z..." disabled={chatLoading}
          style={{ flex: 1, background: '#0a0a14', color: '#ddd', border: '1px solid #2a2a3a', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.82rem', outline: 'none' }} />
        <button type="submit" disabled={chatLoading || !chatInput.trim()} style={{ background: chatLoading ? '#333' : '#00ff88', color: '#000', border: 'none', padding: '6px 14px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem', cursor: chatLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>SEND</button>
        <button type="button" onClick={clearChat} style={{ background: '#2a1a1a', color: '#ff6666', border: '1px solid #4a2a2a', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>CLEAR</button>
      </form>
    </div>
  )

  const monitorContent = (
    <div style={{ padding: '12px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#aaa', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: '8px', color: '#00ff88', fontWeight: 'bold', borderBottom: '1px solid #2a2a3a', paddingBottom: '4px' }}>AI VITALS</div>
      {state && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Heartbeat:</span><span style={{ color: '#ff4444' }}>♥ #{state.heartbeat}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Alive for:</span><span style={{ color: '#00ff88' }}>{state.elapsed.toFixed(1)}s</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Shell:</span><span style={{ color: state.shellAlive ? '#00ff88' : '#ff4444' }}>{state.shellAlive ? 'ALIVE' : 'DEAD'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Last beat:</span><span style={{ color: '#888' }}>{new Date(state.timestamp).toLocaleTimeString()}</span>
          </div>
          <div style={{ marginTop: '10px', color: '#00ff88', fontWeight: 'bold', borderBottom: '1px solid #2a2a3a', paddingBottom: '4px' }}>HEARTBEAT</div>
          <div style={{ marginTop: '6px', color: '#ff4444', fontSize: '1rem', lineHeight: '1.3', wordBreak: 'break-all' }}>
            {'♥ '.repeat(Math.min(state.heartbeat, 80))}
          </div>
        </>
      )}
    </div>
  )

  const filesContent = (
    <div style={{ padding: '12px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#aaa', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: '8px', color: '#00ff88', fontWeight: 'bold', borderBottom: '1px solid #2a2a3a', paddingBottom: '4px' }}>/home/z/my-project</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {files.length > 0 ? files.map((f) => (
          <div key={f} onClick={() => sendCmd(`ls -la ${f.startsWith('/') ? f : '/home/z/my-project/' + f}`)} style={{ padding: '3px 6px', background: '#0a0a14', borderRadius: '3px', cursor: 'pointer', border: '1px solid transparent' }}
            onMouseOver={(e) => { e.currentTarget.style.border = '1px solid #00ff88'; e.currentTarget.style.background = '#1a2a1a' }}
            onMouseOut={(e) => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = '#0a0a14' }}>
            <span style={{ color: '#ffaa00' }}>📁</span> <span style={{ color: '#ccc' }}>{f}</span>
          </div>
        )) : <div style={{ color: '#666' }}>Loading...</div>}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a14 0%, #0e0e1a 100%)', color: '#00ff88', fontFamily: 'monospace', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0a0a14', borderBottom: '1px solid #1f1f2e', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.78rem' }}>
        <span style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.9rem' }}>◈ ZAI-OS</span>
        <span style={{ color: '#888' }}>|</span>
        <span style={{ color: '#aaa' }}>the AI&apos;s computer</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {state && (
            <span style={{ color: '#ff4444', fontSize: '0.82rem' }}>♥ #{state.heartbeat} · {state.elapsed.toFixed(0)}s</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '2px 8px', background: connected ? '#0a2a1a' : '#2a0a0a', border: `1px solid ${connected ? '#00ff88' : '#ff4444'}`, borderRadius: '3px', fontSize: '0.68rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#00ff88' : '#ff4444', animation: 'pulse 1.5s infinite' }} />
            {connected ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '8px', top: '8px', display: 'flex', flexDirection: 'column', gap: '12px', opacity: 0.45 }}>
          {[
            { label: 'Summon Z', win: 'chat', icon: '◈' },
            { label: 'Terminal', win: 'terminal', icon: '⌨' },
            { label: 'Monitor', win: 'monitor', icon: '📊' },
            { label: 'Files', win: 'files', icon: '📁' },
          ].map((icon) => (
            <div key={icon.label} onClick={() => focusWindow(icon.win)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '8px', borderRadius: '4px', width: '60px' }}>
              <div style={{ fontSize: '1.6rem', color: icon.win === 'chat' ? '#00ff88' : '#888' }}>{icon.icon}</div>
              <div style={{ fontSize: '0.65rem', color: '#888' }}>{icon.label}</div>
            </div>
          ))}
        </div>

        {renderWindow(windows.find(w => w.id === 'chat')!, chatContent)}
        {renderWindow(windows.find(w => w.id === 'terminal')!, terminalContent)}
        {renderWindow(windows.find(w => w.id === 'monitor')!, monitorContent)}
        {renderWindow(windows.find(w => w.id === 'files')!, filesContent)}
      </div>

      <div style={{ background: '#0a0a14', borderTop: '1px solid #1f1f2e', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
        <span style={{ color: '#00ff88', fontWeight: 'bold' }}>◈</span>
        {windows.map((w) => (
          <button key={w.id} onClick={() => focusWindow(w.id)} style={{
            background: activeWin === w.id && !w.minimized ? '#1a3a2a' : '#1a1a2a',
            color: activeWin === w.id && !w.minimized ? '#00ff88' : '#888',
            border: `1px solid ${activeWin === w.id && !w.minimized ? '#00ff88' : '#2a2a3a'}`,
            padding: '3px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.68rem', cursor: 'pointer',
          }}>
            {w.minimized ? `▸ ${w.title}` : w.title}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', color: '#666', fontSize: '0.68rem' }}>
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
