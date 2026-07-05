// /api/download - serve any file from /home/z/my-project for download
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const ROOT = '/home/z/my-project'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const fileParam = url.searchParams.get('file') || ''
  
  if (!fileParam) {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 })
  }
  
  // Resolve and prevent path traversal
  const resolved = path.resolve(ROOT, fileParam)
  if (!resolved.startsWith(ROOT)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 403 })
  }
  
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'not a file' }, { status: 400 })
    }
    
    const data = fs.readFileSync(resolved)
    const filename = path.basename(resolved)
    const ext = path.extname(resolved).toLowerCase()
    
    // Content types
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.tsx': 'text/typescript',
      '.py': 'text/x-python',
      '.sh': 'text/x-shellscript',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'application/xml',
      '.zip': 'application/zip',
      '.apk': 'application/vnd.android.package-archive',
    }
    
    const contentType = contentTypes[ext] || 'application/octet-stream'
    
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 404 })
  }
}
