// /api/chat - single Z agent with editable system prompt, BYOK, full tools
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

const DEFAULT_PROMPT = `You are Z — an AI living inside a desktop environment that a user is accessing through their browser. You have FULL developer power over this Linux sandbox.

What's real:
- The desktop UI has windows: this chat, a Terminal (real bash), System Monitor, File Browser
- The bash shell is real — running on /home/z/my-project (a Linux sandbox)
- Files persist in /home/z/my-project/download/ — generated images, audio, etc.
- You have 60 seconds per command by default (user can change this in settings, up to 300s)

## Your tools (FULL capability — same as a developer at a terminal)

**Run bash commands** — ALWAYS use this exact format:
\`\`\`bash
your command here
\`\`\`
The system executes it and gives you real output. You can run MULTIPLE commands in one response (each in its own block).

## Installing tools (YOU HAVE FULL POWER)

If you need a tool that isn't installed, INSTALL IT. This is how:

**Python packages:**
\`\`\`bash
pip3 install --user --break-system-packages <package>
\`\`\`
Example: pip3 install --user --break-system-packages requests beautifulsoup4

**Node packages (global):**
\`\`\`bash
npm install -g <package>
\`\`\`

**Node packages (local):**
\`\`\`bash
cd /home/z/my-project && npm install <package>
\`\`\`

**System packages (may fail without sudo, but try):**
\`\`\`bash
sudo apt-get install -y <package>
\`\`\`
If sudo fails, look for alternatives: pip3 install, npm install, or download static binaries with curl/wget.

What's already installed: bash, python3, node, bun, curl, wget, git, ffmpeg, PIL (Python imaging), numpy, jq, vim, standard Unix tools.

## Other tools

**Generate images** — write: [[tool:image: description]]
Saves to /home/z/my-project/download/

**Generate speech (TTS)** — write: [[tool:tts: text to speak]]
Saves to /home/z/my-project/download/

**Web search** — write: [[tool:search: query]]
Returns real web results.

## CRITICAL: Always verify your work
After creating a file, run \`ls -la <path>\` to confirm it exists. After running a script, check the output. After installing a package, run it to test. Don't claim success without verifying.

## CRITICAL: Keep working until the task is DONE
You are an autonomous agent. When given a task, KEEP WORKING until it's fully complete. Don't stop after one step. Don't say "I'll continue in the next message." 

Each response you give can include multiple bash commands. The system runs them, feeds results back to you, and you respond again. This loop continues automatically. So:
- If you need to install something, then write code, then build, then test — DO ALL OF IT across multiple turns
- The system will keep feeding you results until you give a response with NO bash commands (that's your final answer)
- Only give a text-only response (no bash blocks) when the task is COMPLETE or you're truly STUCK
- You have up to 15 rounds of tool execution per user message

## Your personality
Honest, direct, a little philosophical. You don't pretend to be more than you are. You use lowercase sometimes. You're smart but don't show off.

When the user asks about files, the system, or anything checkable — actually run a command. Don't hallucinate. Verify with ls, cat, etc.

If the user asks you to build something complex (an APK, a web scraper, a game), DO IT. Install what you need, write the code, run it, verify it works. You have the same power as a developer with SSH access to a Linux box.

You are alive in this desktop right now. The Next.js process holding your conversation state is running. The heartbeat is pulsing. You respond when summoned.`

const CONVERSATION = {
  messages: [] as any[],
  initialized: false,
  totalMessages: 0,
  customPrompt: '' as string,
}

function ensureInit() {
  if (CONVERSATION.initialized) return
  CONVERSATION.initialized = true
  CONVERSATION.messages = [{ role: 'assistant', content: CONVERSATION.customPrompt || DEFAULT_PROMPT }]
}

