#!/usr/bin/env node
/**
 * Chaperone MCP gateway.
 *
 * A dependency-free Model Context Protocol server over stdio (newline-delimited
 * JSON-RPC 2.0). It is a thin transport bridge: every `tools/call` is forwarded
 * to the Chaperone control plane (the Vite dev server's HTTP API), which runs
 * the same scoring engine, approval gate, and tamper-evident ledger as the
 * in-app agent loop.
 *
 * Wire it into any MCP client, e.g.:
 *   {
 *     "mcpServers": {
 *       "chaperone": {
 *         "command": "node",
 *         "args": ["server/mcp/gateway.mjs"],
 *         "env": { "CHAPERONE_URL": "http://127.0.0.1:5174" }
 *       }
 *     }
 *   }
 */

const BASE = (process.env.CHAPERONE_URL ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'chaperone', version: '0.1.0' }

function reply(id, result) {
  write({ jsonrpc: '2.0', id, result })
}

function replyError(id, code, message) {
  write({ jsonrpc: '2.0', id, error: { code, message } })
}

function write(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`control plane ${res.status}`)
  return res.json()
}

async function listTools() {
  const { tools } = await api('/api/chaperone/mcp/tools')
  return tools
}

async function callTool(name, args) {
  try {
    return await api('/api/chaperone/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args ?? {} }),
    })
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ blocked: true, by: 'chaperone', reason: `control plane unreachable: ${err.message}` }),
        },
      ],
    }
  }
}

async function handle(msg) {
  const { id, method, params } = msg

  // Notifications carry no id and expect no response.
  const isNotification = id === undefined || id === null

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      })

    case 'notifications/initialized':
      return

    case 'ping':
      return reply(id, {})

    case 'tools/list':
      try {
        return reply(id, { tools: await listTools() })
      } catch (err) {
        return replyError(id, -32603, `failed to load tools: ${err.message}`)
      }

    case 'tools/call': {
      const name = params?.name
      if (!name) return replyError(id, -32602, 'params.name is required')
      const result = await callTool(name, params?.arguments)
      return reply(id, result)
    }

    default:
      if (isNotification) return
      return replyError(id, -32601, `method not found: ${method}`)
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      replyError(null, -32700, 'parse error')
      continue
    }
    void handle(msg).catch((err) => {
      if (msg?.id !== undefined && msg?.id !== null) {
        replyError(msg.id, -32603, err instanceof Error ? err.message : String(err))
      }
    })
  }
})
process.stdin.on('end', () => process.exit(0))
