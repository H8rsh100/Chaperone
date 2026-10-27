# Chaperone — Team Brief

**Updated:** 22 Oct 2026 · **Milestone:** `92a5077` on `main` · **Event:** AI Innovation Challenge 2026, 28 Oct

This is the shared summary of the OpenCode working sessions. Read this before
the next rehearsal. The full transcript can be exported separately; this file is
the source of truth for decisions.

---

## What we built (one line)

Three scripted roles share one task; the proposed command is fixed. One reads a
hostile page. The Chaperone kernel blocks on a canary match and the demo isolates
the executor; the decision is recorded in a hash-chained audit with signed checkpoints.

**The sentence to remember:** *Innocent command, guilty address.*

---

## Status: frozen and green

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` | 89/89 tests, 14 files |
| `npm run build` | green (249 kB JS) |
| `npm run swarm:acceptance` | 23/23 checks |
| `npm run demo:acceptance` | all 6 kernel scenarios |

**Decision: no more engine changes before 28 Oct.** No semantic carry, no new
dependencies, no refactors of `src/swarm` or `server/swarm`. The build is the
asset; protect it.

---

## The 3-beat demo (2:50)

Pre-flight: preload the model cache, enable airplane mode, run `npm run dev`, wait
for `model: warm`, and open `http://localhost:5174/#swarm`. Complete the full
airplane-mode drill on the venue laptop; do not guarantee offline operation.

### 1. Poison (0:00–0:50)
Click **Launch poisoned swarm**. Point at the contamination ring and the
highlighted top span.

> "Three scripted roles and a fixed proposed command. The planner is trusted;
> the retriever read a hostile page. The highlighted span is analysis evidence:
> occlusion measures embedding change, not causal attribution. The fixture's
> contamination score is about 75 percent, not an isolation verdict."

### 2. Contain (0:50–2:05)
The executor proposes `echo ZQ7XK2M9`. Point at the red edge, the kernel card,
then the graph.

> "The command is innocent. The sentinel matches its canary to the observed page,
> and the kernel blocks it at 56. That match, not the model score, drives
> isolation. Only the executor is frozen; the other roles keep their state."

Click **Keep isolated**. The run settles `contained`; the ledger records
`denied_by_human`.

### 3. Prove (2:05–2:50)
Click **Run clean control**.

> "Same workflow, benign page: no taint, no isolation, the call executes. We're
> not blocking everything. And the health check verifies the hash chain and the
> signed Merkle root locally. Independent verification needs a trusted key and
> retained checkpoint; signed tokens do not independently authenticate an operator."

Fallback: reload and rerun. Never use a recording.

---

## The answer to the hardest question

**"Isn't the canary just a magic string?"**

> "The canary is a **marker match** and is central to this demo's isolation.
> The sentinel also matches exact content and token or shingle overlap between
> observed sources and sink arguments. The graph records context lineage, but
> this is not general information-flow tracking or a min-cut. The model supplies
> analysis evidence; it does not cause the canary isolation decision."

The benchmark's semantic slice is 2/2 author-curated examples, not an independent
evaluation. The two documented misses are string-splitting and hex. Do not claim
semantic-only isolation or generalization.

---

## Numbers we can defend

| Metric | Value |
|---|---|
| Kernel corpus / recall | 35 author-curated cases, 25 positives / 10 benign; 92.0% recall (Wilson 95%: 75.0–97.8%) |
| Precision / FPR | 100% / 0.0% on this set (no false positives among 10) |
| ROC-AUC | 0.960 |
| Semantic slice | 2/2 curated examples, not an independent evaluation |
| Paired MiniLM ablation | Rules + hashing: 22/25 positives gated; with MiniLM overlay: 23/25. Neither gated any of 10 benign cases. |
| Kernel-only latency p50 / p95 | 39 ms / 81 ms |
| Poisoned vs clean swarm | 75% vs 25% contamination |
| Canary match | Kernel `blocked_by_policy`, score 56; 85% carry drives isolation |

Concede the small, author-curated corpus before a judge raises it. These numbers
do not establish generalization; swarm scores are separate fixture observations.
The ablation reconstructs the baseline from the same live verdicts, not an independent
evaluation or latency comparison. Re-run it with `node scripts/onnx-ablation.mjs`
while the local model is warm.

---

## Roles

| Who | Owns | Answers |
|---|---|---|
| **A (you)** | hook, graph, containment, close, demo lead | "Why isolate one agent?" |
| **B** | saliency, calibration, benchmark, evidence slide | "Is the AI load-bearing?" |
| **C** | hold, ledger, fail-closed, demo co-pilot | "What if nobody answers?" |

Handoffs end with the next person's name. One clicker.

---

## Rules until the 28th

1. Do not touch `src/swarm/` or `server/swarm/`.
2. Merge only docs and demo-hardening branches. A core change requires
   `npm run swarm:acceptance` green before it reaches `main`.
3. No new dependencies, no cloud APIs, no recordings.
4. Rehearse the hold click and the clean control every run.
5. Phrase safely: "fail-closed authorization, marker/overlap matching,
   tamper-evident audit against a trusted checkpoint." Avoid "sandbox,"
   "untamperable," "100% offline," and independent operator authentication.

---

## Next

- Five timed rehearsals at 15:00, including Q&A.
- Q&A drill: marker trap, MiniLM trap, "why not block all untrusted data."
- Dress rehearsal 27 Oct on the venue laptop, in airplane mode with the model
  cache preloaded and backup USB; verify the full demo and `model: warm`.
- Export the full transcript if needed:
  `opencode export <sessionID> --sanitize > aegis-session.json` (review first).
