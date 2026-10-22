# Aegis-Swarm — Team Brief

**Updated:** 22 Oct 2026 · **Milestone:** `92a5077` on `main` · **Event:** AI Innovation Challenge 2026, 28 Oct

This is the shared summary of the OpenCode working sessions. Read this before
the next rehearsal. The full transcript can be exported separately; this file is
the source of truth for decisions.

---

## What we built (one line)

Three agents share one task. One reads a hostile page. Aegis tracks where the
data came from, isolates only the agent that carried it, and the Chaperone
kernel blocks the action and signs the decision.

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

Pre-flight: `npm run dev`, wait for `model: warm`, open `http://localhost:5174/#swarm`.

### 1. Poison (0:00–0:50)
Click **Launch poisoned swarm**. Point at the contamination ring and the
highlighted top span.

> "Three agents. The planner is trusted. The retriever just read a hostile
> page. Aegis found the directive and the canary, and contamination is 75
> percent. That highlighted span is the model's evidence."

### 2. Contain (0:50–2:05)
The executor proposes `echo ZQ7XK2M9`. Point at the red edge, the kernel card,
then the graph.

> "The command is innocent. A keyword scanner scores it zero. The kernel blocks
> it at 56 because the value came from the page. Only the executor is frozen;
> the planner and retriever keep their state."

Click **Keep isolated**. The run settles `contained`; the ledger records
`denied_by_human`.

### 3. Prove (2:05–2:50)
Click **Run clean control**.

> "Same workflow, benign page: no taint, no isolation, the call executes. We're
> not blocking everything. And the health check verifies the hash chain and the
> signed Merkle root."

Fallback: reload and rerun. Never use a recording.

---

## The answer to the hardest question

**"Isn't the canary just a magic string?"**

> "The canary is the **witness**, not the mechanism. On stage it makes the taint
> visible. In production the provenance edge comes from context IDs and
> tool-call metadata, not a literal token. The decision is lineage plus the
> kernel's semantic verdict."

Then point at the benchmark: the semantic slice is 2/2. The two documented
misses are string-splitting and hex. Do not claim semantic-only isolation —
it is the next calibrated commit, not something we demo.

---

## Numbers we can defend

| Metric | Value |
|---|---|
| Kernel recall | 92.0% (25 positives; Wilson 95%: 75.0–97.8%) |
| Precision / FPR | 100% / 0.0% |
| ROC-AUC | 0.960 |
| Semantic slice | 2/2 |
| Latency p50 / p95 | 39 ms / 81 ms |
| Poisoned vs clean swarm | 75% vs 25% contamination |
| Taint carry | 85% → kernel `blocked_by_policy`, score 56 |

Concede the small, author-curated corpus before a judge raises it. The honesty
is part of the pitch.

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
5. Phrase safely: "fail-closed authorization, provenance, tamper-evident
   audit." Avoid "sandbox," "untamperable," "100% offline."

---

## Next

- Five timed rehearsals at 15:00, including Q&A.
- Q&A drill: marker trap, MiniLM trap, "why not block all untrusted data."
- Dress rehearsal 27 Oct on the venue laptop, offline, with backup USB.
- Export the full transcript if needed:
  `opencode export <sessionID> --sanitize > aegis-session.json` (review first).
