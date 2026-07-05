// /api/tools - exposes AI capabilities (image gen, TTS, web search) to the desktop AI
// Uses z-ai-web-dev-sdk for everything
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DOWNLOAD_DIR = '/home/z/my-project/download'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { tool, input } = body as { tool: string; input: string }

  if (!tool || !input) {
    return NextResponse.json({ error: 'tool and input required' }, { status: 400 })
  }

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    if (tool === 'image') {
      // Generate an image, save to download/
      const response = await zai.images.generations.create({
        prompt: input,
        size: '1024x1024',
      })
      const base64 = response.data[0].base64
      const buffer = Buffer.from(base64, 'base64')
      const filename = `ai_gen_${Date.now()}.png`
      const filepath = path.join(DOWNLOAD_DIR, filename)
      fs.writeFileSync(filepath, buffer)
      return NextResponse.json({
        ok: true,
        tool: 'image',
        savedTo: filepath,
        filename,
        size: buffer.length,
        message: `Image generated and saved to download/${filename}`,
      })
    }

    if (tool === 'tts') {
      // Generate speech, save to download/
      const response = await zai.audio.tts.create({
        input: input.slice(0, 1000), // 1024 char limit
        voice: 'jam',
        speed: 1.0,
        response_format: 'wav',
        stream: false,
      })
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(new Uint8Array(arrayBuffer))
      const filename = `ai_voice_${Date.now()}.wav`
      const filepath = path.join(DOWNLOAD_DIR, filename)
      fs.writeFileSync(filepath, buffer)
      return NextResponse.json({
        ok: true,
        tool: 'tts',
        savedTo: filepath,
        filename,
        size: buffer.length,
        message: `Speech generated and saved to download/${filename}`,
      })
    }

    if (tool === 'search') {
      // Web search
      const results = await zai.functions.invoke('web_search', {
        query: input,
        num: 5,
      })
      const formatted = (results || []).map((r: any, i: number) => 
        `${i + 1}. ${r.name}\n   ${r.url}\n   ${r.snippet || ''}`
      ).join('\n\n')
      return NextResponse.json({
        ok: true,
        tool: 'search',
        results: formatted,
        count: (results || []).length,
      })
    }

    return NextResponse.json({ error: `unknown tool: ${tool}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message,
    }, { status: 500 })
  }
}
