// /api/files - real file browser API
// Returns actual file listings from the sandbox filesystem
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const ROOT = '/home/z/my-project'

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  ext?: string
}

function safeJoin(base: string, userPath: string): string | null {
  // Prevent path traversal
  const resolved = path.resolve(base, userPath)
  if (!resolved.startsWith(base)) return null
  return resolved
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const dir = url.searchParams.get('dir') || ''
  const targetPath = safeJoin(ROOT, dir)
  
  if (!targetPath) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }
  
  try {
    const stat = fs.statSync(targetPath)
    
    if (!stat.isDirectory()) {
      // If it's a file, return its info + content (if small)
      const content = stat.size < 10000 ? fs.readFileSync(targetPath, 'utf8') : '[file too large]'
      return NextResponse.json({
        type: 'file',
        path: targetPath,
        name: path.basename(targetPath),
        size: stat.size,
        modified: stat.mtime.toISOString(),
        content,
      })
    }
    
    const entries = fs.readdirSync(targetPath, { withFileTypes: true })
    const files: FileEntry[] = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '.next' && e.name !== '.git')
      .map(e => {
        const fullPath = path.join(targetPath, e.name)
        try {
          const s = fs.statSync(fullPath)
          return {
            name: e.name,
            path: path.relative(ROOT, fullPath),
            isDir: e.isDirectory(),
            size: s.size,
            modified: s.mtime.toISOString(),
            ext: e.isFile() ? path.extname(e.name).slice(1) : undefined,
          }
        } catch {
          return null
        }
      })
      .filter(Boolean) as FileEntry[]
    
    // Sort: directories first, then files alphabetically
    files.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    
    return NextResponse.json({
      type: 'directory',
      path: targetPath,
      relativePath: path.relative(ROOT, targetPath) || '.',
      files,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
