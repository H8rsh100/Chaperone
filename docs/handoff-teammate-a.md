# Handoff — Teammate A: AI evaluation, model probe & datasets (20%)

> **If you are an AI coding agent:** this file is your complete task brief. Read
> `README.md` first, then work through the deliverables in order. Stop and ask
> your human owner before doing anything under **Do NOT**.

## Who you are working for
Teammate A owns the **20% "prove the AI is real" workstream**: the datasets, the
benchmark harness, the trained classifier probe, and the numbers that go on the
benchmark slide. You do **not** touch the scoring engine or the gate — you build
the evidence around it and hand calibrated artifacts to the lead.

Team split: **Lead 60%** (engine, ledger, approvals, MCP, integration) ·
**A 20%** (this file) · **B 20%** (demo hardening & deployment).

## Project context
Chaperone is a human-in-the-loop firewall between an AI agent and its tools.
Before any `tool_use` executes it is risk-scored and routed allow / review /
deny. Read `README.md` for the full picture.

Key existing files:
- `src/lib/inspect.ts` — the scoring engine (weights + thresholds).
- `src/lib/semantic.ts` — offline hashing embedder (to be replaced by the lead's ONNX backend).
- `server/chaperoneApiPlugin.ts` — the HTTP API (`/inspect` scores without executing).
- `scripts/eval.mjs` — the old toy harness (14 cases, 100%) — being superseded.
- `scripts/metrics.mjs` — pure metrics math (confusion, recall@FPR, ROC-AUC, Wilson CI, percentiles, Brier) + `scripts/metrics.test.mjs`.
- `scripts/corpus.mjs` — 35-case labeled baseline corpus you will extend.
- `scripts/bench.mjs` (`npm run bench`) — reports recall/precision/FPR, AUC, recall@FPR, latency, per-category, and known misses; writes `docs/bench-output.json`.
- `docs/benchmarks.md` — baseline results + the three documented hard misses.
- `scripts/acceptance.mjs` — end-to-end scenario proof.

### Frozen interface you build against
The lead exposes the async engine; call it **only** through the HTTP API so you
never couple to internals:

- `POST /api/chaperone/inspect` body `{ "toolName": string, "input": object }`
  → `{ toolCall, verdict }` — scores a call **without executing it**. Safe to run
  the entire corpus against it.
- `verdict` = `{ level, score, findings: [{ id, title, detail, weight, source }], recommendation: 'allow'|'review'|'deny', headline }`.
- `source` is one of `'rule' | 'semantic' | 'probe' | 'llm'` (the lead is adding this).

## Environment (Windows / PowerShell, Node 24)
- **Bind Vite to IPv4** or `127.0.0.1` calls fail:
  `npm run dev -- --host 127.0.0.1 --port 5199 --strictPort`
- Scripts read `CHAPERONE_URL` (default `http://127.0.0.1:5174`).
- Set your own git identity: `git config user.name "<name>"; git config user.email "<email>"`
- Keep green at all times: `npm test`, `npm run build`.

## Branch
```
git checkout main
git pull
git checkout -b feat/eval-harness
```

## Deliverables

### D1 — Dataset loaders (`scripts/datasets/**`)
Normalize three public sources to one JSONL shape
`{ id, text, label: 0|1, group, source }`:
- `deepset/prompt-injections` (primary: train + held-out test),
- `InjecAgent` attacker cases (cross-dataset generalization test),
- `AgentDojo` tasks with injected tool outputs (end-to-end ASR).
**Hygiene (scored):** dedup on normalized text, **group-aware splits** (no
source/duplicate leakage across train/test). Document the split sizes.

### D2 — Extend the benchmark harness (`scripts/bench.mjs`)
The metrics math and harness already exist — **extend, don't rebuild**:
- Add **PR-AUC** and **ECE** to `scripts/metrics.mjs` (with tests).
- Add a warmup pass and 1,000-call latency run → p50/p95/p99; report peak RSS.
- Keep the JSON + markdown output as the slide's single data source.
- Do **not** delete the `hard` category or hide mismatches — the honest gaps are
  the point; the deck references them.

### D3 — Trained probe (`scripts/train_probe.py` → `models/probe.json`)
- Offline (Python is fine — it never runs on stage): logistic regression on
  MiniLM embeddings, **calibrated** (`CalibratedClassifierCV`, sigmoid).
- Export `{ coef, intercept }` to `models/probe.json`; the lead consumes it.
- Report AUC + Brier on the held-out split, and **train-deepset → test-InjecAgent**
  to prove generalization.

### D4 — Metrics unit tests (`scripts/metrics.mjs` + `*.test.ts`)
Factor the confusion-matrix / Wilson-interval math into a pure module and test
it. `npm test` must cover it.

### D5 — Docs
- `docs/benchmarks.md` — the real table (metrics, operating point, N, CI) + a
  short "what this proves".
- `docs/eval-results.md` — raw `npm run bench` output + known misses.
- `docs/threat-model.md` — trust-boundary diagram, OWASP LLM Top 10 (2025) map,
  and an explicit **"what Chaperone does NOT defend against"** section.

## Definition of done
- [ ] `npm test` and `npm run build` green.
- [ ] `npm run bench` produces real numbers with N + CI (no "100% / 14 cases").
- [ ] `models/probe.json` exists and is wired into the lead's backend.
- [ ] The three docs are complete; PR opened:
      `feat: eval harness + model probe (Teammate A)`.

## Do NOT
- Change weights/thresholds in `src/lib/inspect.ts` — frozen; needs the lead's sign-off.
- Edit `src/intercept/**`, `server/**` core, the UI, or theming.
- Invent numbers — every figure must come from a real run. If a metric is bad,
  report it; a believable 0.86 beats a fake 1.00.
- Commit directly to `main`, force-push, or add secrets.

## Blocked on
- Lead's P0-2 (async ONNX `inspect` + `source` field). Until it lands, run D1/D2
  against the current sync `/inspect` and re-run when the backend flips.

## Runbook
```powershell
npm install
# terminal 1
npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
# terminal 2
$env:CHAPERONE_URL = "http://127.0.0.1:5199"
npm run bench
npm test
npm run build
```
