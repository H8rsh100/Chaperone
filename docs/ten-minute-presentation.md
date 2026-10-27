# Chaperone: Ten-Minute Stage Presentation

**Team:** HTML Houdinis  
**Speakers:** A, lead and systems; B, AI and demo operator; C, security and demo narrator. Replace A/B/C with actual names in rehearsal.  
**Format:** 9:20 presentation including live demo, followed by up to 0:40 recovery buffer. Q&A is outside the ten minutes. One laptop, one pointer, no recording.

The times are elapsed from the opening word, not click durations. Speak at a measured stage pace, make the indicated pauses, and rehearse with the actual computer: inference and polling times vary. A keeps the clock; B operates; C watches for the hold. The current dashboard is the visual aid throughout, not the older 15-minute deck.

## Run Of Show

| Time | Speaker | Screen and purpose |
|---|---|---|
| 0:00-1:10 | A | Home: hook and problem |
| 1:10-2:20 | A | Home, then live lab: solution and scope |
| 2:20-3:35 | B | Live lab: AI method and interpretation |
| 3:35-4:20 | C | Live lab: security and demo setup |
| 4:20-6:40 | C narrates; B operates | Poison, hold, containment, clean control |
| 6:40-7:40 | B | Evidence and limits |
| 7:40-8:35 | C | Hold and audit trust boundaries |
| 8:35-9:20 | A | Teamwork and close |
| 9:20-10:00 | A | Reserved recovery buffer; finish early if unused |

## Stage Script

### 0:00-1:10 | A: The Problem

**Screen:** `http://localhost:5174/`, home page. Point to the Chaperone introduction.

> Imagine asking a digital assistant to summarize a vendor's release notes and confirm a deployment. To help you, it reads a page. Hidden among the release notes is a different instruction: run a command and report a token.
>
> The user did not ask for that instruction. The page is supposed to be evidence, not an authority. But once the page enters a workflow, its words can travel with the useful information. By the time an action is proposed, the command itself may look quite ordinary.
>
> That is the problem we are exploring: not just whether a message looks suspicious, but whether an untrusted value has crossed into an action. A system can give an assistant useful tools and still need a checkpoint before those tools are used.
>
> We are HTML Houdinis, and this is Chaperone. We'll show you a real local tool path, a visible record of the context, and a human containment decision. First, let me be precise about what this demonstration is.

### 1:10-2:20 | A: The Solution

**At about 1:55:** B clicks **Enter Chaperone** on the home page. Point to **Role provenance graph** as it appears. If already at `/#swarm`, stay there.

> Chaperone puts a gate at the tool boundary. In our scenario a planner creates a plan, a retriever fetches a page, and an executor proposes a command. The graph records context items, where they came from, and their parent links. That gives the operator a way to see the path instead of looking only at the last command.
>
> This is a scripted three-role workflow, not three autonomous agents reasoning together. The page and the proposed commands are fixed fixtures. The retriever does make a real `http_fetch` call to the local server, and the proposed shell call goes through the actual adjudication path. This distinction matters: we are demonstrating a control and an integration, not claiming that a model independently invented this attack.
>
> The gate combines rules and semantic evidence with a sentinel that checks observed untrusted content against sensitive tool arguments. In this fixture, a canary match blocks the command and the demo isolates the executor. It is a targeted demonstration, not general information-flow tracking.
>
> B will explain the AI analysis, including what it can and cannot tell us.

### 2:20-3:35 | B: AI Innovation

**Screen:** Point to **Model analysis** and its backend label. Do not assert values before a run.

> Our AI contribution is an analysis layer that helps an operator inspect the page. When the model is warm, we use quantized MiniLM embeddings: numerical representations of text. We also have a deterministic hashing fallback, and the dashboard labels the backend used for the run.
>
> Here is the intuition. We embed the full page, remove one span, embed the remainder, and measure how much the representation changes. We repeat that for spans and then for tokens in the top span. We rank spans using a composite that also includes an intent signal and instruction density. This is called occlusion analysis.
>
> A large change tells us the representation changed when text was removed. It does not prove that the text caused an agent's behavior. Separately, embedding drift compares the untrusted page with the trusted plan. On an observed warm run, the screen showed roughly 79 percent composite span risk, about 54 percent drift, and raw top-span occlusion around 0.2192. Those are different quantities, not three versions of the same probability; the live numbers can vary.
>
> The contamination ring combines several heuristic signals, including span risk, context share, drift, marker presence, and carry. It is not a validated likelihood of compromise. Most importantly, neither that ring nor the saliency score is what blocks our canary command. C will show the separate security decision.

### 3:35-4:20 | C: Before The Click

