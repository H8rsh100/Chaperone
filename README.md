# Chaperone

Human-in-the-loop firewall for AI agent tool calls.

Chaperone runs a **real Anthropic tool-use loop**. Every `tool_use` block is scored by `inspect.ts` **before** execution. Auto-deny never runs the tool. Review **genuinely suspends the agent** on a Promise until you Approve or Deny in the UI. Allow executes **real** shell (allowlisted) or HTTP fetch.

Parental controls, for AI agents. Defense in depth: risk scoring **plus** a hard shell allowlist, so a bad approve still cannot run arbitrary binaries.

## Put this on the dashboard

**Pitch line:** Watch a real agent try something destructive and get blocked live.

What is true in this repo today:

- Real intercept path (not a scripted UI fake)
- Real tool execution (`shell_command`, `http_fetch`)
- Human approval that actually blocks the agent loop
- Acceptance script that hits the live HTTP API for all three scenarios

## Live demo (UI)

```bash
npm install
npm run dev
```

Open http://localhost:5173 → **Enter checkpoint** → use:

| Button | What happens |
|---|---|
| **Demo: destructive** | Auto-denied. Tool never executes. |
| **Demo: benign HTTP** | Auto-allowed. Real fetch runs. |
| **Demo: needs review** | Agent waits. Your Approve/Deny resolves the Promise. |
| **Run all three** | Full acceptance trio in one pass. |

Optional live model: set `ANTHROPIC_API_KEY`, then POST `/api/chaperone/run` with `{ "useLiveModel": true }`. Without a key, demo mode still drives the **same** intercept + gate + execution path with scripted `tool_use` blocks.

## Acceptance script (API proof)

With `npm run dev` already running:

```bash
npm run demo:acceptance
```

This exercises destructive, benign HTTP, and review through `/api/chaperone/*` (the same gate the UI uses).

## How the gate works

1. Model returns `tool_use` (Anthropic Messages API, or demo scripted blocks).
2. `runWithChaperone` maps it and runs `inspect.ts`.
3. **deny** → synthetic `tool_result`, no execute, audit logged.
4. **review** → `requestHumanDecision()` waits on a Promise; Checkpoint Approve/Deny resolves it.
5. **allow** → `toolRegistry` runs the real tool; result feeds back into the loop.

Shell commands hit a **strict allowlist** even after allow (second layer).

## Tests

```bash
npm test
```

Includes EGRESS_RE hardening tests: real exfil-shaped calls match; `const fetch = ...`, `refetchData`, and axios-in-a-comment do not.

## Stack

- Vite + React + TypeScript
- Framework-agnostic intercept (`src/intercept`)
- Vite middleware gate (`server/`) for Promise-based human review
- Session-only in-memory audit/pending store (intentional for v1)

## Explicit non-goals (v1)

- No Redis / DB persistence
- No OpenAI or LangChain adapters yet
- No streaming responses

## License

MIT