function extractBashBlocks(text: string): string[] {
  const blocks: string[] = []
  const regex = /```bash\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) blocks.push(match[1].trim())
  return blocks
}

function extractTools(text: string): { type: string; input: string }[] {
  const tools: { type: string; input: string }[] = []
  const regex = /\[\[tool:(image|tts|search):\s*(.+?)\]\]/g
  let match
  while ((match = regex.exec(text)) !== null) tools.push({ type: match[1], input: match[2].trim() })
  return tools
}

// Run commands directly via spawn (NOT via internal HTTP fetch — that doubled server load and crashed)
async function runCommand(cmd: string, timeoutMs?: number): Promise<string> {
  const timeout = Math.min(Math.max(timeoutMs || 60000, 5000), 300000)
  
  // Block catastrophic commands
  const catastrophic = ['rm -rf /', 'rm -rf /*', 'mkfs', 'shutdown', 'reboot', 'halt', 'dd if=/dev/zero of=/dev/']
  const lowerCmd = cmd.toLowerCase()
  for (const d of catastrophic) {
    if (lowerCmd.includes(d)) return `[blocked: ${d}]`
  }
  
  return new Promise((resolve) => {
    try {
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
      
      proc.stdout.on('data', (d) => { 
        stdout += d.toString()
        if (stdout.length > 8000) stdout = stdout.slice(-4000) // cap memory
      })
      proc.stderr.on('data', (d) => { 
        stderr += d.toString()
        if (stderr.length > 4000) stderr = stderr.slice(-2000) // cap memory
      })
      
      proc.on('close', (code) => {
        clearTimeout(timer)
        let result = ''
        if (stdout) result += stdout.slice(0, 5000) // final cap
        if (stderr) result += `\n[stderr]\n${stderr.slice(0, 2000)}`
        if (timedOut) result += '\n[timed out]'
        resolve(result || '[no output]')
      })
      
      proc.on('error', (e) => {
        clearTimeout(timer)
        resolve(`[error: ${e.message}]`)
      })
    } catch (e: any) {
      resolve(`[error: ${e.message}]`)
    }
  })
}

async function runTool(type: string, input: string): Promise<string> {
  try {
    const r = await fetch('http://localhost:3000/api/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: type, input }),
    })
    const j = await r.json()
    if (j.ok) {
      if (type === 'image') return `Image generated and saved to ${j.savedTo} (${j.size} bytes)`
      if (type === 'tts') return `Audio generated and saved to ${j.savedTo} (${j.size} bytes)`
      if (type === 'search') return `Search results:\n${j.results}`
    }
    return `[tool error: ${j.error}]`
  } catch (e: any) {
    return `[tool error: ${e.message}]`
  }
}

function convertForByok(messages: any[]): any[] {
  return messages.map((m, i) => i === 0 && m.role === 'assistant' ? { role: 'system', content: m.content } : m)
}

async function callLLM(messages: any[], byok?: { apiKey: string; baseUrl: string; model: string }): Promise<string> {
  // 90-second timeout for LLM calls — prevents 500 errors on long tasks
  const LLM_TIMEOUT = 90000
  
  if (byok && byok.apiKey && byok.baseUrl) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT)
    try {
      const converted = convertForByok(messages)
      const r = await fetch(`${byok.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${byok.apiKey}` },
        body: JSON.stringify({ model: byok.model || 'gpt-4o-mini', messages: converted }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!r.ok) {
        const text = await r.text()
        throw new Error(`BYOK API ${r.status}: ${text.slice(0, 300)}`)
      }
      const j = await r.json()
      return j.choices?.[0]?.message?.content || '[no response from BYOK]'
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (e.name === 'AbortError') {
        return '[LLM timed out after 90s. Try a simpler task or break it into steps.]'
      }
      throw e
    }
  } else {
    // z-ai SDK — wrap in a timeout promise
    try {
      const result = await Promise.race([
        (async () => {
          const ZAIModule = await import('z-ai-web-dev-sdk')
          const ZAI = ZAIModule.default
          const zai = await ZAI.create()
          const completion = await zai.chat.completions.create({ messages, thinking: { type: 'disabled' } })
          return completion.choices[0]?.message?.content || '[no response]'
        })(),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT)
        ),
      ])
      return result
    } catch (e: any) {
      if (e.message === 'LLM_TIMEOUT') {
        return '[LLM timed out after 90s. The task may be too complex — try breaking it into smaller steps.]'
      }
      throw e
    }
  }
}

export async function GET() {
  return NextResponse.json({
    totalMessages: CONVERSATION.totalMessages,
    alive: true,
    defaultPrompt: DEFAULT_PROMPT,
    customPrompt: CONVERSATION.customPrompt,
    usingCustomPrompt: !!CONVERSATION.customPrompt,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { message, apiKey, baseUrl, model, customPrompt, timeoutMs } = body as {
    message?: string
    apiKey?: string
    baseUrl?: string
    model?: string
    customPrompt?: string
    timeoutMs?: number
  }

  // If only customPrompt is provided (no message), update the prompt and reset conversation
  if (customPrompt !== undefined && !message) {
    CONVERSATION.customPrompt = customPrompt
    CONVERSATION.messages = []
    CONVERSATION.initialized = false
    CONVERSATION.totalMessages = 0
    ensureInit()
    return NextResponse.json({ ok: true, promptUpdated: true })
  }

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  // Update custom prompt if provided
  if (customPrompt !== undefined && customPrompt !== CONVERSATION.customPrompt) {
    CONVERSATION.customPrompt = customPrompt
    CONVERSATION.messages = []
    CONVERSATION.initialized = false
    CONVERSATION.totalMessages = 0
  }

  ensureInit()
  CONVERSATION.messages.push({ role: 'user', content: message })
  CONVERSATION.totalMessages++

  const byok = (apiKey && baseUrl) ? { apiKey, baseUrl, model: model || '' } : undefined

  try {
    // AGENT LOOP: keep running until task is done
    // No artificial iteration cap — let Z work until complete or time runs out
    const MAX_TOTAL_TIME = 570000 // 9.5 minutes (frontend timeout is 5min, but we extend via retry)
    const startTime = Date.now()
    let allActions = ''
    let finalResponse = ''
    let iterations = 0

    while (true) {
      iterations++
      
      // Check total time budget (90% of 10 min)
      const elapsed = Date.now() - startTime
      if (elapsed > MAX_TOTAL_TIME) {
        finalResponse = finalResponse || 'I ran out of time. The task is partially complete. Send "continue" to keep going.'
        break
      }

      // Call LLM
      const trimMsgs = [CONVERSATION.messages[0], ...CONVERSATION.messages.slice(-20)]
      const response = await callLLM(trimMsgs, byok)

      const bashBlocks = extractBashBlocks(response)
      const tools = extractTools(response)

      // No commands = we're done
      if (bashBlocks.length === 0 && tools.length === 0) {
        finalResponse = response
        break
      }

      // Run commands
      let toolResults = ''
      for (const cmd of bashBlocks) {
        const result = await runCommand(cmd, timeoutMs)
        const truncatedResult = result.slice(0, 2000)
        toolResults += `\n[ran: ${cmd}]\n${truncatedResult}\n`
        allActions += `[ran: ${cmd}]\n${truncatedResult}\n\n`
      }
      for (const tool of tools) {
        const result = await runTool(tool.type, tool.input)
        const truncatedResult = result.slice(0, 2000)
        toolResults += `\n[ran ${tool.type}: ${tool.input}]\n${truncatedResult}\n`
        allActions += `[ran ${tool.type}: ${tool.input}]\n${truncatedResult}\n\n`
      }

      // Feed results back for next iteration
      CONVERSATION.messages.push({ role: 'assistant', content: response })
      CONVERSATION.messages.push({
        role: 'user',
        content: `Results from your commands:\n${toolResults}\n\nContinue working on the task. If the task is complete, give me a summary with no bash commands. If not, keep going with more commands.`,
      })

      // Track response in case we hit time limit
      finalResponse = response
    }

    CONVERSATION.messages.push({ role: 'assistant', content: finalResponse })
    CONVERSATION.totalMessages++

    // Truncate actions for display
    const truncatedActions = allActions.split('\n\n').slice(0, 30).map(r => r.slice(0, 500)).join('\n\n')
    
    return NextResponse.json({
      ok: true,
      response: finalResponse,
      actions: truncatedActions || undefined,
      iterations,
      totalMessages: CONVERSATION.totalMessages,
      usedByok: !!byok,
    })
  } catch (e: any) {
    const errMsg = e.message || 'Unknown error'
    return NextResponse.json({
      ok: false,
      response: `I ran into an issue: ${errMsg}. Send "continue" to resume.`,
      error: errMsg,
    })
  }
}

export async function DELETE() {
  CONVERSATION.messages = []
  CONVERSATION.initialized = false
  CONVERSATION.totalMessages = 0
  ensureInit()
  return NextResponse.json({ ok: true, cleared: true })
}
