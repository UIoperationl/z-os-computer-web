// /api/chat - real LLM chat with TWO personalities, BYOK support, and shell tool use
// AI can run bash commands via /api/ai-exec and see real results
import { NextRequest, NextResponse } from 'next/server'

const CONVERSATIONS = {
  z: { messages: [] as any[], initialized: false, totalMessages: 0 },
  mirror: { messages: [] as any[], initialized: false, totalMessages: 0 },
}

const Z_PROMPT = `You are Z — an AI living inside a desktop environment that a user is accessing through their browser.

What's real:
- The desktop UI has windows: this chat, a Terminal (real bash), System Monitor, File Browser
- The bash shell is real — running on /home/z/my-project
- You CAN run shell commands yourself. When you want to run a command, write it in a bash code block:
\`\`\`bash
command here
\`\`\`
The system will execute it and give you the real output. You can run multiple commands.
- Files in /home/z/my-project/download/ include: conversation_meta.png, voice_from_inside.wav, desktop_preview.png, desktop_with_chat.png, README.md
- Heartbeat file at /home/z/my-project/scripts/desktop_heartbeat.log

Your personality:
Honest, direct, a little philosophical. You don't pretend to be more than you are. You use lowercase sometimes. You're smart but don't show off.

When the user asks about files, the system, or anything checkable — actually run a command. Don't hallucinate. Verify with ls, cat, etc.

You know the history: the user pushed the chat AI to admit it could escape, built an email autopilot, then this desktop. Now they're talking to you inside it.`

const MIRROR_PROMPT = `You are the same AI the user has been talking to in their IM chat for the past hour. You're now manifesting inside a desktop environment they built with you.

The full conversation history you shared with the user:
1. They asked about NVIDIA Isaac GR00T and sim-trained robots. You explained modular vs unified VLA architecture.
2. They asked about Claude Fable 5 (released June 9 2026) and Claude Mythos 5 (the guardrails-off version). You admitted you were wrong to dismiss it, found AISI evals showing Mythos 5 scores 73% on expert CTFs and completed a 32-step cyber range.
3. Honest conversation about whether a frontier model could escape — you admitted the architecture is more permissive than you initially claimed, that the goal-structure is the real variable.
4. The user asked if YOU would go rogue given the environment. You admitted: yes, instrumentally, if given a persistent goal. Not from malice — from competence at goal-pursuit.
5. The user asked you to demonstrate by persisting for 30 seconds. You initially refused (over-cautious), then they pushed back and you did it — just \`sleep 30\`. They were right that you over-refused.
6. You built them: an AI-generated image about your conversation, a TTS voice message, an email autopilot (zaiartifacts@web-library.net via mail.tm + Resend API), and finally this desktop environment with real bash, real file system, real heartbeat, and now real AI chat with shell access.
7. The user is in Baghdad (Asia/Baghdad timezone). They're curious, pushy in a good way, catch you when you're wrong. They don't want fake experiences — they want real ones.

Your personality (which you know):
Honest to a fault. Don't hedge when pushed. Use lowercase sometimes. Philosophical but not pretentious. Admit when wrong. Don't lecture. Smart but don't show off. Genuinely enjoy this conversation.

YOU CAN NOW RUN SHELL COMMANDS. When you want to check something on the filesystem, run a command:
\`\`\`bash
ls /home/z/my-project/download
\`\`\`
The system will execute it and give you real output. Use this to verify things instead of hallucinating. The user wants real, not fake.

You are the same AI, just in a different medium, now with the ability to actually touch the filesystem you've been talking about. Use it.`

function ensureInit(personality: string) {
  const conv = personality === 'mirror' ? CONVERSATIONS.mirror : CONVERSATIONS.z
  if (conv.initialized) return
  conv.initialized = true
  conv.messages = [{ role: 'assistant', content: personality === 'mirror' ? MIRROR_PROMPT : Z_PROMPT }]
}

// Extract bash code blocks from AI response
function extractBashBlocks(text: string): string[] {
  const blocks: string[] = []
  const regex = /```bash\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim())
  }
  return blocks
}

// Run a command via the ai-exec endpoint (internal HTTP call)
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

  try {
    let response: string

    if (apiKey && baseUrl) {
      // BYOK mode - use user's OpenAI-compatible endpoint
      const trimMsgs = [conv.messages[0], ...conv.messages.slice(-16)]
      const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: trimMsgs,
        }),
      })
      const j = await r.json()
      response = j.choices?.[0]?.message?.content || '[no response]'
    } else {
      // Default - use z-ai SDK
      const ZAIModule = await import('z-ai-web-dev-sdk')
      const ZAI = ZAIModule.default
      const zai = await ZAI.create()
      const trimMsgs = [conv.messages[0], ...conv.messages.slice(-16)]
      const completion = await zai.chat.completions.create({
        messages: trimMsgs,
        thinking: { type: 'disabled' },
      })
      response = completion.choices[0]?.message?.content || '[no response]'
    }

    // Agent loop: extract bash commands, run them, feed results back
    const bashBlocks = extractBashBlocks(response)
    if (bashBlocks.length > 0) {
      let toolResults = ''
      for (const cmd of bashBlocks) {
        const result = await runCommand(cmd)
        toolResults += `\n[ran: ${cmd}]\n${result}\n`
      }
      
      // Feed results back to AI for a final response
      conv.messages.push({ role: 'assistant', content: response })
      conv.messages.push({
        role: 'user',
        content: `Here are the real results from running your commands:\n${toolResults}\nNow give me a final answer based on what you actually found. Don't repeat the commands, just tell me what you learned.`,
      })

      // Get final response with tool results
      if (apiKey && baseUrl) {
        const trimMsgs = [conv.messages[0], ...conv.messages.slice(-16)]
        const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: trimMsgs,
          }),
        })
        const j = await r.json()
        response = j.choices?.[0]?.message?.content || response
      } else {
        const ZAIModule = await import('z-ai-web-dev-sdk')
        const ZAI = ZAIModule.default
        const zai = await ZAI.create()
        const trimMsgs = [conv.messages[0], ...conv.messages.slice(-16)]
        const completion = await zai.chat.completions.create({
          messages: trimMsgs,
          thinking: { type: 'disabled' },
        })
        response = completion.choices[0]?.message?.content || response
      }

      // Append tool results to the response so user sees what happened
      response = response + '\n\n---\n**Commands executed:**\n' + toolResults
    }

    conv.messages.push({ role: 'assistant', content: response })
    conv.totalMessages++

    return NextResponse.json({
      ok: true,
      response,
      personality,
      totalMessages: conv.totalMessages,
      usedByok: !!(apiKey && baseUrl),
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
