# Chaperone

Your AI wants to run a command. You say yes or no.

Chaperone wraps an Anthropic tool-use loop so every `tool_use` block is scored by `inspect.ts` before execution. Auto-deny never runs. Review waits for a human Approve/Deny that resolves a real Promise. Allow executes the real tool.

## Live intercept (v1)

1. Enter the checkpoint.
2. Click **Demo: destructive** (auto-denied, never executed).
3. Click **Demo: benign HTTP** (auto-allowed, real fetch).
4. Click **Demo: needs review** (blocks on your Approve/Deny).
5. Or **Run all three** and watch the audit trail.

Optional live model: set `ANTHROPIC_API_KEY` and POST `{ "useLiveModel": true }` to `/api/chaperone/run`.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Tests

```bash
npm test
```

## Acceptance script

With `npm run dev` already up:

```bash
npm run demo:acceptance
```

## Stack

- Vite + React + TypeScript
- Framework-agnostic intercept adapter (`src/intercept`)
- Vite middleware gate (`server/`) for Promise-based human review
- Sandboxed shell allowlist + HTTP fetch tool registry

## License

MIT
