# Chaperone

Your AI wants to run a command. You say yes or no.

Agents can read files, hit the network, and wipe data. Chaperone freezes every tool call until a human approves or blocks it. Parental controls, for AI agents.

## What you are looking at

1. An agent asks to run something dangerous (steal .env, drop a table, etc.).
2. Chaperone scores the risk and shows plain-English findings.
3. You hit **Deny** or **Approve & execute**.
4. The decision lands in an audit trail.

## Run

```bash
npm install
npm run dev
```

## Stack

- Vite + React + TypeScript
- Local risk inspector (no API keys)
- Scenario pack of realistic agent tool calls

## License

MIT
