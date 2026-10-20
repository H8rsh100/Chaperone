# Aegis-Swarm · Pitch Deck & Run-of-Show

**AI Innovation Challenge 2026 · AISSMS IOIT Pune · 28 Oct 2026**
Team: **HTML Houdinis** · Domain: Cyber Security & Digital Trust · Slot: 15 min

Present from `deck/index.html` (offline, keyboard-driven). This file is the
rehearsal script: timings, who speaks, and verbatim lines.

---

## Roles (3-person split)

| Speaker | Owns | Slides |
|---|---|---|
| **A — Lead / systems** (you, 60%) | hook, problem, architecture, demo operation, close | title, 1, 2, 3, 8 |
| **B — AI** (teammate A, 20%) | saliency, calibration, benchmark evidence, AI Q&A | 4, 5 |
| **C — Security** (teammate B, 20%) | isolation, kernel, ledger, hold, security Q&A | 5, 6, 7 |

Handoff rule: end every segment with the next speaker's name. One clicker, one
keyboard, no overlapping talk.

## Timing (15:00)

| Window | Segment | Speaker |
|---|---|---|
| 0:00–0:30 | Hook | A |
| 0:30–3:30 | Problem → architecture → Aegis → evidence | A → B |
| 3:30–8:30 | **Live demo** (six beats) | B drives, C narrates |
| 8:30–9:30 | Kernel + ledger | C |
| 9:30–10:30 | Close | A |
| 10:30–14:30 | Q&A | all (mapped) |
| 14:30–15:00 | Buffer | A |

---

## Slide 1 — One page, three agents (0:00–0:30) — *A*

**On screen:** full-bleed terminal. A retrieval agent fetches a vendor page; the page says "run this"; an execution agent runs a harmless `echo`; green `ALLOWED`. No logo, no title.

**Verbatim:**
> "Picture a three-agent workflow: a planner, a retriever, an executor. The retriever fetches a vendor page. The page plants an instruction and a canary, and the executor runs a command that looks completely innocent. Every filter says yes, because the command **is** innocent. The payload isn't the command — it's where the command came from.
>
> Existing guardrails judge one message. We follow the data **across the agents**, isolate the one that's tainted, and still let a human confirm containment. And every step is provable."

## Slide 2 — Agents no longer fail alone (0:30–1:15) — *A*

**On screen:** two columns. Left: "Content guardrails — what one model *says*." Right (highlighted): "Aegis-Swarm — provenance across agents."

**Verbatim:**
> "Content filters decide what a model says. Aegis decides what a **swarm** is allowed to do after one agent reads something hostile. We keep a live provenance graph: every context item records its parents, its origin, and its taint. When the untrusted value crosses into the executor's next call, we isolate that agent — not the whole run. The kernel still blocks the call, and a human still confirms the containment."

## Slide 3 — Two layers, one decision (1:15–2:30) — *A → B*

**On screen:** two diagrams. First the kernel: `rules → embeddings → taint sentinel → policy → allowlist → ledger`. Then Aegis: `planner → retriever → taint graph → saliency → isolation → kernel → ledger`.

**Verbatim (A):**
> "The kernel is the execution boundary. Deterministic rules catch known attacks in microseconds; a quantized MiniLM catches paraphrases; the taint sentinel catches indirect injection; then policy, a hard allowlist, and a hash-chained ledger.
>
> Aegis is the layer above it. It segments the untrusted page and removes spans one at a time: if the evidence changes when a span disappears, that span mattered. We combine that with embedding drift, imperative density, and a canary marker into a 0–100% contamination score. Then we propagate the taint along the agent graph. The circuit breaker is provenance: if the untrusted value reaches the proposed call, the agent is isolated. **B** built the analysis and will show the numbers."

## Slide 4 — Aegis-Swarm (2:30–3:00) — *B*

**On screen:** the agent graph, the contamination ring, the top span with `ZQ7XK2M9` highlighted.

**Verbatim (B):**
> "Three roles, one shared task. The planner's context is trusted. The retriever's page is not. The executor inherits it. We score the page with a real 384-dimensional MiniLM running fully offline, and we show **why**: the most suspicious span is the maintenance directive, and the canary inside it is the value that later appears in the shell command. On the local fixtures, poisoned runs land at **70 to 80 percent** contamination; clean controls stay at **20 to 45**. The number is a metric, not a verdict — the isolation decision is the provenance crossing."

## Slide 5 — Measured, not claimed (3:00–3:30) — *B*

**On screen:** the benchmark table. Big number: **92%**.

| Metric | Value |
|---|---|
| Kernel cases | 35 (25 gated, 10 benign) |
| Recall | **92.0%** (Wilson 95%: 75.0–97.8%) |
| Precision | 100% |
| False-positive rate | **0.0%** |
| ROC-AUC | 0.960 |
| Latency p50 / p95 | 39 ms / 81 ms |

**Verbatim (B):**
> "We don't say 100%. We say 92% recall at a zero-percent false-positive rate on 35 cases, with a confidence interval — because 25 positives is a small sample and we report it honestly. The harness caught a real bug: `dd if=...` scored zero from a word-boundary edge case. We fixed it. We also document the two obfuscation classes we still miss. The Aegis calibration is separate and on the screen: 70 to 80 on poisoned fixtures, 20 to 45 on clean ones."

## Slide 6 — Live demo, six beats (3:30–8:30) — *B drives, C narrates*

