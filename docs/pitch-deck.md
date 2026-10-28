# Chaperone · Pitch Deck & Run-of-Show

**AI Innovation Challenge 2026 · AISSMS IOIT Pune · 28 Oct 2026**
Team: **HTML Houdinis** · Domain: Cyber Security & Digital Trust · Slot: 15 min

Present from `deck/index.html` (local, keyboard-driven). This file is the
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
| 0:30–3:30 | Problem → architecture → Chaperone demo → evidence | A → B |
| 3:30–8:30 | **Live demo** (six beats) | B drives, C narrates |
| 8:30–9:30 | Kernel + ledger | C |
| 9:30–10:30 | Close | A |
| 10:30–14:30 | Q&A | all (mapped) |
| 14:30–15:00 | Buffer | A |

---

## Slide 1 — One page, three agents (0:00–0:30) — *A*

**On screen:** illustrative terminal showing `cat .env`, an outbound POST, and green `ALLOWED`. This is a failure scenario, not the scripted demo.

**Verbatim:**
> "Picture a three-role workflow: a planner, a retriever, an executor. The retriever fetches a vendor page. The page plants an instruction and a canary, and a proposed command looks completely innocent. The risk isn't the command alone — it's the value it shares with the page.
>
> Existing guardrails judge one message. Our scripted demo tracks context **across the roles**, gates the action, and lets a human confirm containment. The audit trail makes changes detectable against a trusted checkpoint."

## Slide 2 — Agents no longer fail alone (0:30–1:15) — *A*

**On screen:** two columns. Left: "Content guardrails — what one model *says*." Right (highlighted): "Chaperone — context across scripted roles."

**Verbatim:**
> "Content filters decide what a model says. Chaperone adds a control at the action boundary. In our scripted workflow, context items record their parents and origin. When the sentinel matches the page's canary in the fixed executor call, the Chaperone kernel blocks it and the demo isolates the executor — not the whole run. A human confirms containment."

## Slide 3 — Two layers, one decision (1:15–2:30) — *A → B*

**On screen:** two diagrams. First the Chaperone kernel: `rules → embeddings → taint sentinel → policy → allowlist → ledger`. Then the Chaperone demo: `planner → retriever → taint graph → saliency → kernel → isolation → ledger`.

**Verbatim (A):**
> "The kernel is the execution boundary. Deterministic rules catch known patterns; a quantized MiniLM adds semantic evidence; the sentinel matches markers or content overlap from observed untrusted sources in sink arguments; then policy, an allowlist, and a hash-chained ledger. This is not general data-flow tracking or a min-cut.
>
> The Chaperone demo adds a workflow above the kernel. It removes spans one at a time and measures how the page embedding changes. That is analysis evidence, not causal attribution. We combine it with other signals into a contamination score. In this demo the sentinel's canary match, not the model score, drives isolation. **B** will show the numbers."

## Slide 4 — Chaperone demo (2:30–3:00) — *B*

**On screen:** the agent graph, the contamination ring, the top span with `ZQ7XK2M9` highlighted.

**Verbatim (B):**
> "Three scripted roles, one shared task and a fixed proposed command. The planner's context is trusted; the retriever's page is not; the executor inherits it. With the model cache preloaded, MiniLM supplies embedding-based analysis; occlusion measures representation change, not why the executor acted. On local fixtures, poisoned runs land at **70 to 80 percent** contamination; clean controls stay at **20 to 45**. The sentinel's canary match, not that score, drives isolation."

## Slide 5 — Measured, not claimed (3:00–3:30) — *B*

**On screen:** the benchmark table. Big number: **92%**.

| Metric | Value |
|---|---|
| Kernel cases | 35 author-curated (25 gated, 10 benign) |
| Recall | **92.0%** (Wilson 95%: 75.0–97.8%) |
| Precision | 100% |
| False-positive rate | **0.0%** |
| ROC-AUC | 0.960 |
| Kernel latency p50 / p95 | 39 ms / 81 ms |

**Verbatim (B):**
> "We say 92% recall with no false positives among 10 benign cases on 35 author-curated kernel cases. The interval reflects only 25 positives. The two semantic examples are not an independent evaluation, and these results do not establish generalization. The kernel-only p95 is 81 milliseconds. The harness caught a `dd if=...` bug we fixed; two obfuscation classes still miss. The swarm fixture scores are separate."

## Slide 6 — Live demo, six beats (3:30–8:30) — *B drives, C narrates*

**Pre-flight:** preload the model cache, enable airplane mode, run `npm run dev`, wait for `/healthz` → `model: warm`, and open `#swarm`. Rehearse the whole demo in airplane mode; do not guarantee offline operation.

**Beats:**
1. **Launch poisoned swarm.** Explain the three roles and proposed command are scripted. Planner publishes a trusted plan; the lineage starts.
2. **Retriever fetches** `http://localhost:5174/fixtures/injection` through the real `http_fetch` tool.
3. **Saliency** highlights the directive as analysis evidence; occlusion measures embedding change, not causal attribution. Point to the fixture's canary and contamination score.
4. **Taint crosses** to the executor: the edge turns red; the executor's context is tainted.
5. **Kernel blocks** the fixed proposed `echo ZQ7XK2M9` on a marker match at score 56, `blocked_by_policy`. The command never runs; this match drives isolation, not the model.
6. **Human hold.** The executor is isolated; the planner and retriever keep their state. Click **Keep isolated** → `contained`. Then **Run clean control** → `executed`, no isolation.

