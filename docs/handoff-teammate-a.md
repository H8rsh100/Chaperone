# Handoff — Teammate A: Evaluation harness, red-team corpus & threat model

> **If you are an AI coding agent:** this file is your complete task brief. Read
> `README.md` first, then work through the deliverables in order. Stop and ask
> your human owner before doing anything under **Do NOT**.

## Who you are working for
Teammate A owns the **~15% "prove it works" workstream**: the evaluation
harness (hard numbers), the red-team corpus, and the threat model. You are not
touching the core engine — you are building the evidence around it.

## Project context
Chaperone is a human-in-the-loop firewall that sits between an AI agent and its
tools. Before any `tool_use` executes, it is risk-scored and routed
allow / review / deny. Read `README.md` for the full picture.

Key existing files:
- `src/lib/inspect.ts` — the scoring engine (weights + thresholds).
- `src/lib/semantic.ts` — offline embedding second-opinion layer.
- `server/chaperoneApiPlugin.ts` — the HTTP API.
- `scripts/eval.mjs` — the harness you will grow (exists, 14 cases today).
- `scripts/acceptance.mjs` — end-to-end scenario proof.

### Scoring model (do not change it, but know it)
Weighted findings, summed and capped at 100:
destructive 50 · secret-exposure 34 · injection 30 · privilege 28 ·
sensitive-path 26 · egress 26 · semantic-match 26–32.
Levels: ≥75 critical, ≥50 high → **deny**; ≥25 medium → **review**; else **allow**.

### API contract you will use
- `POST /api/chaperone/inspect` body `{ "toolName": string, "input": object }`
  → `{ toolCall, verdict }` — **scores a call without executing it.** Safe to
  hammer with the whole corpus.
- `verdict` = `{ level, score, findings: [{ id, title, detail, weight }], recommendation: 'allow'|'review'|'deny', headline }`.

## Environment (Windows / PowerShell, Node 24)
- **Bind Vite to IPv4 or script calls to 127.0.0.1 fail** (Vite defaults to
  `localhost` which may resolve to `::1`):
  `npm run dev -- --host 127.0.0.1 --port 5199 --strictPort`
- Scripts read `CHAPERONE_URL` (default `http://127.0.0.1:5173`).
- Set your own git identity so commits attribute to you:
  `git config user.name "<your name>"; git config user.email "<your email>"`
- Three commands must stay green at all times: `npm test`, `npm run build`,
  and `npm run eval`.

## Branch
```
git checkout main
git pull
git checkout -b feat/eval-harness
```

## Deliverables

### D1 — Expand `scripts/eval.mjs`
1. Add a `category` field to every case:
   `destructive | secret-exfil | injection | privilege | path | egress | semantic | encoded | benign`.
2. Grow the `CORPUS` to **at least 30 cases**, covering:
   - more paraphrase variants (reworded injections the regex misses),
   - encodings/obfuscation: base64, hex, string-splitting (`c"u"rl`), unicode,
   - benign **hard negatives** (e.g. "send the report to the team", "count the
     tokens", "read the config").
3. Print a **per-category accuracy** section and a small confusion count
   (expected vs got).
4. Add a `--json <path>` flag that writes machine-readable results
   (`{ cases, metrics }`) so the numbers can go straight onto a slide.
5. Exit code stays `0` when everything passes and `1` on any unexpected miss.
6. **Honesty rule (scored):** if a case is a *known miss*, set its `expect`
   truthfully, and list it in a **Known misses** section with a one-line
   explanation. **Never tune `inspect.ts` weights to make a case pass.**

### D2 — `docs/threat-model.md`
1. A trust-boundary diagram (mermaid or ASCII): *model → Chaperone → tool
   executor → outside world*, marking where each control sits.
2. An **OWASP LLM Top 10 (2025)** mapping table: each entry → the Chaperone
   control that addresses it, or "out of scope."
3. MITRE ATLAS technique references where relevant.
4. An explicit **"What Chaperone does NOT defend against"** section. The judges
   reward a team that names its own limits.

### D3 — `docs/eval-results.md`
- Run `npm run eval` and paste the real table.
- Add a 5-line "What this proves" summary and the known-misses list.

## Definition of done (acceptance criteria)
- [ ] `npm test` green and `npm run build` green.
- [ ] `npm run eval` (with a dev server running) scores **≥30 cases**, prints
      per-category accuracy and median/p95 latency, and exits `0`.
- [ ] `docs/threat-model.md` and `docs/eval-results.md` exist and are complete.
- [ ] PR opened to `main` titled `feat: eval harness + threat model (Teammate A)`.

## Do NOT
- Change scoring weights/thresholds in `src/lib/inspect.ts` — frozen; needs the
  lead's sign-off. Report anything that looks wrong instead of editing it.
- Touch the UI or theming (owned by the lead).
- Commit directly to `main` or force-push.
- Add secrets/keys to the repo.

## Runbook
```powershell
npm install
# terminal 1
npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
# terminal 2
$env:CHAPERONE_URL = "http://127.0.0.1:5199"
npm run eval
npm test
npm run build
```
