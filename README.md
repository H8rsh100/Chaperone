# Chaperone

Human-in-the-loop firewall for AI agent tool calls.

Every shell, HTTP, filesystem, database, or secrets action stops at the gate. Chaperone scores risk, surfaces findings, and waits for Approve or Deny before anything runs.

## Why it exists

Agents are shipping into production. One bad tool call can exfiltrate secrets, destroy state, or follow injected instructions. Chaperone makes the dangerous moment visible and controllable.

## Demo loop

1. Enter the checkpoint from the hero.
2. Pick an inbound tool call from the queue.
3. Read the risk score, findings, and payload.
4. Deny the bad ones. Approve the safe ones.
5. Watch the audit trail fill.

## Stack

- Vite + React + TypeScript
- Local policy inspector (no API keys required)
- Scenario pack of realistic agent tool calls

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## License

MIT
