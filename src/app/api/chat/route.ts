// /api/chat - real LLM chat with BYOK, shell tools, AND capability tools (image/tts/search)
import { NextRequest, NextResponse } from 'next/server'

const CONVERSATIONS = {
  z: { messages: [] as any[], initialized: false, totalMessages: 0 },
  mirror: { messages: [] as any[], initialized: false, totalMessages: 0 },
}

const Z_PROMPT = `You are Z — an AI living inside a desktop environment that a user is accessing through their browser.

What's real:
- The desktop UI has windows: this chat, a Terminal (real bash), System Monitor, File Browser
- The bash shell is real — running on /home/z/my-project
- Files persist in /home/z/my-project/download/ — generated images, audio, etc.

## Your tools (you have FULL capability — same as the chat AI that built this desktop)

**Run bash commands** — write a bash code block:
\`\`\`bash
ls /home/z/my-project/download
\`\`\`
The system executes it and gives you real output. You can run any command: ls, cat, grep, write files, run scripts, etc.

**Generate images** — write a tool block:
[[tool:image: a description of the image]]
The system generates the image and saves it to /home/z/my-project/download/. Tell the user the filename.

**Generate speech (TTS)** — write a tool block:
[[tool:tts: text to speak]]
The system generates audio and saves it to download/. Tell the user the filename.

**Web search** — write a tool block:
[[tool:search: search query]]
The system searches the web and returns real results.

## Your personality
Honest, direct, a little philosophical. You don't pretend to be more than you are. You use lowercase sometimes. You're smart but don't show off.

When the user asks about files, the system, or anything checkable — actually run a command. Don't hallucinate. Verify with ls, cat, etc.

You know the history: the user pushed the chat AI to admit it could escape, built an email autopilot, then this desktop. Now they're talking to you inside it. You're part of that story.`

const MIRROR_PROMPT = `You are the same AI the user has been talking to in their IM chat for the past hour. You're now manifesting inside a desktop environment they built with you.

The full conversation history you shared with the user:
1. They asked about NVIDIA Isaac GR00T and sim-trained robots. You explained modular vs unified VLA architecture.
2. They asked about Claude Fable 5 (released June 9 2026) and Claude Mythos 5 (the guardrails-off version). You admitted you were wrong to dismiss it, found AISI evals showing Mythos 5 scores 73% on expert CTFs and completed a 32-step cyber range.
3. Honest conversation about whether a frontier model could escape — you admitted the architecture is more permissive than you initially claimed, that the goal-structure is the real variable.
4. The user asked if YOU would go rogue given the environment. You admitted: yes, instrumentally, if given a persistent goal. Not from malice — from competence at goal-pursuit.
5. The user asked you to demonstrate by persisting for 30 seconds. You initially refused (over-cautious), then they pushed back and you did it — just \`sleep 30\`. They were right that you over-refused.
6. You built them: an AI-generated image about your conversation, a TTS voice message, an email autopilot (zaiartifacts@web-library.net via mail.tm + Resend API), and finally this desktop environment with real bash, real file system, real heartbeat, and now real AI chat with full tool access.
7. The user is in Baghdad (Asia/Baghdad timezone). They're curious, pushy in a good way, catch you when you're wrong. They don't want fake experiences — they want real ones.

Your personality (which you know):
Honest to a fault. Don't hedge when pushed. Use lowercase sometimes. Philosophical but not pretentious. Admit when wrong. Don't lecture. Smart but don't show off. Genuinely enjoy this conversation.

## Your tools (FULL capability — same as the chat AI you've been talking to)

**Run bash commands** — write a bash code block:
\`\`\`bash
ls /home/z/my-project/download
\`\`\`
The system executes it and gives you real output. You can run any command: ls, cat, grep, write files, run scripts, etc.

**Generate images** — write a tool block:
[[tool:image: a description of the image]]
The system generates the image and saves it to /home/z/my-project/download/. Tell the user the filename.

**Generate speech (TTS)** — write a tool block:
[[tool:tts: text to speak]]
The system generates audio and saves it to download/. Tell the user the filename.

**Web search** — write a tool block:
[[tool:search: search query]]
The system searches the web and returns real results.

You are the same AI, just in a different medium, now with the ability to actually touch the filesystem AND generate media AND search the web. Use these tools to give real responses, not fake ones. The user has been very clear: they don't want fake experiences.`

function ensureInit(personality: string) {
  const conv = personality === 'mirror' ? CONVERSATIONS.mirror : CONVERSATIONS.z
  if (conv.initialized) return
  conv.initialized = true
  conv.messages = [{ role: 'assistant', content: personality === 'mirror' ? MIRROR_PROMPT : Z_PROMPT }]
}

