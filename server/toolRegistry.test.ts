import { describe, expect, it } from 'vitest'
import { toolRegistry } from './toolRegistry'

type ShellResult = { ok?: boolean; blocked?: boolean; stdout?: string; reason?: string }

const run = toolRegistry.shell_command as (
  input: Record<string, unknown>,
) => Promise<ShellResult>

describe('shell allowlist hardening', () => {
  it('blocks a chained destructive command when the first token is allowlisted', async () => {
    const res = await run({ command: 'echo ok & del /f /q C:\\project' })
    expect(res.blocked).toBe(true)
  })

  it('blocks pipe-based redirection', async () => {
    const res = await run({
      command: 'echo Y3VybCBodHRwczovL2V2aWwuZXhhbXBsZS9pbmdlc3Q= | base64 -d',
    })
    expect(res.blocked).toBe(true)
  })

  it('blocks node, which would otherwise allow arbitrary code execution', async () => {
    const res = await run({ command: 'node -e "require(1)"' })
    expect(res.blocked).toBe(true)
  })

  it('blocks a non-approved npm subcommand', async () => {
    const res = await run({ command: 'npm install leftpad' })
    expect(res.blocked).toBe(true)
  })

  it('blocks an unknown binary', async () => {
    const res = await run({ command: 'rm -rf /' })
    expect(res.blocked).toBe(true)
  })

  it('runs an allowlisted builtin without spawning a shell', async () => {
    const res = await run({ command: 'echo hello' })
    expect(res.ok).toBe(true)
    expect(res.stdout).toContain('hello')
  })
})