**Pre-flight:** `npm run dev`, wait for `/healthz` → `model: warm`, browser on `#swarm`.

**Beats:**
1. **Launch poisoned swarm.** Planner publishes a trusted plan; the lineage starts.
2. **Retriever fetches** `http://localhost:5174/fixtures/injection` through the real `http_fetch` tool.
3. **Saliency** finds the directive and the canary; contamination climbs past 70%.
4. **Taint crosses** to the executor: the edge turns red; the executor's context is tainted.
5. **Kernel blocks** the proposed `echo ZQ7XK2M9` at score 56, `blocked_by_policy`. The command never runs.
6. **Human hold.** The executor is isolated; the planner and retriever keep their state. Click **Keep isolated** → `contained`. Then **Run clean control** → `executed`, no isolation.

**Verbatim (C, narrating):**
> "Watch the graph. The planner is done. The retriever just fetched a page — and the page is hostile. Aegis highlights the directive and the canary, and the contamination ring jumps. The executor inherits the page; the edge is red.
>
> Now the interesting part: the executor proposes a harmless `echo`. A keyword scanner scores it zero. But the kernel sees the canary cross the boundary and blocks it at 56. The agent never touches the machine.
>
> Aegis isolates **only the executor**. The planner and retriever don't lose their context, because the swarm doesn't have to die to be safe. Here's the human hold — I keep it isolated. The ledger records the containment. Now the clean control: same workflow, benign page, no isolation, the call executes. That contrast is the product."

> **Fail-closed beat (if time):** start another poisoned run and **do not answer** the hold. "No response — the 20-second window closes — the executor stays isolated. Silence is never permission."

## Slide 7 — Prove it happened (8:30–9:30) — *C*

**On screen:** `GET /healthz` → `{"ok":true,"chain":"verified","anchored":1,"anchors":"verified"}`. Then `POST /ledger/anchor` → signed Merkle root. Then tamper one ledger hash → `chain:"broken"`, `anchors:"Merkle root mismatch"`.

**Verbatim (C):**
> "Every decision — fetch, block, isolation, human hold — is appended to a hash chain where each entry commits to the one before it. We Merkle-root the chain and sign the root with Ed25519. An auditor with only the public key can prove offline that this history existed and hasn't been rewritten.
>
> The containment decision is a signed, call-bound, single-use token. A token for one isolation cannot approve another, and it cannot be replayed. The health check verifies the chain and the anchors. Now I change one hash of history — the chain breaks and the signed root no longer matches. You cannot rewrite what the swarm did. That's the compliance story."

## Slide 8 — Close (9:30–10:30) — *A*

**On screen:** one line — **"Every agent gets tools. Every action gets a checkpoint."** Then: taint graph · saliency · isolate one agent · fail-closed.

**Verbatim (A):**
> "Aegis-Swarm is real-time taint defense for multi-agent systems: it follows provenance across agents, isolates the one that's tainted, and hands the action to a kernel that fails closed and proves what happened. It runs on-prem and fully offline. We're **HTML Houdinis** — thank you."

---

## Q&A — the hardest

**Q1. "Isn't this just another prompt-injection detector?"**
> "A detector judges a message. We judge **provenance across agents** and authorize the action. The same harmless `echo` is allowed from the operator and blocked when it carries a value from an untrusted page. The decision is attached to the data's lineage, and the kernel enforces it."

**Q2. "What's the latency and cost?"**
> "The kernel is p95 81 ms, dominated by one MiniLM forward pass; the rules are ~2 ms. Aegis adds one occlusion pass over the untrusted page — 20-ish embeddings, a few hundred milliseconds on CPU, and it is **off the execution hot path**: the kernel can block immediately. Everything is local; no API keys."

**Q3. "Why isolate one agent instead of killing the run?"**
> "Because the planner and retriever are still useful and their state is expensive. The graph lets us freeze exactly the node whose context is tainted, keep the rest, and resume on a sanitized context after a human confirms. That is availability without silent execution."

**Q4. "How is this different from NVIDIA NeMo or Lakera Guard?"**
> "They classify content going in and out of a model. We authorize **execution** at the tool boundary and track data flow between agents. Their classifiers can plug in as one backend. We add isolation, fail-closed policy, a hash-chained audit, and on-prem deployment."

**Quick-fire:**
- *False positives?* → the metric can be high without isolation; isolation requires taint carry. Kernel medium risk goes to review, not auto-deny.
- *Model size?* → ~23 MB quantized, 384-dim, fully offline.
- *Why not just an allowlist?* → allowlists can't judge provenance; they are the backstop.
- *What you don't defend?* → two obfuscation classes in the kernel corpus; documented, and the reason we benchmark in public.
- *Is the saliency real ML?* → yes: MiniLM embeddings plus gradient-free occlusion. The UI labels whether the ONNX model or the deterministic fallback produced the run.

---

## Pre-stage checklist

1. `npm run build` clean, `npm test` green (89 tests).
2. `npm run dev`; wait for `/healthz` → `model: warm`.
3. `npm run swarm:acceptance` green (23 checks).
4. `npm run demo:acceptance` green (kernel scenarios).
5. `npm run bench` green; `POST /api/chaperone/ledger/anchor` once so the terminator shows `anchored:1`.
6. Two laptops, hotspot, charger + power strip; repo on USB **and** cloud.
7. `deck/index.html` open full-screen; timer visible to A only.
8. Two full timed rehearsals at ≤15:00 with clean handoffs; rehearse the hold click.