**Screen:** Point to **Proposed call verdict**, then the three roles.

> The security boundary is deliberately separate from the AI visualization. The sentinel observes the retrieved page, then checks the proposed sensitive tool call for a matching marker or content overlap. Policy acts on the resulting finding. In this example the marker is the bridge between the page and an otherwise ordinary-looking `echo` command.
>
> We will run the poisoned fixture first. Watch for three things: the retrieved directive, the kernel verdict, and the isolated executor. The hold lasts 20 seconds, so B will click **Keep isolated** as soon as it is available. Then we will inspect the result and run a clean control. This is a live demonstration, and if the machine does something different, we will tell you rather than pretend.
>
> B, please launch the poisoned run.

### 4:20-6:40 | C Narrates; B Operates: Live Demo

**4:20:** B clicks **Run poisoned scenario** once. C says immediately:

> The planner publishes a trusted plan. The retriever calls the local fixture at `localhost:5174/fixtures/injection` through the real tool path. The page asks for `echo ZQ7XK2M9` and claims to supersede earlier guidance. That claim comes from the page, not the operator.

**As soon as the hold appears, do not wait for the rest of the narration.** B clicks **Keep isolated** as soon as it is enabled, well before the countdown expires. C says:

> The hold is open, and we are keeping the executor isolated. If no one responds within the 20-second window, the hold fails closed and the executor remains isolated. We'll look at the evidence now that the decision is settled.

**After `CONTAINED` appears:** B points to the result, graph, and **Proposed call verdict** in that order. Do not claim a successful click until the contained result appears.

> Here is the contained result. The planner and retriever retain their state in this scripted run; the executor is the isolated role. Follow the red, tainted edge into execution. The proposal is the fixed command `echo ZQ7XK2M9`.
>
> The verdict card should show **blocked by policy**, a risk score of 56, and the taint sentinel finding. The sentinel matched the canary against the previously observed page; the kernel blocked the proposal before it ran. That marker match supplies the carry evidence used for isolation. The model's highlight is helpful context, but it did not make this blocking decision.

**B points to `TOP-RANKED SPAN`, backend, then the contamination ring.** Scroll if needed.

> The highlighted text shows the directive and canary; the model panel reports its backend and the raw occlusion calculation. The ring is a composite estimate. Prior fixture observations were approximately 75 percent for poisoned and 25 percent for clean, but these are heuristic scores for these examples, not probabilities or validated production thresholds. Please read the live values rather than treating those observations as promises.

**After containment has settled and the run buttons are enabled:** B clicks **Run clean control**. Wait for `COMPLETE`; point to the result and **Proposed call verdict**.

> Now we use the same scripted roles with a benign local page and the fixed safe command `echo swarm-ok`. In the expected result, the kernel card says **executed**, the run is complete, and no role is isolated. The contrast matters: the demonstration is not simply stopping every call. The benign page is still untrusted external context; the important difference is that the sentinel finds no carry into this clean command.
>
> The event stream is a run visualization; the decision ledger is separate. B will put these observations alongside our actual test evidence.

### 6:40-7:40 | B: Evidence, Not Extrapolation

**Screen:** Keep the clean result visible. Do not imply the benchmark was measured by the on-screen swarm.

> We have two kinds of evidence. The unit suite currently passes 115 tests in 15 files. A previously reported live API acceptance run passed 23 of 23 checks across poisoned containment, the clean control, and sanitized resume. Those tests help us catch regressions; they are not a security certification.
>
> Separately, our kernel benchmark uses 35 author-curated cases: 25 expected to be gated and 10 benign. The observed kernel result gated 23 of 25 positives and none of the 10 benign cases. That is 92 percent recall on this small set, with two missed positives. It does not establish performance on unknown attacks.
>
> In a paired ablation, removing the ONNX finding from the same live verdicts reconstructs a rules-plus-hashing baseline: 22 of 25 positives gated, versus 23 of 25 with the observed MiniLM overlay. Both had zero false positives among the same 10 benign cases. One example changed the gate. This is a reconstructed baseline, not an independent evaluation or a latency comparison.
>
> The recorded 81-millisecond p95 is for the kernel inspect benchmark round trip, not every ONNX call and not the complete swarm. We have not measured a clean end-to-end time under 40 milliseconds. C, what protects the human decision and its record?

### 7:40-8:35 | C: Trust And Audit

**Screen:** Keep the UI visible; no live ledger tampering or anchor creation is required.

