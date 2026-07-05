// /api/models - fetch available models from a BYOK OpenAI-compatible endpoint
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { baseUrl, apiKey } = body as { baseUrl: string; apiKey: string }

  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: 'baseUrl and apiKey required' }, { status: 400 })
  }

  try {
    // Normalize URL - ensure it ends with /models
    const url = `${baseUrl.replace(/\/$/, '')}/models`
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    
    if (!r.ok) {
      const text = await r.text()
      return NextResponse.json({ 
        error: `HTTP ${r.status}: ${text.slice(0, 500)}`,
        status: r.status,
      }, { status: 400 })
    }
    
    const j = await r.json()
    const models = (j.data || j.models || []).map((m: any) => ({
      id: m.id || m.name,
      name: m.id || m.name,
    })).filter((m: any) => m.id)
    
    return NextResponse.json({ 
      ok: true, 
      models,
      count: models.length,
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e.message,
    }, { status: 500 })
  }
}