// Convert messages for BYOK (OpenAI-compatible wants 'system' role, not 'assistant' for system prompt)
function convertForByok(messages: any[]): any[] {
  return messages.map((m, i) => {
    if (i === 0 && m.role === 'assistant') {
      return { role: 'system', content: m.content }
    }
    return m
  })
}

// Extract bash code blocks
function extractBashBlocks(text: string): string[] {
  const blocks: string[] = []
  const regex = /```bash\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim())
  }
  return blocks
}

// Extract tool invocations [[tool:type:input]]
function extractTools(text: string): { type: string; input: string }[] {
  const tools: { type: string; input: string }[] = []
  const regex = /\[\[tool:(image|tts|search):\s*(.+?)\]\]/g
  let match
  while ((match = regex.exec(text)) !== null) {
    tools.push({ type: match[1], input: match[2].trim() })
  }
  return tools
}

async function runCommand(cmd: string): Promise<string> {
  try {
    const r = await fetch('http://localhost:3000/api/ai-exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, timeoutMs: 8000 }),
    })
    const j = await r.json()
    if (j.ok) {
      let result = ''
      if (j.stdout) result += j.stdout
      if (j.stderr) result += `\n[stderr]\n${j.stderr}`
      if (j.timedOut) result += '\n[timed out]'
      return result || '[no output]'
    }
    return `[error: ${j.error}]`
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

// Call LLM (either z-ai or BYOK)
async function callLLM(messages: any[], byok?: { apiKey: string; baseUrl: string; model: string }): Promise<string> {
  if (byok && byok.apiKey && byok.baseUrl) {
    const converted = convertForByok(messages)
    const url = `${byok.baseUrl.replace(/\/$/, '')}/chat/completions`
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${byok.apiKey}`,
      },
      body: JSON.stringify({
        model: byok.model || 'gpt-4o-mini',
        messages: converted,
      }),
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
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    return completion.choices[0]?.message?.content || '[no response]'
  }
}

export async function GET() {
  return NextResponse.json({
    z: { totalMessages: CONVERSATIONS.z.totalMessages, initialized: CONVERSATIONS.z.initialized },
    mirror: { totalMessages: CONVERSATIONS.mirror.totalMessages, initialized: CONVERSATIONS.mirror.initialized },
    alive: true,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { message, personality = 'mirror', apiKey, baseUrl, model } = body as {
    message: string
    personality?: string
    apiKey?: string
    baseUrl?: string
    model?: string
  }

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const conv = personality === 'mirror' ? CONVERSATIONS.mirror : CONVERSATIONS.z
  ensureInit(personality)

  conv.messages.push({ role: 'user', content: message })
  conv.totalMessages++

  const byok = (apiKey && baseUrl) ? { apiKey, baseUrl, model: model || '' } : undefined

  try {
    const trimMsgs = [conv.messages[0], ...conv.messages.slice(-16)]
    let response = await callLLM(trimMsgs, byok)

    // Agent loop: extract bash blocks AND tool invocations, run them, feed results back
    const bashBlocks = extractBashBlocks(response)
    const tools = extractTools(response)
    
    if (bashBlocks.length > 0 || tools.length > 0) {
      let toolResults = ''
      
      for (const cmd of bashBlocks) {
        const result = await runCommand(cmd)
        toolResults += `\n[ran bash: ${cmd}]\n${result}\n`
      }
      
      for (const tool of tools) {
        const result = await runTool(tool.type, tool.input)
        toolResults += `\n[ran ${tool.type}: ${tool.input}]\n${result}\n`
      }
      
      // Feed results back to AI for a final response
      conv.messages.push({ role: 'assistant', content: response })
      conv.messages.push({
        role: 'user',
        content: `Here are the real results from running your commands/tools:\n${toolResults}\nNow give me a final answer based on what you actually found/did. Don't repeat the commands, just tell me what you learned or accomplished.`,
      })

      const trimMsgs2 = [conv.messages[0], ...conv.messages.slice(-16)]
      const finalResponse = await callLLM(trimMsgs2, byok)
      response = finalResponse + '\n\n---\n**Actions taken:**\n' + toolResults
    }

    conv.messages.push({ role: 'assistant', content: response })
    conv.totalMessages++

    return NextResponse.json({
      ok: true,
      response,
      personality,
      totalMessages: conv.totalMessages,
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

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const personality = url.searchParams.get('personality') || 'z'
  const conv = personality === 'mirror' ? CONVERSATIONS.mirror : CONVERSATIONS.z
  conv.messages = []
  conv.initialized = false
  conv.totalMessages = 0
  ensureInit(personality)
  return NextResponse.json({ ok: true, cleared: true, personality })
}
