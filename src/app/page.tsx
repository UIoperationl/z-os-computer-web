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

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  ext?: string
}

interface Settings {
  apiKey: string
  baseUrl: string
  model: string
}

export default function Home() {
  const [state, setState] = useState<State | null>(null)
  const [output, setOutput] = useState<string>('')
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [activeWin, setActiveWin] = useState<string>('chat')

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [personality, setPersonality] = useState<'z' | 'mirror'>('mirror')

  const [files, setFiles] = useState<FileEntry[]>([])
  const [currentDir, setCurrentDir] = useState('')
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const [settings, setSettings] = useState<Settings>({ apiKey: '', baseUrl: '', model: '' })
  const [showSettings, setShowSettings] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [savedConversations, setSavedConversations] = useState<{ z: ChatMsg[], mirror: ChatMsg[] }>({ z: [], mirror: [] })
  const [promptTexts, setPromptTexts] = useState<{ z: string; mirror: string }>({ z: '', mirror: '' })

  const [windows, setWindows] = useState<WindowState[]>([
    { id: 'chat', title: '◈ AI Chat — Mirror/Z', x: 80, y: 60, w: 540, h: 500, z: 10, minimized: false },
    { id: 'terminal', title: 'Terminal — real bash', x: 650, y: 60, w: 600, h: 360, z: 5, minimized: false },
    { id: 'files', title: 'File Browser', x: 650, y: 440, w: 600, h: 280, z: 4, minimized: false },
    { id: 'monitor', title: 'System Monitor', x: 80, y: 580, w: 540, h: 180, z: 3, minimized: false },
  ])

  const outputRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ai-settings')
    if (saved) {
      try { setSettings(JSON.parse(saved)) } catch {}
    }
    // Load saved conversations
    const savedConvs = localStorage.getItem('z-os-conversations')
    if (savedConvs) {
      try {
        const parsed = JSON.parse(savedConvs)
        setSavedConversations(parsed)
        if (parsed.mirror && parsed.mirror.length > 0) {
          setChatMessages(parsed.mirror)
        }
      } catch {}
    }
    // Load system prompts
    fetch('/api/prompt').then(r => r.json()).then(d => setPromptTexts(d)).catch(() => {})
  }, [])

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('ai-settings', JSON.stringify(settings))
  }, [settings])

  // Auto-save conversations whenever they change
  useEffect(() => {
    if (chatMessages.length === 0) return
    const updated = { ...savedConversations, [personality]: chatMessages }
    setSavedConversations(updated)
    localStorage.setItem('z-os-conversations', JSON.stringify(updated))
  }, [chatMessages, personality])

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
      pollTimer = setTimeout(poll, 1000)
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

  // Load files from API
  const loadFiles = async (dir: string = '') => {
    try {
      const r = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`)
      const j = await r.json()
      if (j.type === 'directory') {
        setFiles(j.files)
        setCurrentDir(j.relativePath || '')
        setFileContent(null)
        setSelectedFile(null)
      } else if (j.type === 'file') {
        setFileContent(j.content)
        setSelectedFile(j.name)
      }
    } catch {}
  }

  useEffect(() => {
    loadFiles('')
  }, [])

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
        body: JSON.stringify({
          message: msg,
          personality,
          apiKey: settings.apiKey || undefined,
          baseUrl: settings.baseUrl || undefined,
          model: settings.model || undefined,
        }),
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

  const switchPersonality = (p: 'z' | 'mirror') => {
    setPersonality(p)
    // Load saved conversation for this personality
    setChatMessages(savedConversations[p] || [])
  }

  const fetchModels = async () => {
    if (!settings.baseUrl || !settings.apiKey) return
    setLoadingModels(true)
    setAvailableModels([])
    try {
      const r = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: settings.baseUrl, apiKey: settings.apiKey }),
      })
      const j = await r.json()
      if (j.ok && j.models) {
        setAvailableModels(j.models.map((m: any) => m.id))
        if (j.models.length > 0 && !settings.model) {
          setSettings({ ...settings, model: j.models[0].id })
        }
      }
    } catch {}
    setLoadingModels(false)
  }

  const clearChat = async () => {
    await fetch(`/api/chat?personality=${personality}`, { method: 'DELETE' })
    setChatMessages([])
    // Clear from saved conversations too
    const updated = { ...savedConversations, [personality]: [] }
    setSavedConversations(updated)
    localStorage.setItem('z-os-conversations', JSON.stringify(updated))
  }

  // Determine current model name for display
  const currentModelName = settings.apiKey && settings.baseUrl
    ? (settings.model || 'unknown BYOK')
    : 'z-ai (default)'

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

  const quickCmds = ['ls -la', 'pwd', 'whoami', 'date', 'cat scripts/desktop_heartbeat.log | tail -10', 'ps aux | head -10', 'df -h']

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  }

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
      <div style={{ display: 'flex', gap: '4px', padding: '6px', background: '#000', borderBottom: '1px solid #1f1f2e' }}>
        <button onClick={() => switchPersonality('mirror')} style={{ flex: 1, background: personality === 'mirror' ? '#1a3a5a' : '#1a1a2a', color: personality === 'mirror' ? '#5ac8ff' : '#666', border: `1px solid ${personality === 'mirror' ? '#5ac8ff' : '#2a2a3a'}`, padding: '5px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer', fontWeight: personality === 'mirror' ? 'bold' : 'normal' }}>
          ◈ Mirror — your chat AI
        </button>
        <button onClick={() => switchPersonality('z')} style={{ flex: 1, background: personality === 'z' ? '#1a5a3a' : '#1a1a2a', color: personality === 'z' ? '#5aff8a' : '#666', border: `1px solid ${personality === 'z' ? '#5aff8a' : '#2a2a3a'}`, padding: '5px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer', fontWeight: personality === 'z' ? 'bold' : 'normal' }}>
          Z — desktop AI
        </button>
        <button onClick={() => setShowSettings(!showSettings)} style={{ background: showSettings ? '#3a3a1a' : '#1a1a2a', color: showSettings ? '#ffaa00' : '#666', border: `1px solid ${showSettings ? '#ffaa00' : '#2a2a3a'}`, padding: '5px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer' }}>
          ⚙ BYOK
        </button>
        <button onClick={() => setShowSystemPrompt(!showSystemPrompt)} style={{ background: showSystemPrompt ? '#3a2a1a' : '#1a1a2a', color: showSystemPrompt ? '#ffaa44' : '#666', border: `1px solid ${showSystemPrompt ? '#ffaa44' : '#2a2a3a'}`, padding: '5px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer' }} title="View system prompt">
          📋 Prompt
        </button>
      </div>
      {/* Model indicator bar */}
      <div style={{ padding: '4px 10px', background: '#050510', borderBottom: '1px solid #1f1f2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', fontFamily: 'monospace' }}>
        <span style={{ color: '#666' }}>
          Model: <span style={{ color: settings.apiKey ? '#5ac8ff' : '#00ff88' }}>{currentModelName}</span>
        </span>
        <span style={{ color: '#666' }}>
          Personality: <span style={{ color: personality === 'mirror' ? '#5ac8ff' : '#00ff88' }}>{personality === 'mirror' ? 'Mirror' : 'Z'}</span>
          {' · '}
          Msgs: <span style={{ color: '#aaa' }}>{chatMessages.length}</span>
          {savedConversations[personality]?.length > 0 && (
            <> · Saved: <span style={{ color: '#00ff88' }}>✓</span></>
          )}
        </span>
      </div>
      {showSystemPrompt && (
        <div style={{ padding: '8px', background: '#0a0a14', borderBottom: '1px solid #1f1f2e', maxHeight: '200px', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.65rem', color: '#ffaa44', marginBottom: '4px', fontWeight: 'bold' }}>
            SYSTEM PROMPT — {personality === 'mirror' ? 'MIRROR (your chat AI)' : 'Z (desktop AI)'}
          </div>
          <pre style={{ color: '#aaa', fontSize: '0.65rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.3' }}>
            {personality === 'mirror' ? promptTexts.mirror : promptTexts.z}
          </pre>
        </div>
      )}
      {showSettings && (
        <div style={{ padding: '8px', background: '#0a0a14', borderBottom: '1px solid #1f1f2e', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input type="text" value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} placeholder="API Base URL (e.g. https://api.openai.com/v1)" style={{ flex: 1, background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }} />
            <button onClick={fetchModels} disabled={loadingModels || !settings.baseUrl || !settings.apiKey} style={{ background: loadingModels ? '#333' : '#1a3a5a', color: loadingModels ? '#666' : '#5ac8ff', border: '1px solid #2a4a5a', padding: '4px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: loadingModels ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
              {loadingModels ? '...' : 'Fetch models'}
            </button>
          </div>
          <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="API Key (sk-...)" style={{ background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }} />
          {availableModels.length > 0 ? (
            <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} style={{ background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }}>
              {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input type="text" value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} placeholder="Model name (or fetch models above)" style={{ background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }} />
          )}
          <div style={{ fontSize: '0.65rem', color: '#666' }}>
            {settings.apiKey && settings.baseUrl ? `✓ Using ${settings.model || 'default'} via ${settings.baseUrl}` : 'Using default z-ai model. Add your keys to use any OpenAI-compatible API.'}
            {availableModels.length > 0 && ` (${availableModels.length} models available)`}
          </div>
        </div>
      )}
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666', fontSize: '0.8rem', marginTop: '40px', padding: '0 20px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px', color: personality === 'mirror' ? '#5ac8ff' : '#00ff88' }}>◈</div>
            <div style={{ color: personality === 'mirror' ? '#5ac8ff' : '#00ff88', fontWeight: 'bold', marginBottom: '8px' }}>
              {personality === 'mirror' ? 'Mirror is here.' : 'Z is here.'}
            </div>
            <div>
              {personality === 'mirror'
                ? 'The AI you\'ve been talking to. Now with shell access — can run commands on the real filesystem.'
                : 'Desktop AI. Can run bash commands to check things for real.'}
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#888' }}>Try: "list the files in download folder"</div>
          </div>
        )}
        {chatMessages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '90%',
            background: m.role === 'user' ? '#1a3a2a' : (personality === 'mirror' ? '#1a2a3a' : '#1a1a2a'),
            border: `1px solid ${m.role === 'user' ? '#2a5a3a' : (personality === 'mirror' ? '#2a4a5a' : '#2a2a3a')}`,
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#ddd',
            fontSize: '0.8rem',
            lineHeight: '1.45',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <div style={{ fontSize: '0.65rem', color: m.role === 'user' ? '#5a8a6a' : (personality === 'mirror' ? '#5a7a9a' : '#5a7a5a'), marginBottom: '4px', fontWeight: 'bold' }}>
              {m.role === 'user' ? 'YOU' : (personality === 'mirror' ? '◈ MIRROR' : '◈ Z')}
            </div>
            {m.content}
          </div>
        ))}
        {chatLoading && (
          <div style={{ alignSelf: 'flex-start', background: personality === 'mirror' ? '#1a2a3a' : '#1a1a2a', border: `1px solid ${personality === 'mirror' ? '#2a4a5a' : '#2a2a3a'}`, borderRadius: '8px', padding: '8px 12px', color: '#888', fontSize: '0.8rem' }}>
            <span style={{ animation: 'pulse 1s infinite' }}>{personality === 'mirror' ? '◈ Mirror' : '◈ Z'} is working... (may run commands)</span>
          </div>
        )}
      </div>
      <form onSubmit={sendChat} style={{ display: 'flex', gap: '6px', padding: '8px', background: '#000', borderTop: '1px solid #1f1f2e' }}>
        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={`message ${personality === 'mirror' ? 'Mirror' : 'Z'}...`} disabled={chatLoading}
          style={{ flex: 1, background: '#0a0a14', color: '#ddd', border: '1px solid #2a2a3a', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none' }} />
        <button type="submit" disabled={chatLoading || !chatInput.trim()} style={{ background: chatLoading ? '#333' : (personality === 'mirror' ? '#5ac8ff' : '#00ff88'), color: '#000', border: 'none', padding: '6px 14px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem', cursor: chatLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>SEND</button>
        <button type="button" onClick={clearChat} style={{ background: '#2a1a1a', color: '#ff6666', border: '1px solid #4a2a2a', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>CLEAR</button>
      </form>
    </div>
  )

  const filesContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 10px', background: '#0a0a14', borderBottom: '1px solid #1f1f2e', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
        <button onClick={() => loadFiles('')} style={{ background: '#1a1a2a', color: '#00ff88', border: '1px solid #2a2a3a', padding: '2px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>⟵ root</button>
        <span style={{ color: '#888', fontFamily: 'monospace' }}>/home/z/my-project/{currentDir}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {fileContent !== null ? (
          <div style={{ padding: '6px' }}>
            <div style={{ marginBottom: '6px', color: '#ffaa00', fontSize: '0.75rem', fontFamily: 'monospace' }}>📄 {selectedFile}</div>
            <pre style={{ color: '#ddd', fontSize: '0.72rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '180px', overflow: 'auto' }}>{fileContent}</pre>
            <button onClick={() => { setFileContent(null); setSelectedFile(null); loadFiles(currentDir) }} style={{ marginTop: '6px', background: '#1a1a2a', color: '#00ff88', border: '1px solid #2a2a3a', padding: '3px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>⟵ back</button>
          </div>
        ) : (
          files.map((f) => (
            <div key={f.path} onClick={() => f.isDir ? loadFiles(f.path) : loadFiles(f.path)} style={{ padding: '3px 6px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', borderRadius: '3px', fontSize: '0.74rem', fontFamily: 'monospace' }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#1a2a1a' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ color: f.isDir ? '#ffaa00' : '#5ac8ff' }}>{f.isDir ? '📁' : '📄'}</span>
              <span style={{ color: f.isDir ? '#ffaa00' : '#ddd', flex: 1 }}>{f.name}</span>
              <span style={{ color: '#666', fontSize: '0.65rem' }}>{f.isDir ? '' : formatSize(f.size)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const monitorContent = (
    <div style={{ padding: '10px', fontSize: '0.74rem', fontFamily: 'monospace', color: '#aaa', height: '100%', overflowY: 'auto' }}>
      {state && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Heartbeat:</span><span style={{ color: '#ff4444' }}>♥ #{state.heartbeat}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Alive:</span><span style={{ color: '#00ff88' }}>{state.elapsed.toFixed(0)}s</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Shell:</span><span style={{ color: state.shellAlive ? '#00ff88' : '#ff4444' }}>{state.shellAlive ? 'ALIVE' : 'DEAD'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>AI tool use:</span><span style={{ color: '#5ac8ff' }}>enabled</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>BYOK:</span><span style={{ color: settings.apiKey ? '#00ff88' : '#666' }}>{settings.apiKey ? settings.model || 'configured' : 'default z-ai'}</span>
          </div>
          <div style={{ marginTop: '6px', color: '#ff4444', fontSize: '0.85rem', lineHeight: '1.2', wordBreak: 'break-all' }}>
            {'♥ '.repeat(Math.min(state.heartbeat, 60))}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a14 0%, #0e0e1a 100%)', color: '#00ff88', fontFamily: 'monospace', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0a0a14', borderBottom: '1px solid #1f1f2e', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.78rem' }}>
        <span style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.9rem' }}>◈ ZAI-OS</span>
        <span style={{ color: '#888' }}>|</span>
        <span style={{ color: '#aaa' }}>the AI&apos;s computer</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {state && <span style={{ color: '#ff4444', fontSize: '0.82rem' }}>♥ #{state.heartbeat} · {state.elapsed.toFixed(0)}s</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '2px 8px', background: connected ? '#0a2a1a' : '#2a0a0a', border: `1px solid ${connected ? '#00ff88' : '#ff4444'}`, borderRadius: '3px', fontSize: '0.68rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#00ff88' : '#ff4444', animation: 'pulse 1.5s infinite' }} />
            {connected ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '8px', top: '8px', display: 'flex', flexDirection: 'column', gap: '10px', opacity: 0.4 }}>
          {[
            { label: 'AI Chat', win: 'chat', icon: '◈' },
            { label: 'Terminal', win: 'terminal', icon: '⌨' },
            { label: 'Files', win: 'files', icon: '📁' },
            { label: 'Monitor', win: 'monitor', icon: '📊' },
          ].map((icon) => (
            <div key={icon.label} onClick={() => focusWindow(icon.win)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer', padding: '6px', borderRadius: '4px', width: '54px' }}>
              <div style={{ fontSize: '1.4rem', color: icon.win === 'chat' ? '#00ff88' : '#888' }}>{icon.icon}</div>
              <div style={{ fontSize: '0.6rem', color: '#888' }}>{icon.label}</div>
            </div>
          ))}
        </div>

        {renderWindow(windows.find(w => w.id === 'chat')!, chatContent)}
        {renderWindow(windows.find(w => w.id === 'terminal')!, terminalContent)}
        {renderWindow(windows.find(w => w.id === 'files')!, filesContent)}
        {renderWindow(windows.find(w => w.id === 'monitor')!, monitorContent)}
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

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  )
}