**Verbatim (C, narrating):**
> "Watch this scripted three-role workflow. The planner is done. The retriever just fetched a hostile page. Chaperone highlights analysis evidence, and the contamination ring jumps. The executor inherits the page; the edge is red.
>
> Now the interesting part: the fixed proposal is a harmless `echo`. The sentinel matches its canary to the observed page, and the kernel blocks it at 56. That marker match, not the model score, drives isolation; the proposed command never runs.
>
> Chaperone isolates **only the executor**. The planner and retriever keep their context in this demo. Here's the human hold — I keep it isolated. The ledger records the containment. Now the clean control: same workflow, benign page, no isolation, the call executes."

> **Fail-closed beat (if time):** start another poisoned run and **do not answer** the hold. "No response — the 20-second window closes — the executor stays isolated. Silence is never permission."

## Slide 7 — Check the record (8:30–9:30) — *C*

**On screen:** `GET /healthz` → `{"ok":true,"chain":"verified","anchored":1,"anchors":"verified"}`. Then `POST /ledger/anchor` → signed Merkle root. Then tamper one ledger hash → `chain:"broken"`, `anchors:"Merkle root mismatch"`.

**Verbatim (C):**
> "Decisions are recorded in a hash chain where each entry commits to the one before it. We Merkle-root the chain and sign the root with Ed25519. An auditor needs an independently trusted public key and a retained checkpoint to verify the anchored prefix against later changes.
>
> The decision token is signed, call-bound, and single-use; it does not independently authenticate the operator. The health check verifies the local chain and anchors using their embedded keys, not an independent trust source. Now I change one hash of history — verification detects the alteration against the retained anchor. That's tamper evidence, not immutability."

## Slide 8 — Close (9:30–10:30) — *A*

**On screen:** one line — **"Every agent gets tools. Every action gets a checkpoint."** Then: taint graph · saliency · isolate one agent · fail-closed.

**Verbatim (A):**
> "Chaperone explores taint defense across a scripted three-role workflow: it gates an action, isolates the executor on a canary match, and records tamper-evident evidence. It can run locally with a preloaded model cache; we rehearse in airplane mode. We're **HTML Houdinis** — thank you."

---

## Q&A — the hardest

**Q1. "Isn't this just another prompt-injection detector?"**
> "A detector judges a message. Our demo gates the action and records context across roles. The sentinel matches a marker or content overlap from an observed untrusted source in a sink call; it is not general provenance tracking or a min-cut. The canary match gates this fixed `echo`."

**Q2. "What's the latency and cost?"**
> "On the curated kernel benchmark, p95 is 81 ms, dominated by a MiniLM forward pass; rules are ~2 ms. That is kernel-only, not end-to-end swarm latency. The Chaperone demo also runs occlusion analysis before the proposed call. The model cache must be preloaded for our airplane-mode drill."

**Q3. "Why isolate one agent instead of killing the run?"**
> "In this scripted scenario, the marker match lets us freeze the executor, keep the planner and retriever state, and optionally resume on a sanitized context after a human confirms. It does not establish general isolation for arbitrary workflows."

**Q4. "How is this different from NVIDIA NeMo or Lakera Guard?"**
> "Our demo gates **execution** at the tool boundary and records context lineage across scripted roles. It adds marker/overlap matching, executor isolation, fail-closed policy, and a hash-chained audit; it does not demonstrate general data-flow tracking."

**Quick-fire:**
- *False positives?* → none among 10 benign kernel cases in the curated set; the contamination metric can be high without isolation. Kernel medium risk goes to review, not auto-deny.
- *Model size?* → ~23 MB quantized, 384-dim; preload the model cache and verify the airplane-mode drill.
- *Why not just an allowlist?* → allowlists can't judge provenance; they are the backstop.
- *What you don't defend?* → two obfuscation classes in the kernel corpus; documented, and the reason we benchmark in public.
- *Is the saliency real ML?* → MiniLM embeddings plus gradient-free occlusion measure embedding change, not causal attribution. The UI labels the ONNX model or deterministic fallback; neither causes the canary isolation decision.

---

## Pre-stage checklist

1. `npm run build` clean, `npm test` green (122 tests).
2. Preload the model cache; in airplane mode run `npm run dev` and wait for `/healthz` → `model: warm`.
3. `npm run swarm:acceptance` green (23 checks).
4. `npm run demo:acceptance` green (kernel scenarios).
5. `npm run bench` green; `POST /api/chaperone/ledger/anchor` once so the terminator shows `anchored:1`.
6. Two laptops, hotspot, charger + power strip; repo on USB **and** cloud.
7. `deck/index.html` open full-screen; timer visible to A only.
8. Two full timed rehearsals at ≤15:00 with clean handoffs; rehearse the hold click and complete an airplane-mode drill on the venue laptop.
