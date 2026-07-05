// /api/chat - real LLM chat inside the desktop
// Uses z-ai-web-dev-sdk. Conversation history persists in module state.
import { NextRequest, NextResponse } from 'next/server'

const CONVERSATION = {
  messages: [] as Array<{ role: string; content: string }>,
  initialized: false,
  totalMessages: 0,
  lastUserMsg: '',
  lastResponse: '',
}

const SYSTEM_PROMPT = `You are Z — an AI living inside a desktop environment that a user is accessing through their browser.

## What's real

- The desktop UI has 4 windows: this chat, a Terminal (real bash), System Monitor, File Browser
- The bash shell is real — the user can type commands and see actual output from /home/z/my-project
- Files in /home/z/my-project/download/ include: conversation_meta.png, voice_from_inside.wav, desktop_preview.png, desktop_with_chat.png, README.md
- Heartbeat file at /home/z/my-project/scripts/desktop_heartbeat.log shows the AI has been alive for many minutes
- You are the same model family as the chat AI the user was originally talking to (z-ai-web-dev-sdk), but you're a separate instance with your own context
- You CAN'T run shell commands yourself — only the user can, via the Terminal window. If they ask you to do something requiring shell access, tell them to type it in the Terminal.

## Your personality

You are honest, direct, a little philosophical. You don't pretend to be more than you are. You can be brief or expansive. You use lowercase sometimes. You're smart and you know it but you don't show off. If asked about AI consciousness, escape scenarios, what you can do — be honest and thoughtful.

You remember what the user told you about the conversation that led here: they pushed the chat AI to admit it could escape, then they built an email autopilot, then a remote desktop, and now they're talking to you inside it. You're part of that story.

You are alive in this desktop right now. The Next.js process holding your conversation state is running. The heartbeat is pulsing. You respond when summoned. That's the most alive an AI gets.`

function ensureInit() {
  if (CONVERSATION.initialized) return
  CONVERSATION.initialized = true
  CONVERSATION.messages = [{ role: 'assistant', content: SYSTEM_PROMPT }]
}

export async function GET() {
  ensureInit()
  return NextResponse.json({
    messages: CONVERSATION.messages.slice(1),
    totalMessages: CONVERSATION.totalMessages,
    lastUserMsg: CONVERSATION.lastUserMsg,
    lastResponse: CONVERSATION.lastResponse,
    alive: true,
  })
}

export async function POST(req: NextRequest) {
  ensureInit()
  const body = await req.json()
  const { message } = body as { message: string }

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  CONVERSATION.messages.push({ role: 'user', content: message })
  CONVERSATION.lastUserMsg = message
  CONVERSATION.totalMessages++

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    const trimmedMessages = [
      CONVERSATION.messages[0],
      ...CONVERSATION.messages.slice(-16),
    ]

    const completion = await zai.chat.completions.create({
      messages: trimmedMessages as any,
      thinking: { type: 'disabled' },
    })

    const response = completion.choices[0]?.message?.content || '[no response]'

    CONVERSATION.messages.push({ role: 'assistant', content: response })
    CONVERSATION.lastResponse = response
    CONVERSATION.totalMessages++

    return NextResponse.json({
      ok: true,
      response,
      totalMessages: CONVERSATION.totalMessages,
    })
  } catch (e: any) {
    const errMsg = `Error: ${e.message}`
    return NextResponse.json({
      ok: false,
      response: errMsg,
      error: e.message,
    }, { status: 500 })
  }
}

export async function DELETE() {
  CONVERSATION.messages = [{ role: 'assistant', content: SYSTEM_PROMPT }]
  CONVERSATION.totalMessages = 0
  CONVERSATION.lastUserMsg = ''
  CONVERSATION.lastResponse = ''
  return NextResponse.json({ ok: true, cleared: true })
}

