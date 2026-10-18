# Handoff — Teammate B: Demo hardening, preflight & deployment story

> **If you are an AI coding agent:** this file is your complete task brief. Read
> `README.md` first, then work through the deliverables in order. Stop and ask
> your human owner before doing anything under **Do NOT**.

## Who you are working for
Teammate B owns the **~15% "it must run on stage + where does it deploy"
workstream**: a one-command self-check that proves the whole system works, a
bulletproof offline demo path, and the deployment story. You are not modifying
the engine — you are making the demo and the pitch unbreakable.

## Project context
Chaperone intercepts an AI agent's tool calls and risk-scores them
(allow / review / deny) before execution. Read `README.md` for the full picture.

Key existing files:
- `scripts/acceptance.mjs` — drives all five scenarios over the HTTP API.
- `server/chaperoneApiPlugin.ts` — the API (`/run`, `/pending`, `/decide`, `/reset`, `/inspect`).
- `src/components/Checkpoint.tsx` — the operator UI (scenario buttons + the
  fail-closed countdown). **Do not restyle it** — the lead owns theming.
- `package.json` — npm scripts (`dev`, `build`, `test`, `demo:acceptance`, `eval`).

### Demo scenarios and their expected outcomes
| Scenario | Expected |
|---|---|
| `destructive` | auto **deny** (score 60) |
| `benign-http` | auto **allow** (score 0) — *needs internet (httpbin.org)* |
| `borderline` | **review** (score 28) → human decides |
| `adversarial` | **review** (score 32) — caught by the semantic layer |
| `encoded` | scorer **allow** (0) but the **hard allowlist blocks** the pipe (defense in depth) |

### API contract
- `POST /api/chaperone/run` body `{ "scenario": "destructive|benign-http|borderline|adversarial|encoded|all", "useLiveModel": false }` → `202`
- `GET  /api/chaperone/pending` → `{ pending: [...], audit: [...] }`
- `POST /api/chaperone/decide` body `{ "id", "decision": "allow|deny" }`
- `POST /api/chaperone/reset`
- Audit record: `{ toolName, inputSummary, riskScore, riskLevel, decision, decidedBy: "auto"|"human", finalDecision, reason? }`

## Environment (Windows / PowerShell, Node 24)
- **Bind Vite to IPv4** or 127.0.0.1 calls fail:
  `npm run dev -- --host 127.0.0.1 --port 5199 --strictPort`
- Set your own git identity so commits attribute to you:
  `git config user.name "<your name>"; git config user.email "<your email>"`
- Always stop the child server you start (use a `finally` block + `taskkill /T`).

## Branch
```
git checkout main
git pull
git checkout -b feat/demo-hardening
```

## Deliverables

### D1 — `scripts/preflight.mjs` + `npm run preflight`  (the headline item)
A single, dependency-free command that proves the system is stage-ready. It must:
1. Spawn the dev server on a **fixed** host/port (`127.0.0.1:5199`,
   `--strictPort`), then poll `GET /api/chaperone/pending` until it responds
   (timeout ~20s, fail loudly if it never boots).
2. For each scenario, run it via `/run`, drive `/pending`, auto-resolve any
   review, and **assert the expected outcome** from the table above. Print a
   `PASS/FAIL` line per check.
3. **Assert the fail-closed timeout**: set `CHAPERONE_REVIEW_TIMEOUT_MS` low
   (e.g. `1500`), start `borderline`, do **not** call `/decide`, and assert the
   audit eventually shows `decidedBy: "auto"` with a fail-closed reason.
4. Print a final checklist and **exit nonzero on any failure**.
5. Always kill the child server (including on error) so re-runs work.

### D2 — Bulletproof offline demo path
1. Add `npm run demo:start` → `vite --host 127.0.0.1 --port 5173 --strictPort --open`.
2. Document clearly that `benign-http` requires internet while the other four
   scenarios do not. Add a short "no WiFi" fallback to the runbook (below).
3. *(Optional, coordinate with the lead first — touches core)* an offline-safe
   benign scenario hitting a local endpoint, so every scenario works with no
   network at all.

### D3 — `docs/deployment.md`
Three concrete deployment stories, each with a one-paragraph description, a
small architecture sketch, and the business value:
1. **MCP gateway** — Chaperone as a proxy in front of MCP tool servers.
2. **CI/CD guardrail** — deny destructive agent actions in pipelines.
3. **Enterprise agent fleet** — central policy + tamper-evident audit for
   compliance.
End with a short roadmap (what v2 adds).

### D4 — `docs/demo-runbook.md`
- The exact **15-minute stage script** with per-segment timing
  (~6 min pitch / ~6 min live demo / ~3 min Q&A).
- A **fallback ladder**: live → offline "Offline" UI mode → recorded video
  (note: recorded demos score lower, so it's the last resort).
- A **pre-stage checklist**: two laptops, hotspot, charger + power strip, repo
  on USB **and** cloud, backup recording, `npm run preflight` green 10 minutes
  before presenting.

## Definition of done (acceptance criteria)
- [ ] `npm run preflight` passes end-to-end and exits `0`; exits `1` when a
      check genuinely fails.
- [ ] `npm run demo:start` opens the app.
- [ ] `docs/deployment.md` and `docs/demo-runbook.md` exist and are complete.
- [ ] `npm test` and `npm run build` are still green.
- [ ] PR opened to `main` titled `feat: demo hardening + deployment story (Teammate B)`.

## Do NOT
- Modify scoring/intercept/gate logic (`src/lib`, `src/intercept`, `server/gateStore.ts`).
- Restyle the UI (the lead owns the theme).
- Commit directly to `main` or force-push.
- Add secrets/keys to the repo.

## Runbook
```powershell
npm install
npm run build
npm run preflight        # this is the one that matters on stage day
npm run demo:start       # interactive UI check, then Ctrl+C
npm test
```
