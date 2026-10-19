# Handoff — Teammate B: Demo hardening & deployment (20%)

> **If you are an AI coding agent:** this file is your complete task brief. Read
> `README.md` first, then work through the deliverables in order. Stop and ask
> your human owner before doing anything under **Do NOT**.

## Who you are working for
Teammate B owns the **20% "it must run on stage + where does it deploy"
workstream**: a one-command preflight, a bulletproof offline demo path, the
tamper-demo script, container packaging, and the run-of-show. You do not modify
the engine — you make the demo unbreakable.

Team split: **Lead 60%** (engine, ledger, approvals, MCP, integration) ·
**A 20%** (evaluation + model probe) · **B 20%** (this file).

## Project context
Chaperone intercepts an AI agent's tool calls and risk-scores them
(allow / review / deny) before execution. Read `README.md` for the full picture.

Key existing files:
- `scripts/acceptance.mjs` — drives all five scenarios over the HTTP API.
- `server/chaperoneApiPlugin.ts` — the API (`/run`, `/pending`, `/decide`, `/reset`, `/inspect`, `/healthz`, `/ledger/*`, `/mcp/*`).
- `src/components/Checkpoint.tsx` — the operator UI. **Do not restyle it** — the lead owns theming.
- `package.json` — npm scripts (`dev`, `build`, `test`, `demo:acceptance`, `mcp:demo`, `bench`).

### Demo scenarios and their expected outcomes
| Scenario | Expected |
|---|---|
| `destructive` | auto **deny** — never executes |
| `benign-http` | auto **allow** — *needs internet (httpbin.org) → replace with your local fixture* |
| `borderline` | **review** → human decides |
| `adversarial` | **review** — caught by the semantic layer |
| `encoded` | scorer allow, then **blocked by the hard allowlist** (defense in depth) |

### API contract
- `POST /api/chaperone/run` body `{ "scenario": "...", "useLiveModel": false }` → `202`
- `GET  /api/chaperone/pending` → `{ pending: [...], audit: [...] }`
- `POST /api/chaperone/decide` body `{ "id", "decision": "allow|deny", "token" }` —
  the `token` is the single-use, call-bound `decisionToken` returned on each item
  in `GET /pending`; a decision without a valid token is rejected (`401/403/409`).
- `POST /api/chaperone/reset` · `GET /api/chaperone/ledger/verify` ·
  `POST /api/chaperone/ledger/reset`
- Audit record now includes an authoritative **`outcome`**:
  `executed | blocked_by_policy | blocked_by_allowlist | denied_by_human | failed_closed | failed`.

## Environment (Windows / PowerShell, Node 24)
- **Bind Vite to IPv4**: `npm run dev -- --host 127.0.0.1 --port 5199 --strictPort`
- Set your own git identity: `git config user.name "<name>"; git config user.email "<email>"`
- Always stop the child server you start (use a `finally` block + `taskkill /T`).

## Branch
```
git checkout main
git pull
git checkout -b feat/demo-hardening
```

## Deliverables

### D1 — `scripts/preflight.mjs` + `npm run preflight` (headline item)
One dependency-free command that proves the system is stage-ready:
1. Spawn the dev server on a **fixed** `127.0.0.1:5199` (`--strictPort`), poll
   `GET /api/chaperone/pending` until it responds (timeout ~20s).
2. For each scenario, run it, drive `/pending`, auto-resolve reviews, and
   **assert the expected outcome** (table above). Print `PASS/FAIL` per check.
   Assert against the audit `outcome` field, not the legacy `decision`.
3. **Assert the fail-closed timeout**: low `CHAPERONE_REVIEW_TIMEOUT_MS` (e.g.
   `1500`), start `borderline`, do **not** decide, assert the audit shows
   `outcome: "failed_closed"`.
4. Print a final checklist, **exit nonzero on any failure**, and always kill the
   child server (including on error).

### D2 — Bulletproof offline demo path
1. `server/fixtures/http.ts` — a deterministic local JSON endpoint so
   `benign-http` works with **no network**. Point the benign scenario at it.
2. `npm run demo:start` → `vite --host 127.0.0.1 --port 5174 --strictPort --open`.
3. Document the "no WiFi" path in the runbook.

### D3 — Tamper-evident ledger demo (`scripts/verify-ledger.mjs`)
Depends on the lead's `server/audit/ledger.ts`. The script must:
1. Print `verifyChain()` → green.
2. Copy the ledger, corrupt one byte, re-verify → print `BROKEN AT ENTRY <n>`.
This is a 30-second live beat — make the output legible at a distance.

### D4 — Deployment
- `Dockerfile` (models baked in, `HEALTHCHECK` → `/healthz`), `.dockerignore`,
  `docker-compose.yml`. Container healthy in <30s with no network.
- `docs/deployment.md` — three stories: MCP gateway, CI/CD guardrail,
  enterprise agent fleet (central policy + tamper-evident audit). Short roadmap.

### D5 — UI accent + run-of-show
- `src/components/DemoBadge.tsx` — a small chip rendering `LIVE` / `SCRIPTED` /
  `FALLBACK`. The lead mounts it in `Checkpoint.tsx`; **you only create it.**
- `docs/demo-runbook.md` — the exact 15-minute script (4 min pitch / 6 min live
  demo / 5 min Q&A), a fallback ladder (live → local fixture → **live scripted
  path, never a recording**), and a pre-stage checklist (two laptops, hotspot,
  charger, repo on USB + cloud, `npm run preflight` green 10 min before).

## Definition of done
- [ ] `npm run preflight` passes end-to-end (exits `0`; exits `1` on a real failure).
- [ ] `npm run demo:start` opens the app; benign scenario works offline.
- [ ] `scripts/verify-ledger.mjs` flips green → red on demand.
- [ ] `docker compose up` reaches healthy in <30s.
- [ ] `DemoBadge.tsx` exists; docs complete; PR opened:
      `feat: demo hardening + deployment (Teammate B)`.

## Do NOT
- Modify `src/lib`, `src/intercept`, or `server` gate logic (owned by the lead).
- Restyle the UI (the lead owns the theme). Creating `DemoBadge.tsx` is the exception.
- Commit a recorded demo as the plan — recorded demos score lower at this event.
- Commit directly to `main`, force-push, or add secrets.

## Blocked on
- **(resolved)** `ledger.ts` + `verifyChain` now exist — D3 can proceed.
- **(resolved)** `GET /healthz` now returns `{ ok, model, backend, chain, entries }` —
  use it for the D4 `HEALTHCHECK`.

## Runbook
```powershell
npm install
npm run build
npm run preflight        # the one that matters on stage day
npm run demo:start       # interactive UI check, then Ctrl+C
npm test
```