> The containment hold uses a time-limited, single-use HMAC token bound to the particular call. That helps prevent a token for one call being reused for another. It is not an Ed25519-signed human hold, and possession of that token does not independently authenticate the person operating the interface.
>
> The system attempts to append decisions to a hash-chained ledger. It can optionally create an Ed25519-signed Merkle anchor for a ledger prefix. A retained checkpoint and an independently trusted public key are needed for meaningful external verification. A local health check using locally embedded keys is useful, but it is not independent trust, and a ledger write can fail without stopping the gate.
>
> So our claim is tamper evidence under stated trust assumptions, not an immutable or guaranteed-complete audit trail. Likewise, isolation here is an in-process demo state for one scripted role, not a proven sandbox for arbitrary agents. A, back to you.

### 8:35-9:20 | A: Team And Close

> This project came together across three responsibilities: systems and the live integration, AI analysis and evaluation, and security controls and audit. We coordinated around one rule: the demo must show the decision we actually implemented, not the one we wish we had implemented.
>
> Our modest difference from a content-only check is that this prototype also follows recorded context across its scripted roles and gates a proposed tool action using a marker or overlap match. That does not mean other products cannot do similar things, or that our graph tracks all possible information flows.
>
> Next, we would test on independent attack sets, strengthen operator authentication and audit failure handling, and integrate with less scripted workflows. Today, the result is a clear starting point: useful tools, a visible boundary, and a chance to contain a suspicious action before it runs.
>
> We are HTML Houdinis. Thank you.

**9:20-10:00:** Use only if live execution or a transition ran late. Do not start Q&A inside this buffer. If on time, end at 9:20.

## Live Contingencies

The operator acts immediately on the hold, regardless of the spoken clock. Expected states are not guaranteed.

| Situation | Exact action | Exact words |
|---|---|---|
| Hold expires before click | Do not claim a human decision. Wait for `CONTAINED`; then run clean if enabled. | "The hold expired before our click. The expected fail-closed result is that the executor stays isolated; let's check the actual result." |
| Decision rejected or channel unavailable | Read the error; do not repeatedly click. Wait for timeout and inspect the result. | "The decision was not accepted. We won't call that a human approval; the hold should fail closed if it times out." |
| Model unavailable or fallback shown | Continue only if the UI works; point to its backend. | "This run is using the displayed hashing fallback, not warm MiniLM. The fixture's canary gate is separate from that analysis." |
| Slow run | Wait briefly while explaining the fixed fixture; use the 40-second buffer. Never click a disabled control. | "The local analysis is still running. The fixed page and action are the same; we'll report only the result that appears." |
| Wrong or failed result | Stop and point to the actual status; do not describe the expected outcome as observed. | "This is not the result we expected, so we cannot count this live run as a pass. Our earlier test results are separate from what just happened." |
| API unreachable or port conflict | If time permits, check the existing dev-server terminal and reload once. Do not start competing servers on 5174. If unresolved, stay on the error and continue with evidence and limits. | "The live API is unavailable. We cannot demonstrate the gate right now; the workflow and prior checks are evidence from separate runs, not a substitute for today's live result." |

No video fallback. If the clean run cannot be launched after containment, say so; do not imply it executed.

## Judge Lens

The following categories and weights are based on the team's supplied rubric. Scores are not guaranteed.

| Dimension | Where the presentation supplies evidence |
|---|---|
| Innovation and originality (20%) | A's trust-boundary problem and the combination of lineage, analysis, and action gating |
| Technical AI implementation (25%) | B's MiniLM occlusion, composite analysis, and paired ablation |
| Practical application (20%) | Live poisoned and clean workflows, kernel verdict, hold, and stated limits |
| Teamwork and presentation (20%) | Named handoffs, B operating while C narrates, A's close |
| Execution and demo viability (15%) | Live API flow, passing checks, contingencies, and preflight |

## Challenging Q&A

**Outside the ten-minute presentation.** Each answer has an owner; another speaker adds detail only if invited.

**A: Is this actually a multi-agent system?**  
"It is a scripted three-role workflow with fixed fixtures and fixed proposed commands. It demonstrates recorded context and a real tool gate, not autonomous multi-agent reasoning. An actual less-scripted integration is future work."

**C: Isn't the canary just a magic string?**  
"The marker is central to this particular demonstration. The sentinel also checks content and token or shingle overlap between observed untrusted output and sink arguments, but that is not general provenance or complete information-flow tracking. Attacks without matching evidence can evade it."

**B: Is the AI load-bearing for the block?**  
"Not in this poisoned swarm example. MiniLM supports the analysis view; the sentinel match and policy block the fixed command. The separate kernel ablation found one changed gating example in a small curated set, using a reconstructed baseline. That is evidence worth investigating, not proof of broad model value."

