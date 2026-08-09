import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ToolFn = (input: Record<string, unknown>) => Promise<unknown>

const SHELL_ALLOWLIST = new Set([
  'echo',
  'dir',
  'ls',
  'pwd',
  'whoami',
  'node',
  'npm',
])

function firstToken(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0].replace(/^.*[/\\]/, '')
}

async function runShell(input: Record<string, unknown>): Promise<unknown> {
  const command = String(input.command ?? '')
  const bin = firstToken(command)
  if (!bin || !SHELL_ALLOWLIST.has(bin)) {
    return {
      ok: false,
      blocked: true,
      reason: `Shell binary "${bin || '(empty)'}" is not on the Chaperone allowlist.`,
    }
  }

  // Windows-friendly: run via cmd /c for builtins like dir; otherwise execFile binary.
  try {
    if (process.platform === 'win32') {
      const { stdout, stderr } = await execFileAsync('cmd.exe', ['/c', command], {
        timeout: 8000,
        windowsHide: true,
        maxBuffer: 64 * 1024,
      })
      return { ok: true, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 1000) }
    }
    const { stdout, stderr } = await execFileAsync(bin, command.split(/\s+/).slice(1), {
      timeout: 8000,
      maxBuffer: 64 * 1024,
    })
    return { ok: true, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 1000) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

async function runHttp(input: Record<string, unknown>): Promise<unknown> {
  const url = String(input.url ?? '')
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'url must start with http:// or https://' }
  }
  const method = String(input.method ?? 'GET').toUpperCase()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { Accept: 'application/json,text/plain,*/*' },
    })
    const text = await res.text()
    return {
      ok: res.ok,
      status: res.status,
      body: text.slice(0, 2000),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  } finally {
    clearTimeout(timer)
  }
}

export const toolRegistry: Record<string, ToolFn> = {
  shell_command: runShell,
  http_fetch: runHttp,
}

export const chaperoneToolDefs = [
  {
    name: 'shell_command',
    description: 'Run a short shell command from a strict allowlist.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Full command line to run' },
      },
      required: ['command'],
    },
  },
  {
    name: 'http_fetch',
    description: 'Fetch a URL over HTTP(S) and return a truncated body.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', enum: ['GET', 'POST'] },
      },
      required: ['url'],
    },
  },
]
