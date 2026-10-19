# Chaperone MCP gateway

Chaperone exposes the same gate — scoring, human review, signed approvals, and
the tamper-evident ledger — as a **Model Context Protocol** server, so any MCP
client (Claude Desktop, an agent framework, a custom loop) gets a checkpoint on
every tool call without changing its own code.

No SDK dependency: the gateway is a zero-dependency stdio bridge that speaks
newline-delimited JSON-RPC 2.0 and forwards each call to the Chaperone control
plane.

```
MCP client  ──stdio/JSON-RPC──▶  server/mcp/gateway.mjs  ──HTTP──▶  control plane
 (agent)                          (thin bridge)          (scoring · gate · ledger)
```

## Run it

1. Start the control plane: `npm run dev`
2. Wire it into an MCP client:

```json
{
  "mcpServers": {
    "chaperone": {
      "command": "node",
      "args": ["server/mcp/gateway.mjs"],
      "env": { "CHAPERONE_URL": "http://localhost:5174" }
    }
  }
}
```

## Prove it

`npm run mcp:demo` (control plane running) drives the gateway exactly as a real
client would and prints the JSON-RPC exchange. It covers:

| Beat | Call | Outcome |
|---|---|---|
| 3 | `rm -rf ../.ssh` | `blocked_by_policy` (auto) |
| 4 | `echo hello from mcp` | `executed` |
| 5 | base64 exfil via pipe | `blocked_by_allowlist` (defense in depth) |
| 6 | borderline call, no answer | `denied_by_human` via signed token |

## Protocol surface

- `initialize`, `notifications/initialized`, `ping`
- `tools/list` → `shell_command`, `http_fetch` (from `chaperoneToolDefs`)
- `tools/call` → gated; blocked calls return MCP `isError: true` with the
  reason, never touching the host.

## Endpoints (control plane)

- `GET  /api/chaperone/mcp/tools` — the advertised manifest
- `POST /api/chaperone/mcp/call` — gate + execute one call, returns
  `{ content, isError?, outcome, decision, decidedBy }`

In-band errors keep HTTP 200: MCP encodes failure in the result, not the status.

## Trust boundary

The gateway trusts the control plane on localhost and adds no auth of its own —
it is a same-host transport. The control plane owns policy, approval tokens
(single-use, call-bound, expiring), and the ledger. Do not expose either port
to untrusted networks; the MCP manifest is a capability list and should be
scoped to the tools you intend to grant.