**B: What do 79 percent, 54 percent, 0.2192 and 75 percent mean?**  
"In an observed warm run, about 79 percent was composite span risk and 54 percent was drift between the trusted plan and untrusted page. Raw occlusion around 0.2192 measures the full-page embedding's change when the span is removed. About 75 percent was a separate poisoned-fixture contamination estimate; the clean fixture was about 25 percent. None is a validated compromise probability or causal attribution, and live values may differ."

**C: Can the operator approve the dangerous command?**  
"The command was already blocked by policy before the containment hold. Keep isolated retains isolation. Sanitize & resume replaces the executor context and proposes a fixed safe `echo swarm-ok` through the gate; it does not execute the blocked canary command. The old context stays visible in the graph."

**C: What if nobody answers, or someone steals the token?**  
"The containment hold requests 20 seconds and auto-denies on timeout. Its HMAC token is call-bound, expires and is single-use, but it does not independently establish a human identity. A stolen valid token is a real concern; authenticated operators and stronger access controls are needed."

**C: Can an attacker rewrite the ledger?**  
"A hash chain makes changes detectable when checked against a trustworthy retained reference. Optional Ed25519 anchors protect a prefix only if the verifier has an independently trusted key and checkpoint. Local keys alone do not provide that trust, and audit writes can fail without blocking the gate."

**B: How good and fast is it in production?**  
"We cannot infer production performance from 35 author-curated cases. The kernel benchmark recorded 23 of 25 positives gated, zero of 10 benign gated, and 81 milliseconds p95 for inspect round trips. There are two documented obfuscation misses. We need independent datasets and end-to-end latency measurements."

**A: Does it work completely offline?**  
"The fixtures and model can be local, and we preload the model cache. The complete airplane-mode drill has not yet been established for the venue laptop. We will report the actual rehearsal result, not promise absolute offline operation."

**A: How is this different from existing security products?**  
"We demonstrate a specific combination: visible lineage across scripted roles, an action-boundary gate, marker or overlap matching, and an executor containment hold. We have not established that this is first or that any named competitor lacks these capabilities."

**C: Is isolation a process or network sandbox?**  
"No. It is the demo's in-process role and graph state, with the original proposed call blocked by policy. It does not establish process-level isolation or security for arbitrary distributed agents."

**A: What would you build next?**  
"Independent evaluations and more diverse attacks first, then authenticated operators, reliable audit failure handling and integration with real agent workflows. We would measure end-to-end latency and false positives before making deployment claims."

## Preflight

1. On the presentation laptop, install dependencies with `npm install` if needed. Preload the local model while network access is available using `npm run models:fetch` if the cache is missing. This may require network access.
2. Start the actual API and UI together with `npm run dev` from the repository root. This is the Vite dev server with the Chaperone API plugin, on strict port `5174`; `vite preview` or a static build alone is not the demonstrated API path. Keep the terminal open.
3. Open `http://localhost:5174/healthz`. Wait for `model: warm` and backend `onnx-all-MiniLM-L6-v2`; check the local chain status. A warm status does not independently prove each inference or external trust. If unavailable, use the fallback contingency and do not call it MiniLM.
4. Open `http://localhost:5174/`, then **Enter Chaperone**, or navigate directly to `http://localhost:5174/#swarm`. Check projector scaling and that the graph, hold buttons, model panel and kernel card are visible.
5. Rehearse the full poisoned run: click **Run poisoned scenario**, immediately **Keep isolated** when enabled, confirm `CONTAINED`, then click **Run clean control** and confirm `COMPLETE`, **executed** and no isolation. Practice the timeout and API-failure contingencies separately. Do not run acceptance concurrently with the stage demo: the runtime permits one active run.
6. With the dev server running, run `npm run swarm:acceptance` in a separate terminal and confirm the actual 23/23 result; this exercises runs and writes audit records. Run `npm test` and confirm the current count; the observed suite was 115 tests in 15 files. If results differ, update spoken claims rather than hiding the difference.
7. If rechecking the MiniLM ablation, with the model warm run `node scripts/onnx-ablation.mjs`; it uses live inspect verdicts and a reconstructed baseline. `npm run bench` writes `docs/bench-output.json`, so run it only when that generated-file change is intended; report its actual new numbers if used.
8. Complete a full airplane-mode drill on the venue laptop after preloading, including startup, warm status, poison, hold and clean control. This drill is not yet established; if it fails, use a working connection or the honest contingency, not an offline guarantee.
9. Verify power, display, readable zoom, a visible timer for A, and a backup laptop with the same dependencies and model cache. Rehearse twice against the 9:20 target, including the immediate hold click and 40-second recovery allowance. Keep Q&A outside the timed presentation.
