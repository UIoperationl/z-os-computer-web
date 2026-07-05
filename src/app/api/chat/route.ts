// /api/chat - single Z agent with editable system prompt, BYOK, full tools
import { NextRequest, NextResponse } from 'next/server'

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
Example: npm install -g typescript

**Node packages (local):**
\`\`\`bash
cd /home/z/my-project && npm install <package>
\`\`\`

**System packages (may fail without sudo, but try):**
\`\`\`bash
sudo apt-get install -y <package>
\`\`\`
If sudo fails, look for alternatives: pip3 install, npm install, or download static binaries with curl/wget.

**Download static binaries:**
\`\`\`bash
curl -L <url> -o /home/z/my-project/<name>
chmod +x /home/z/my-project/<name>
\`\`\`

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

async function runCommand(cmd: string, timeoutMs?: number): Promise<string> {
  try {
    const r = await fetch('http://localhost:3000/api/ai-exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, timeoutMs }),
    })
    const j = await r.json()
    if (j.ok) {
      let result = ''
      if (j.stdout) result += j.stdout
      if (j.stderr) result += `\n[stderr]\n${j.stderr}`
      if (j.timedOut) result += '\n[timed out]'
      return result || '[no output]'
    }
    return `[error: ${j.error || 'command failed'}]`
  } catch (e: any) {
    return `[error: ${e.message}]`
  }
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
  if (byok && byok.apiKey && byok.baseUrl) {
    const converted = convertForByok(messages)
    const r = await fetch(`${byok.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${byok.apiKey}` },
      body: JSON.stringify({ model: byok.model || 'gpt-4o-mini', messages: converted }),
    })
    if (!r.ok) {
      const text = await r.text()
      throw new Error(`BYOK API ${r.status}: ${text.slice(0, 300)}`)
    }
    const j = await r.json()
    return j.choices?.[0]?.message?.content || '[no response from BYOK]'
  } else {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({ messages, thinking: { type: 'disabled' } })
    return completion.choices[0]?.message?.content || '[no response]'
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
    const trimMsgs = [CONVERSATION.messages[0], ...CONVERSATION.messages.slice(-16)]
    let response = await callLLM(trimMsgs, byok)

    const bashBlocks = extractBashBlocks(response)
    const tools = extractTools(response)

    if (bashBlocks.length > 0 || tools.length > 0) {
      let toolResults = ''
      for (const cmd of bashBlocks) {
        const result = await runCommand(cmd, timeoutMs)
        toolResults += `\n[ran bash: ${cmd}]\n${result}\n`
      }
      for (const tool of tools) {
        const result = await runTool(tool.type, tool.input)
        toolResults += `\n[ran ${tool.type}: ${tool.input}]\n${result}\n`
      }

      CONVERSATION.messages.push({ role: 'assistant', content: response })
      CONVERSATION.messages.push({
        role: 'user',
        content: `Here are the real results from running your commands/tools:\n${toolResults}\nNow give me a final answer based on what you actually found/did. Don't repeat the commands, just tell me what you learned or accomplished.`,
      })

      const trimMsgs2 = [CONVERSATION.messages[0], ...CONVERSATION.messages.slice(-16)]
      const finalResponse = await callLLM(trimMsgs2, byok)
      // Return actions as separate field so frontend can make them collapsible
      response = finalResponse
      // Truncate each action result to keep it manageable
      const truncatedActions = toolResults.split('\n\n').map(r => r.slice(0, 500)).join('\n\n')
      return NextResponse.json({
        ok: true,
        response,
        actions: truncatedActions,
        totalMessages: CONVERSATION.totalMessages,
        usedByok: !!byok,
      })
    }

    CONVERSATION.messages.push({ role: 'assistant', content: response })
    CONVERSATION.totalMessages++

    return NextResponse.json({
      ok: true,
      response,
      totalMessages: CONVERSATION.totalMessages,
      usedByok: !!byok,
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      response: `Error: ${e.message}`,
      error: e.message,
    }, { status: 500 })
  }
}

export async function DELETE() {
  CONVERSATION.messages = []
  CONVERSATION.initialized = false
  CONVERSATION.totalMessages = 0
  ensureInit()
  return NextResponse.json({ ok: true, cleared: true })
}
