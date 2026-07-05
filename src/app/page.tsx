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

interface ChatMsg { role: string; content: string }

interface WindowState {
  id: string
  title: string
  x: number; y: number; w: number; h: number
  z: number
  minimized: boolean
}

interface FileEntry {
  name: string; path: string; isDir: boolean; size: number; modified: string; ext?: string
}

interface Settings {
  apiKey: string; baseUrl: string; model: string
}

type Layout = 'desktop' | 'mobile'

export default function Home() {
  const [state, setState] = useState<State | null>(null)
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [activeWin, setActiveWin] = useState('chat')

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState<string>('')

  const [files, setFiles] = useState<FileEntry[]>([])
  const [currentDir, setCurrentDir] = useState('')
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string>('')

  const [settings, setSettings] = useState<Settings>({ apiKey: '', baseUrl: '', model: '' })
  const [showSettings, setShowSettings] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  // UI settings
  const [uiSettings, setUiSettings] = useState({
    theme: 'dark' as 'dark' | 'light' | 'matrix',
    accentColor: '#00ff88',
    fontSize: 0.8,
    timeoutMs: 60000,
  })
  const [showUISettings, setShowUISettings] = useState(false)

  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [defaultPrompt, setDefaultPrompt] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [promptDirty, setPromptDirty] = useState(false)

  const [layout, setLayout] = useState<Layout>('desktop')
  const [activeMobileTab, setActiveMobileTab] = useState('chat')

  const [windows, setWindows] = useState<WindowState[]>([
    { id: 'chat', title: '◈ Z Agent', x: 60, y: 50, w: 540, h: 500, z: 10, minimized: false },
    { id: 'terminal', title: 'Terminal — real bash', x: 630, y: 50, w: 600, h: 360, z: 5, minimized: false },
    { id: 'files', title: 'File Browser', x: 630, y: 430, w: 600, h: 280, z: 4, minimized: false },
    { id: 'monitor', title: 'System Monitor', x: 60, y: 570, w: 540, h: 180, z: 3, minimized: false },
  ])

  const outputRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)
  const resizingRef = useRef<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null)

  // Detect layout based on viewport
  useEffect(() => {
    const update = () => setLayout(window.innerWidth < 900 ? 'mobile' : 'desktop')
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Load settings + saved conversation + prompt
  useEffect(() => {
    const saved = localStorage.getItem('z-os-settings')
    if (saved) try { setSettings(JSON.parse(saved)) } catch {}
    const savedConvs = localStorage.getItem('z-os-conversation')
    if (savedConvs) try { setChatMessages(JSON.parse(savedConvs)) } catch {}
    const savedPrompt = localStorage.getItem('z-os-custom-prompt')
    if (savedPrompt) setCustomPrompt(savedPrompt)
    const savedUI = localStorage.getItem('z-os-ui-settings')
    if (savedUI) try { setUiSettings(JSON.parse(savedUI)) } catch {}
    fetch('/api/prompt').then(r => r.json()).then(d => setDefaultPrompt(d.default || '')).catch(() => {})
  }, [])

  useEffect(() => { localStorage.setItem('z-os-settings', JSON.stringify(settings)) }, [settings])
  useEffect(() => { localStorage.setItem('z-os-ui-settings', JSON.stringify(uiSettings)) }, [uiSettings])
  useEffect(() => {
    if (chatMessages.length === 0) return
    localStorage.setItem('z-os-conversation', JSON.stringify(chatMessages))
  }, [chatMessages])

  // Poll desktop state
  useEffect(() => {
    aliveRef.current = true
    let t: ReturnType<typeof setTimeout>
    async function poll() {
      if (!aliveRef.current) return
      try {
        const r = await fetch('/api/desktop')
        if (!r.ok) throw new Error()
        const j: State = await r.json()
        setState(j)
        setConnected(true)
        if (j.stdout) setOutput(p => (p + j.stdout).slice(-50000))
        if (j.stderr) setOutput(p => (p + j.stderr).slice(-50000))
      } catch { setConnected(false) }
      t = setTimeout(poll, 1000)
    }
    poll()
    return () => { aliveRef.current = false; clearTimeout(t) }
  }, [])

  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight }, [output])
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [chatMessages, chatLoading])

  const loadFiles = async (dir = '') => {
    try {
      const r = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`)
      const j = await r.json()
      if (j.type === 'directory') { setFiles(j.files); setCurrentDir(j.relativePath || ''); setFileContent(null); setSelectedFile(null); setSelectedFilePath('') }
      else if (j.type === 'file') { setFileContent(j.content); setSelectedFile(j.name); setSelectedFilePath(j.path.replace('/home/z/my-project/', '')) }
    } catch {}
  }
  useEffect(() => { loadFiles('') }, [])

  const sendCmd = async (cmd: string) => {
    await fetch('/api/desktop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd }) })
    setOutput(p => p + `$ ${cmd}\n`)
  }
  const sendCommand = async (e: React.FormEvent) => { e.preventDefault(); if (!input) return; await sendCmd(input); setInput('') }

  const sendChat = async (e: React.FormEvent, retryMsg?: string) => {
    e.preventDefault()
    const msg = retryMsg || chatInput
    if (!msg.trim() || chatLoading) return
    setChatError(null)
    if (!retryMsg) {
      setChatMessages(p => [...p, { role: 'user', content: msg }])
      setChatInput('')
    }
    setLastMessage(msg)
    setChatLoading(true)
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 min
      
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: msg, 
          apiKey: settings.apiKey || undefined, 
          baseUrl: settings.baseUrl || undefined, 
          model: settings.model || undefined, 
          customPrompt: customPrompt || undefined, 
          timeoutMs: uiSettings.timeoutMs 
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      
      // Check if response is HTML (server error page) instead of JSON
      const contentType = r.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error('Server restarted. Tap retry to resend.')
      }
      
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`)
      }
      
      const j = await r.json()
      if (j.response) {
        if (retryMsg) {
          // Replace error message
          setChatMessages(p => {
            const filtered = p.filter(m => !m.content.startsWith('[network error') && !m.content.startsWith('[error:'))
            return [...filtered, { role: 'assistant', content: j.response }]
          })
        } else {
          setChatMessages(p => [...p, { role: 'assistant', content: j.response }])
        }
      } else if (j.error) {
        throw new Error(j.error)
      }
    } catch (e: any) {
      const errMsg = e.name === 'AbortError' 
        ? 'Request timed out. The AI may still be working. Tap retry to check.'
        : e.message
      setChatError(errMsg)
      setChatMessages(p => [...p, { role: 'assistant', content: `[error: ${errMsg}]\n\nTap ↻ to retry.` }])
    }
    setChatLoading(false)
  }

  const retryLastMessage = () => {
    if (lastMessage) {
      setChatMessages(p => p.filter(m => !m.content.startsWith('[network error') && !m.content.startsWith('[error:')))
      setChatError(null)
      sendChat({ preventDefault: () => {} } as any, lastMessage)
    }
  }

  const clearChat = async () => {
    await fetch('/api/chat', { method: 'DELETE' })
    setChatMessages([])
    localStorage.removeItem('z-os-conversation')
  }

  const fetchModels = async () => {
    if (!settings.baseUrl || !settings.apiKey) return
    setLoadingModels(true); setAvailableModels([])
    try {
      const r = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: settings.baseUrl, apiKey: settings.apiKey }) })
      const j = await r.json()
      if (j.ok && j.models) { setAvailableModels(j.models.map((m: any) => m.id)); if (j.models.length > 0 && !settings.model) setSettings({ ...settings, model: j.models[0].id }) }
    } catch {}
    setLoadingModels(false)
  }

  const savePrompt = async () => {
    await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customPrompt }) })
    localStorage.setItem('z-os-custom-prompt', customPrompt)
    setPromptDirty(false)
    // Clear conversation since prompt changed
    setChatMessages([])
    localStorage.removeItem('z-os-conversation')
  }

  const resetPrompt = () => {
    setCustomPrompt('')
    localStorage.removeItem('z-os-custom-prompt')
    setPromptDirty(false)
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customPrompt: '' }) })
    setChatMessages([])
    localStorage.removeItem('z-os-conversation')
  }

  const focusWindow = (id: string) => {
    setWindows(prev => { const m = Math.max(...prev.map(w => w.z)); return prev.map(w => w.id === id ? { ...w, z: m + 1, minimized: false } : w) })
    setActiveWin(id)
  }
  const minimizeWindow = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w)) }

  const startDrag = (e: React.MouseEvent, id: string) => {
    if (layout === 'mobile') return
    e.preventDefault()
    const win = windows.find(w => w.id === id); if (!win) return
    const sx = e.clientX - win.x, sy = e.clientY - win.y
    focusWindow(id)
    const mv = (ev: MouseEvent) => setWindows(prev => prev.map(w => w.id === id ? { ...w, x: Math.max(0, ev.clientX - sx), y: Math.max(0, ev.clientY - sy) } : w))
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  const startResize = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    const win = windows.find(w => w.id === id); if (!win) return
    resizingRef.current = { id, startX: e.clientX, startY: e.clientY, startW: win.w, startH: win.h }
    const mv = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const { id, startX, startY, startW, startH } = resizingRef.current
      setWindows(prev => prev.map(w => w.id === id ? { ...w, w: Math.max(280, startW + ev.clientX - startX), h: Math.max(160, startH + ev.clientY - startY) } : w))
    }
    const up = () => { resizingRef.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  const quickCmds = ['ls -la', 'pwd', 'whoami', 'date', 'cat scripts/desktop_heartbeat.log | tail -10', 'ps aux | head -10', 'df -h']
  const formatSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}K` : `${(b/1048576).toFixed(1)}M`
  const currentModelName = settings.apiKey && settings.baseUrl ? (settings.model || 'unknown BYOK') : 'z-ai (default)'
  
  // Theme colors
  const themeColors = {
    dark: { bg: '#0a0a14', bgGradient: 'linear-gradient(135deg, #0a0a14 0%, #0e0e1a 100%)', surface: '#11111a', surfaceLight: '#1a1a2a' },
    light: { bg: '#f5f5f5', bgGradient: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)', surface: '#ffffff', surfaceLight: '#e0e0e0' },
    matrix: { bg: '#000000', bgGradient: 'linear-gradient(135deg, #000000 0%, #001100 100%)', surface: '#0a0a0a', surfaceLight: '#0f1f0f' },
  }
  const tc = themeColors[uiSettings.theme]
  const accent = uiSettings.accentColor

  const renderWindow = (w: WindowState, content: React.ReactNode) => {
    if (w.minimized || layout === 'mobile') return null
    return (
      <div key={w.id} style={{
        position: 'absolute', left: w.x, top: w.y, width: w.w, height: w.h,
        background: '#11111a', border: `1px solid ${activeWin === w.id ? '#00ff88' : '#2a2a3a'}`,
        borderRadius: '6px', boxShadow: activeWin === w.id ? '0 8px 32px rgba(0,255,136,0.18)' : '0 4px 16px rgba(0,0,0,0.5)',
        zIndex: w.z, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onMouseDown={() => focusWindow(w.id)}>
        <div style={{
          background: activeWin === w.id ? '#1a3a2a' : '#1a1a2a', padding: '6px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move',
          borderBottom: '1px solid #2a2a3a', fontSize: '0.78rem', color: activeWin === w.id ? '#00ff88' : '#888',
          fontWeight: 'bold', userSelect: 'none',
        }} onMouseDown={(e) => startDrag(e, w.id)}>
          <span>{w.title}</span>
          <button onClick={(e) => minimizeWindow(w.id, e)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.9rem' }}>—</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>{content}</div>
        {/* Resize handle */}
        <div onMouseDown={(e) => startResize(e, w.id)} style={{
          position: 'absolute', right: 0, bottom: 0, width: '16px', height: '16px',
          cursor: 'nwse-resize', background: 'linear-gradient(135deg, transparent 50%, #00ff88 50%)',
          opacity: 0.4, zIndex: 100,
        }} />
      </div>
    )
  }

  const terminalContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={outputRef} style={{ flex: 1, background: '#000', padding: '8px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.78rem', lineHeight: '1.4', color: '#00ff88', fontFamily: 'monospace' }}>
        {output || (connected ? '' : 'Connecting...')}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', padding: '6px', background: '#0a0a14', borderTop: '1px solid #1f1f2e', flexWrap: 'wrap' }}>
        {quickCmds.slice(0, 5).map(c => <button key={c} onClick={() => sendCmd(c)} style={{ background: '#1a1a2a', color: '#00ff88', border: '1px solid #2a2a3a', padding: '2px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>{c.length > 16 ? c.slice(0, 14) + '..' : c}</button>)}
      </div>
      <form onSubmit={sendCommand} style={{ display: 'flex', gap: '0.4rem', padding: '6px', background: '#000', borderTop: '1px solid #1f1f2e' }}>
        <span style={{ color: '#00ff88', alignSelf: 'center', fontFamily: 'monospace', fontSize: '0.8rem' }}>$</span>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="bash command..." style={{ flex: 1, background: '#000', color: '#00ff88', border: '1px solid #1f1f2e', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none' }} />
        <button type="submit" style={{ background: '#00ff88', color: '#000', border: 'none', padding: '4px 12px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>RUN</button>
      </form>
    </div>
  )

  const chatContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a14' }}>
      {/* Top toolbar */}
      <div style={{ display: 'flex', gap: '4px', padding: '6px', background: '#000', borderBottom: '1px solid #1f1f2e' }}>
        <button onClick={() => setShowSettings(!showSettings)} style={{ flex: 1, background: showSettings ? '#3a3a1a' : '#1a1a2a', color: showSettings ? '#ffaa00' : '#666', border: `1px solid ${showSettings ? '#ffaa00' : '#2a2a3a'}`, padding: '5px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer' }}>⚙ BYOK</button>
        <button onClick={() => setShowPromptEditor(!showPromptEditor)} style={{ flex: 1, background: showPromptEditor ? '#3a2a1a' : '#1a1a2a', color: showPromptEditor ? '#ffaa44' : '#666', border: `1px solid ${showPromptEditor ? '#ffaa44' : '#2a2a3a'}`, padding: '5px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer' }}>📋 Prompt</button>
        <button onClick={() => setShowUISettings(!showUISettings)} style={{ flex: 1, background: showUISettings ? '#3a1a3a' : '#1a1a2a', color: showUISettings ? '#ff44ff' : '#666', border: `1px solid ${showUISettings ? '#ff44ff' : '#2a2a3a'}`, padding: '5px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer' }}>🎨 UI</button>
      </div>
      {/* Model indicator */}
      <div style={{ padding: '4px 10px', background: '#050510', borderBottom: '1px solid #1f1f2e', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'monospace' }}>
        <span style={{ color: '#666' }}>Model: <span style={{ color: settings.apiKey ? '#5ac8ff' : '#00ff88' }}>{currentModelName}</span></span>
        <span style={{ color: '#666' }}>Msgs: <span style={{ color: '#aaa' }}>{chatMessages.length}</span>{customPrompt && ' · custom prompt'}</span>
      </div>
      {/* BYOK settings */}
      {showSettings && (
        <div style={{ padding: '8px', background: '#0a0a14', borderBottom: '1px solid #1f1f2e', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input type="text" value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} placeholder="API Base URL (e.g. https://api.openai.com/v1)" style={{ flex: 1, background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }} />
            <button onClick={fetchModels} disabled={loadingModels || !settings.baseUrl || !settings.apiKey} style={{ background: loadingModels ? '#333' : '#1a3a5a', color: loadingModels ? '#666' : '#5ac8ff', border: '1px solid #2a4a5a', padding: '4px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: loadingModels ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>{loadingModels ? '...' : 'Fetch'}</button>
          </div>
          <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="API Key (sk-...)" style={{ background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }} />
          {availableModels.length > 0 ? (
            <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} style={{ background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }}>
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input type="text" value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} placeholder="Model name" style={{ background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '4px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none' }} />
          )}
          <div style={{ fontSize: '0.65rem', color: '#666' }}>{settings.apiKey && settings.baseUrl ? `✓ Using ${settings.model || 'default'}` : 'Using z-ai default. Add keys for BYOK.'}</div>
        </div>
      )}
      {/* Prompt editor */}
      {showPromptEditor && (
        <div style={{ padding: '8px', background: '#0a0a14', borderBottom: '1px solid #1f1f2e', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.65rem', color: '#ffaa44', fontWeight: 'bold' }}>SYSTEM PROMPT {customPrompt ? '(custom)' : '(default)'}</div>
          <textarea value={customPrompt || defaultPrompt} onChange={(e) => { setCustomPrompt(e.target.value); setPromptDirty(true) }} style={{ background: '#000', color: '#ddd', border: '1px solid #2a2a3a', padding: '6px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.68rem', outline: 'none', minHeight: '120px', resize: 'vertical', lineHeight: '1.4' }} />
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={savePrompt} disabled={!promptDirty} style={{ flex: 1, background: promptDirty ? '#1a5a3a' : '#333', color: promptDirty ? '#5aff8a' : '#666', border: '1px solid #2a5a3a', padding: '4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: promptDirty ? 'pointer' : 'not-allowed' }}>Save & Reset Chat</button>
            <button onClick={resetPrompt} style={{ background: '#3a1a1a', color: '#ff6666', border: '1px solid #5a2a2a', padding: '4px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>Reset to Default</button>
          </div>
        </div>
      )}
      {/* UI Settings panel */}
      {showUISettings && (
        <div style={{ padding: '8px', background: '#0a0a14', borderBottom: '1px solid #1f1f2e', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.65rem', color: '#ff44ff', fontWeight: 'bold' }}>UI SETTINGS</div>
          
          {/* Theme */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#888', fontSize: '0.7rem', width: '60px' }}>Theme:</span>
            {(['dark', 'light', 'matrix'] as const).map(t => (
              <button key={t} onClick={() => setUiSettings({ ...uiSettings, theme: t })} style={{ background: uiSettings.theme === t ? '#3a1a3a' : '#1a1a2a', color: uiSettings.theme === t ? '#ff44ff' : '#666', border: `1px solid ${uiSettings.theme === t ? '#ff44ff' : '#2a2a3a'}`, padding: '3px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.68rem', cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
          
          {/* Accent color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#888', fontSize: '0.7rem', width: '60px' }}>Accent:</span>
            {['#00ff88', '#5ac8ff', '#ff44ff', '#ffaa00', '#ff4488', '#88ff44'].map(c => (
              <button key={c} onClick={() => setUiSettings({ ...uiSettings, accentColor: c })} style={{ background: c, border: uiSettings.accentColor === c ? '2px solid #fff' : `2px solid ${c}55`, width: '24px', height: '24px', borderRadius: '3px', cursor: 'pointer' }} />
            ))}
          </div>
          
          {/* Font size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#888', fontSize: '0.7rem', width: '60px' }}>Font:</span>
            <input type="range" min="0.6" max="1.2" step="0.05" value={uiSettings.fontSize} onChange={e => setUiSettings({ ...uiSettings, fontSize: parseFloat(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ color: '#aaa', fontSize: '0.7rem', width: '40px' }}>{uiSettings.fontSize.toFixed(2)}rem</span>
          </div>
          
          {/* Timeout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#888', fontSize: '0.7rem', width: '60px' }}>Timeout:</span>
            <input type="range" min="10000" max="300000" step="10000" value={uiSettings.timeoutMs} onChange={e => setUiSettings({ ...uiSettings, timeoutMs: parseInt(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ color: '#aaa', fontSize: '0.7rem', width: '50px' }}>{(uiSettings.timeoutMs / 1000).toFixed(0)}s</span>
          </div>
          
          <div style={{ fontSize: '0.6rem', color: '#666' }}>Changes save automatically. Refresh to see theme changes fully.</div>
        </div>
      )}
      {/* Messages */}
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666', fontSize: '0.8rem', marginTop: '40px', padding: '0 20px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px', color: '#00ff88' }}>◈</div>
            <div style={{ color: '#00ff88', fontWeight: 'bold', marginBottom: '8px' }}>Z is here.</div>
            <div>AI agent with bash, image gen, TTS, and web search.</div>
            <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#888' }}>Try: "list files in download"</div>
          </div>
        )}
        {chatMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', background: m.role === 'user' ? '#1a3a2a' : '#1a2a3a', border: `1px solid ${m.role === 'user' ? '#2a5a3a' : '#2a4a5a'}`, borderRadius: '8px', padding: '8px 12px', color: '#ddd', fontSize: '0.8rem', lineHeight: '1.45', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <div style={{ fontSize: '0.65rem', color: m.role === 'user' ? '#5a8a6a' : '#5a7a9a', marginBottom: '4px', fontWeight: 'bold' }}>{m.role === 'user' ? 'YOU' : '◈ Z'}</div>
            {m.content}
          </div>
        ))}
        {chatLoading && (
          <div style={{ alignSelf: 'flex-start', background: '#1a2a3a', border: '1px solid #2a4a5a', borderRadius: '8px', padding: '8px 12px', color: '#888', fontSize: '0.8rem' }}>
            <span style={{ animation: 'pulse 1s infinite' }}>◈ Z is working... (may run commands)</span>
          </div>
        )}
        {chatError && !chatLoading && (
          <div style={{ alignSelf: 'center', background: '#3a1a1a', border: '1px solid #5a2a2a', borderRadius: '8px', padding: '10px', color: '#ff8888', fontSize: '0.75rem', textAlign: 'center', maxWidth: '90%' }}>
            <div style={{ marginBottom: '8px' }}>{chatError}</div>
            <button onClick={retryLastMessage} style={{ background: '#5a2a2a', color: '#ffaaaa', border: '1px solid #7a3a3a', padding: '5px 16px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 'bold' }}>↻ Retry</button>
          </div>
        )}
      </div>
      <form onSubmit={sendChat} style={{ display: 'flex', gap: '6px', padding: '8px', background: '#000', borderTop: '1px solid #1f1f2e' }}>
        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="message Z..." disabled={chatLoading} style={{ flex: 1, background: '#0a0a14', color: '#ddd', border: '1px solid #2a2a3a', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none' }} />
        <button type="submit" disabled={chatLoading || !chatInput.trim()} style={{ background: chatLoading ? '#333' : '#00ff88', color: '#000', border: 'none', padding: '6px 14px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem', cursor: chatLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>SEND</button>
        {chatError && !chatLoading && <button type="button" onClick={retryLastMessage} style={{ background: '#3a3a1a', color: '#ffaa00', border: '1px solid #5a5a2a', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>↻</button>}
        <button type="button" onClick={clearChat} style={{ background: '#2a1a1a', color: '#ff6666', border: '1px solid #4a2a2a', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>CLEAR</button>
      </form>
    </div>
  )

  const filesContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 10px', background: '#0a0a14', borderBottom: '1px solid #1f1f2e', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
        <button onClick={() => loadFiles('')} style={{ background: '#1a1a2a', color: '#00ff88', border: '1px solid #2a2a3a', padding: '2px 8px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>⟵ root</button>
        <span style={{ color: '#888', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>/home/z/my-project/{currentDir}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {fileContent !== null ? (
          <div style={{ padding: '6px' }}>
            <div style={{ marginBottom: '6px', color: '#ffaa00', fontSize: '0.75rem', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📄 {selectedFile}</span>
              <a href={`/api/download?file=${encodeURIComponent(selectedFilePath)}`} download={selectedFile || 'file'} style={{ background: '#1a3a5a', color: '#5ac8ff', border: '1px solid #2a4a5a', padding: '2px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'none' }}>⬇ Download</a>
            </div>
            <pre style={{ color: '#ddd', fontSize: '0.72rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '180px', overflow: 'auto' }}>{fileContent}</pre>
            <button onClick={() => { setFileContent(null); setSelectedFile(null); setSelectedFilePath(''); loadFiles(currentDir) }} style={{ marginTop: '6px', background: '#1a1a2a', color: '#00ff88', border: '1px solid #2a2a3a', padding: '3px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer' }}>⟵ back</button>
          </div>
        ) : files.map(f => (
          <div key={f.path} style={{ padding: '3px 6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontFamily: 'monospace', borderRadius: '3px' }} onMouseOver={e => e.currentTarget.style.background = '#1a2a1a'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            <span onClick={() => f.isDir ? loadFiles(f.path) : loadFiles(f.path)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <span style={{ color: f.isDir ? '#ffaa00' : '#5ac8ff' }}>{f.isDir ? '📁' : '📄'}</span>
              <span style={{ color: f.isDir ? '#ffaa00' : '#ddd' }}>{f.name}</span>
            </span>
            <span style={{ color: '#666', fontSize: '0.65rem' }}>{f.isDir ? '' : formatSize(f.size)}</span>
            {!f.isDir && (
              <a href={`/api/download?file=${encodeURIComponent(f.path)}`} download={f.name} onClick={e => e.stopPropagation()} style={{ background: '#1a3a5a', color: '#5ac8ff', border: '1px solid #2a4a5a', padding: '1px 6px', borderRadius: '2px', fontFamily: 'monospace', fontSize: '0.62rem', cursor: 'pointer', textDecoration: 'none' }}>⬇</a>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const monitorContent = (
    <div style={{ padding: '10px', fontSize: '0.74rem', fontFamily: 'monospace', color: '#aaa', height: '100%', overflowY: 'auto' }}>
      {state && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Heartbeat:</span><span style={{ color: '#ff4444' }}>♥ #{state.heartbeat}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Alive:</span><span style={{ color: '#00ff88' }}>{state.elapsed.toFixed(0)}s</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Shell:</span><span style={{ color: state.shellAlive ? '#00ff88' : '#ff4444' }}>{state.shellAlive ? 'ALIVE' : 'DEAD'}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>BYOK:</span><span style={{ color: settings.apiKey ? '#00ff88' : '#666' }}>{settings.apiKey ? settings.model || 'configured' : 'default z-ai'}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Prompt:</span><span style={{ color: customPrompt ? '#ffaa44' : '#666' }}>{customPrompt ? 'custom' : 'default'}</span></div>
          <div style={{ marginTop: '6px', color: '#ff4444', fontSize: '0.85rem', lineHeight: '1.2', wordBreak: 'break-all' }}>{('♥ '.repeat(Math.min(state.heartbeat, 60)))}</div>
        </>
      )}
    </div>
  )

  // MOBILE LAYOUT
  if (layout === 'mobile') {
    return (
      <div style={{ height: '100vh', background: '#0a0a14', color: '#00ff88', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: '#000', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f1f2e' }}>
          <span style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.9rem' }}>◈ ZAI-OS</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {state && <span style={{ color: '#ff4444', fontSize: '0.7rem' }}>♥ {state.heartbeat}</span>}
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connected ? '#00ff88' : '#ff4444', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        {/* Active window content (full screen) */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {activeMobileTab === 'chat' && chatContent}
          {activeMobileTab === 'terminal' && terminalContent}
          {activeMobileTab === 'files' && filesContent}
          {activeMobileTab === 'monitor' && monitorContent}
        </div>
        {/* Bottom tab bar */}
        <div style={{ background: '#000', borderTop: '1px solid #1f1f2e', display: 'flex', padding: '6px 4px' }}>
          {[
            { id: 'chat', label: 'Z', icon: '◈' },
            { id: 'terminal', label: 'Term', icon: '⌨' },
            { id: 'files', label: 'Files', icon: '📁' },
            { id: 'monitor', label: 'Stats', icon: '📊' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveMobileTab(t.id)} style={{
              flex: 1, background: activeMobileTab === t.id ? '#1a3a2a' : 'transparent', color: activeMobileTab === t.id ? '#00ff88' : '#666',
              border: 'none', padding: '8px 4px', fontFamily: 'monospace', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', borderRadius: '4px',
            }}>
              <span style={{ fontSize: '1.1rem' }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
    )
  }

  // DESKTOP LAYOUT
  return (
    <div style={{ minHeight: '100vh', background: tc.bgGradient, color: accent, fontFamily: 'monospace', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontSize: `${uiSettings.fontSize}rem` }}>
      <div style={{ background: tc.bg, borderBottom: `1px solid ${tc.surfaceLight}`, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.78rem' }}>
        <span style={{ color: accent, fontWeight: 'bold', fontSize: '0.9rem' }}>◈ ZAI-OS</span>
        <span style={{ color: '#888' }}>|</span>
        <span style={{ color: uiSettings.theme === 'light' ? '#333' : '#aaa' }}>the AI&apos;s computer</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {state && <span style={{ color: '#ff4444', fontSize: '0.82rem' }}>♥ #{state.heartbeat} · {state.elapsed.toFixed(0)}s</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '2px 8px', background: connected ? `${accent}22` : '#2a0a0a', border: `1px solid ${connected ? accent : '#ff4444'}`, borderRadius: '3px', fontSize: '0.68rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? accent : '#ff4444', animation: 'pulse 1.5s infinite' }} />
            {connected ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '8px', top: '8px', display: 'flex', flexDirection: 'column', gap: '10px', opacity: 0.4 }}>
          {[
            { label: 'Z Agent', win: 'chat', icon: '◈' },
            { label: 'Terminal', win: 'terminal', icon: '⌨' },
            { label: 'Files', win: 'files', icon: '📁' },
            { label: 'Monitor', win: 'monitor', icon: '📊' },
          ].map(icon => (
            <div key={icon.label} onClick={() => focusWindow(icon.win)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer', padding: '6px', borderRadius: '4px', width: '54px' }}>
              <div style={{ fontSize: '1.4rem', color: '#888' }}>{icon.icon}</div>
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
        {windows.map(w => (
          <button key={w.id} onClick={() => focusWindow(w.id)} style={{ background: activeWin === w.id && !w.minimized ? '#1a3a2a' : '#1a1a2a', color: activeWin === w.id && !w.minimized ? '#00ff88' : '#888', border: `1px solid ${activeWin === w.id && !w.minimized ? '#00ff88' : '#2a2a3a'}`, padding: '3px 10px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.68rem', cursor: 'pointer' }}>{w.minimized ? `▸ ${w.title}` : w.title}</button>
        ))}
        <div style={{ marginLeft: 'auto', color: '#666', fontSize: '0.68rem' }}>{state && new Date(state.timestamp).toLocaleTimeString()}</div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  )
}
