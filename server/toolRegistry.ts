import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readdirSync } from 'node:fs'
import { userInfo } from 'node:os'

const execFileAsync = promisify(execFile)

export type ToolFn = (input: Record<string, unknown>) => Promise<unknown>

/**
 * Layer-two hard allowlist. A command is validated as a token stream and every
 * shell metacharacter is rejected BEFORE anything executes. This closes the
 * classic bypass where the first token is allowlisted but the tail chains a
 * destructive command (e.g. `echo ok & del /f /q C:\...`).
 */
const METACHAR_RE = /[&|;<>`$(){}^!\n\r%*?~]/

/** Pure-JS builtins — these never spawn a process. */
const BUILTINS = new Set(['echo', 'pwd', 'whoami', 'ls', 'dir'])

/**
 * The only external binary we spawn, with a fixed argv. These are exact
 * commands, not a subcommand prefix: `npm run <anything>`, `npm ci` (install
 * lifecycle scripts), and appended args are all rejected. This is an
 * authorization rule, not a sandbox.
 */
const NPM_ALLOWED = new Set(['test', 'run build'])

function tokenize(command: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(command)) !== null) tokens.push(m[1] ?? m[2] ?? m[3])
  return tokens
}

type Validation = { ok: true; tokens: string[] } | { ok: false; reason: string }

function validate(command: string): Validation {
  const trimmed = command.trim()
  if (!trimmed) return { ok: false, reason: 'Empty command.' }
  if (METACHAR_RE.test(trimmed)) {
    return {
      ok: false,
      reason:
        'Command contains shell metacharacters (chaining, redirection, or expansion is not permitted).',
    }
  }
  const tokens = tokenize(trimmed)
  if (tokens.length > 32) return { ok: false, reason: 'Command has too many tokens.' }
  if (tokens.some((t) => /\s/.test(t))) {
    return { ok: false, reason: 'Quoted arguments containing whitespace are not permitted.' }
  }
  return { ok: true, tokens }
}

function firstToken(tokens: string[]): string {
  return (tokens[0] ?? '').replace(/^.*[/\\]/, '').toLowerCase()
}

function runBuiltin(bin: string, tokens: string[]): unknown {
  switch (bin) {
    case 'echo':
      return { ok: true, stdout: tokens.slice(1).join(' ') }
    case 'pwd':
      return { ok: true, stdout: process.cwd() }
    case 'whoami':
      return { ok: true, stdout: userInfo().username }
    case 'ls':
    case 'dir':
      return { ok: true, stdout: readdirSync(process.cwd()).join('\n').slice(0, 4000) }
    default:
      return { ok: false, blocked: true, reason: `Builtin "${bin}" is not implemented.` }
  }
}

async function runShell(input: Record<string, unknown>): Promise<unknown> {
  const command = String(input.command ?? '')
  const check = validate(command)
  if (!check.ok) {
    return { ok: false, blocked: true, reason: `Blocked by Chaperone allowlist: ${check.reason}` }
  }

  const tokens = check.tokens
  const bin = firstToken(tokens)

  if (BUILTINS.has(bin)) return runBuiltin(bin, tokens)

  if (bin !== 'npm') {
    return {
      ok: false,
      blocked: true,
      reason: `Shell binary "${bin || '(empty)'}" is not on the Chaperone allowlist.`,
    }
  }

  // Exact argv match. Extra tokens, arbitrary scripts, and lifecycle hooks
  // (`ci`, `run <script>`, `--` args) never reach cmd.exe.
  const args = tokens.slice(1)
  const npmArgs = args.map((token) => token.toLowerCase())
  const safeCommand = [bin, ...npmArgs].join(' ')
  if (!NPM_ALLOWED.has(npmArgs.join(' '))) {
    return {
      ok: false,
      blocked: true,
      reason: `"${safeCommand}" is not an approved npm command. Only "npm test" and "npm run build" are permitted.`,
    }
  }

  try {
    if (process.platform === 'win32') {
      // Validated above: no metacharacters and no whitespace inside args, so
      // cmd.exe receives a command string it cannot chain or redirect.
      const { stdout, stderr } = await execFileAsync(
        process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', safeCommand],
        { timeout: 15000, windowsHide: true, maxBuffer: 64 * 1024 },
      )
      return { ok: true, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 1000) }
    }
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: 15000,
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
