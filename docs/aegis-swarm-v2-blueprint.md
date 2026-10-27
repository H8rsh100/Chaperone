# Aegis-Swarm v2: Engineering and Assurance Blueprint

**Status:** proposed architecture and implementation contract  
**Scope:** attribution, causal provenance, graph scale, distributed mediation, cryptographic evidence, fail-closed execution, and adversarial evaluation  
**Baseline:** repository commit `92a5077` (the shipped in-process Aegis-Swarm and Chaperone kernel)

This document is an upgrade blueprint, not a claim that the distributed design is already implemented or verified. It defines guarantees in terms of explicit trust assumptions and makes statistical model signals advisory to authorization.

## 0. Security contract and limits

“Eliminate all attribution blind spots” is not an achievable guarantee for a black-box language model. A model can transform an instruction without copying its tokens, internal attention is not a causal explanation, and an external provider can maintain state that the caller cannot inspect. No embedding, occlusion method, SNARK, or ledger can prove that an unobserved input did not influence a model output.

The security objective is instead:

> A tool effect is permitted only when the exact tool, exact argument bytes, complete captured input lineage, current policy, authenticated workload, and single-use execution capability all agree. If any of those facts is missing, stale, unverifiable, or unavailable, no new effect is authorized.

Saliency and semantic similarity rank evidence and help an operator understand a decision. They never convert an untrusted or unknown lineage label into trusted data. This distinction is the principal safety improvement over score-threshold-based taint decisions.

### Explicit assumptions

The safety statement is conditional on these assumptions:

1. Every route from an agent to a protected tool or external resource is mediated by the Chaperone executor. Agents have no ambient credentials, direct egress, host socket, or filesystem capability that bypasses it.
2. The adapter captures the exact context items submitted to the model and exact tool arguments returned by it. Missing instrumentation, an opaque stateful model session, or a missing parent receipt produces `unknown`, which is denied at protected sinks.
3. Workload and policy signing keys remain controlled; the trust root, revocation data, and policy version are configured correctly.
4. The tool executor honors the one-use capability and acts on the exact bytes whose digest it checked. External tools that cannot provide idempotency or queryable operation status can still have an ambiguous outcome after a lost response.
5. The host kernel/hypervisor and any attested runtime are inside the trusted computing base (TCB). A compromised kernel or physical side channel is outside the guarantee.

“Fail closed” means no *new authorization* after a fault. It cannot undo a remote side effect that happened immediately before a connection dropped. For that case the system records `OUTCOME_UNKNOWN`, consumes the capability, and requires idempotent retry or status reconciliation; it must never blindly replay the operation.

## 1. Data and policy model

### 1.1 Causal artifact envelope

All prompt segments, model outputs, tool arguments, and tool results become immutable artifacts. Agent-supplied `trusted: true`, timestamps, parent lists, and agent names are not authority; the broker derives them from authenticated request state and verified receipts.

```ts
type Integrity = 'trusted' | 'tainted' | 'unknown'
type Modality = 'text' | 'json' | 'code' | 'image' | 'audio' | 'binary'

interface ArtifactRef {
  id: string                 // H("artifact-v1" || canonical(tenant, run, producer, seq, payloadDigest))
  payloadDigest: string       // digest of exact bytes, before analysis normalization
  parentRoot: string          // Merkle root of the complete, ordered parent receipt set
  parents: string[]           // full list while hot; committed list after compaction
  producer: string            // assigned by authenticated adapter, never caller text
  producerSeq: bigint         // monotone within producer/run partition
  modality: Modality
  integrity: Integrity
  schemaId?: string           // versioned parser/schema, if applicable
  policyVersion: string
  receipt: SignedReceipt
}

interface SignedReceipt {
  eventHash: string
  partition: string
  sequence: bigint
  keyId: string
  signature: Uint8Array
}
```

Define the integrity join `\sqcup` by `trusted \sqcup trusted = trusted`; any join containing `tainted` is `tainted`; otherwise any join containing `unknown` is `unknown`. Track completeness separately as a Boolean, and set it false for any missing, invalid, or omitted parent receipt. The model adapter assigns every output the join of **all** input context labels unless a trusted, instrumented model interface proves a narrower dependency set. For a sink that requires trusted ancestry, authorization requires `integrity = trusted`; a different sink may explicitly accept tainted data under a narrower capability (for example, a bounded `search_query`). Every protected sink requires complete lineage; `unknown` is never treated as trusted.

This deliberately over-approximates influence. It can block a benign action that merely shared a prompt with untrusted material; a reviewed, policy-specific declassification path may narrow that capability, but ordinary text rewriting, summarization, or “sanitization” does not.

### 1.2 Adaptive semantic edge weight `\mu(d,c)`

`\mu` is a **relevance estimate**, not a trust bit. For source artifact `d` and child artifact `c`, extract a versioned feature vector by modality:

- `r_text`: maximum of calibrated embedding similarity, normalized token/character overlap, and copy/alignment score.
- `r_json`: exact canonical scalar/hash matches, matching JSON Pointer paths, schema-aware key/value correspondence, and array-position alignment. Duplicate keys, invalid UTF-8, schema failures, and parser-limit failures are explicit `unknown` states.
- `r_code`: exact literal hashes, identifier/reference flow, AST node alignment, and parser-derived def-use relations. A parser failure falls back to opaque-byte lineage, never to a clean label.
- `r_image`: exact digest, perceptual/crop alignment, and OCR token alignment with source coordinates.
- `r_audio`: exact digest, timestamped ASR segment alignment, speaker-independent acoustic fingerprints, and entity/transcript alignment.
- `r_context`: depth, model/prompt version, intervening transformations, and semantic drift. Drift changes attribution confidence, not the inherited integrity label.

For enabled modality channels `m`, compute context-adaptive weights from a signed, offline-calibrated gate over schema pair, source/child modality, model version, parser availability, and loop depth:

\[
w_m(d,c)=\operatorname{softmax}_m\!\left(g_\theta(\operatorname{schema}(d,c),\operatorname{modality}(d,c),\operatorname{modelVersion},\operatorname{parserState},\operatorname{depth})\right).
\]

Weights are frozen per policy/model release; never update them online from attacker-controlled payloads. With `w_m≥0` and `\sum_m w_m=1`, define:

\[
R(d,c)=1-\prod_m(1-w_m r_m(d,c)), \qquad
\mu(d,c)=\epsilon+(1-\epsilon)R(d,c), \quad 0<\epsilon<1.
\]

Use a nonzero floor (initially `\epsilon=0.02`) so a failed/unsupported modality cannot produce an exact zero relevance score. Retain raw feature values and the signed weight/model version. When payload parsing fails, mark the corresponding modality unavailable, set lineage completeness false and `integrity(c)=unknown`; do not infer trust from a low `\mu`.

For continuity with the baseline, `\kappa(c)=\max_{d\in Anc(c)}\tau(d)\,\mu^*(d,c)` may be retained as a **risk-ranking** metric, where `\mu^*` is the calibrated source-to-child relevance. Do not multiply a binary taint bit by `\mu` when deciding authorization: deep-loop products can approach zero even while influence persists. The authoritative propagation rule is:

\[
I(c)= I_{source}(c)\sqcup\!\bigsqcup_{p\in Parents(c)} I(p),
\]

with a missing/incomplete parent set joined as `unknown`. Thus no semantic false negative can turn a tainted ancestor into trusted lineage; semantic false negatives remain possible in the *explanation score* and are reported as such.

### 1.3 Source and sink policy

Each source is classified by a broker policy (`operator_input`, authenticated internal artifact, network response, file read, tool output, model output, and so on). Default external/network/tool bytes are tainted. Each sink declares its required lineage class and explicit permitted source classes. For example, untrusted text can be permitted as a `search_query` value under a bounded schema while remaining tainted; the same data cannot authorize `shell_command`, credential access, or external egress.

The predicate is `Permit = authenticated ∧ completeLineage ∧ schemaValid ∧ policyAllows(integrity, sourceClasses, sink, principal) ∧ currentPolicy ∧ freshSnapshot`. A text classifier may add a deny/review finding, but cannot waive any conjunct.

## 2. Core innovation: dynamic attribution and self-healing containment

### 2.1 Dynamic multi-step attribution

Replace repeated sequential occlusion with a bounded, batched, cache-aware pipeline. The prompt assembler assigns a stable artifact ID and byte/token offset map to every segment. JSON fields, code AST nodes, Markdown blocks, OCR regions, and audio transcript spans retain source coordinates. Every generation result points to the full set of prompt artifact IDs. When the model interface exposes trusted token-level source maps, attach them; otherwise mark the result as coarsely derived from every prompt segment.

For a request with `N` segments:

1. Canonicalize only the *analysis view*; preserve the original-byte digest for authorization. Segment at structural boundaries first, then prose sentence boundaries. Cap a request at 4,096 tokens and 32 attribution groups; merge excess groups into an `overflow` group whose parent set remains complete.
2. Embed the full analysis view and up to 32 leave-one-group-out views in one batch. Cache by `(encoder digest, normalization version, content digest)` with a bounded LRU. Do not reuse cache entries across model/normalizer versions.
3. For each group `i`, calculate `\Delta_i = clamp(1 - cosine(z(x), z(x\setminus i)),0,1)`. Add independently measured lexical/copy flow, schema/AST flow, and policy-intent signals. Calibrate a risk score, for example `a_i = sigmoid(b + β_Δ Δ_i + β_copy C_i + β_struct S_i + β_intent J_i + β_drift D_i)`. Preserve all component scores; do not present `a_i` as a causal probability unless calibration demonstrates that interpretation.
4. Refine the top `K=8` groups into at most 64 token/span occlusions, again in one batch. Use the model tokenizer's offset map, not a regex tokenizer. Sample a bounded number of pairwise group occlusions to estimate interaction residuals; assign unallocated residual to the containing group and lower the reported coverage/confidence.
5. Emit `{sourceArtifact, byteRange, tokenRange, groupId, score, method, coverage, modelVersion}`. If a parser, tokenizer, embedding model, or time budget fails, emit an incomplete explanation and preserve the coarse parent set. Never synthesize a “clean” explanation on failure.

The compute path uses a bounded schedule of at most 125 full/group/token/pair variants at input length `L≤4096`. A conventional transformer costs `O(B·L²)` attention work for batch size `B` (a linear-attention encoder may be `O(B·L)`); batching lowers dispatch overhead, not total encoder work. Cache hits and structural alignment reduce typical work. The 30 ms target below requires a pinned, benchmarked accelerator or distilled encoder; the shipped 81 ms MiniLM p95 does not meet it by itself. The authorization path does not await this attribution job: it synchronously propagates lineage and applies policy, while the explanation may arrive asynchronously. If the policy itself requires a score and analysis misses its deadline, the result is `REVIEW/DENY`, never allow.

Attribution coverage is explicit: `covered_source_bytes / total_source_bytes`, plus a count of unparsed fields/groups. Claim “complete attribution” only when coverage is 100% for the declared instrumentation boundary. Even then, this means every *observed input byte* is mapped; it does not prove internal neural causality.

### 2.2 Min-cut containment and safe continuation

The provenance graph is append-only. Containment changes an authorization overlay and task branch; it does not delete or rewrite causal history.

For tainted source set `U` and proposed sink context `c`, split every eligible internal vertex `v` into `v_in → v_out` with capacity one; connect original edges with capacity `INF`, and assign `INF > |V|` to protected source and sink vertices. Run max-flow/min-cut. The minimum cut corresponds to a minimum-cardinality internal vertex set separating every path from `U` to `c` (by Menger's theorem). If policy allows edge cuts as well, represent each removable edge with an explicit finite cost; never give a protected boundary a finite capacity. Bound graph size and solver time; timeout yields containment of the entire affected agent/session and no execution.

Apply the cut as an overlay: revoke that agent's capabilities, stop its pending calls, mark descendants as tainted/unknown, and preserve the full event trail. To continue benign work, create a fresh task branch from an explicitly enumerated taint-free ancestor frontier, with a new context ID and fresh model session. Do not resume from hidden model state, conversation cache, or a text-filtered copy of tainted content. A sanitizer may issue a narrower typed capability only when its deterministic transformation and schema checks are policy-approved; it does not retroactively relabel the original artifact.

If the clean frontier is empty, a cut cannot be proven, an agent's server-side state cannot be reset, or a worker cannot attest its new session, keep that branch quarantined. This permits unrelated agents to continue while making recovery conditional on actual data separation.

## 3. Graph scale and distributed execution

### 3.1 Bounded graph and exact compaction

Use a partitioned, append-only event log keyed by `(tenant, runId)` with monotone partition sequence numbers. Each event contains the child ID, parent-root, parent receipt IDs (complete while hot), payload digest, label transition, policy version, and signer. A materialized hot index uses packed/typed arrays or a native store rather than unbounded JavaScript object graphs. A single writer per partition (or a serializable compare-and-swap transaction) assigns sequence numbers; repeated event IDs are idempotent, and conflicting duplicate IDs are rejected.

Keep a 30-minute hot window for active runs, but never expire lineage by age. Compact cold subgraphs into signed Merkle summaries that retain the root, label join, source-class set, complete-parent count, and proof references. A child with an unavailable summary becomes `unknown`. Bloom filters or approximate reachability indexes may accelerate “possibly related” queries; because of false positives/aging, they may only force extra verification or denial and must never authorize a call. The durable receipt graph is the source of truth.

Initial hard caps per worker (sizing inputs, to be re-benchmarked):

- `V_hot ≤ 1,000,000` artifacts and `E_hot ≤ 4,000,000` parent edges;
- packed artifact budget `≤256 B/artifact`, edge budget `≤96 B/edge`, Bloom summary budget `≤10 bits/entry` for at most 16,000,000 indexed IDs (20 MB allocation), plus a fixed 320 MiB index/allocator reserve;
- calculated ceiling `256 MB + 384 MB + 20 MB + 320 MiB ≈ 1.0 GiB` (decimal/binary difference covered by the reserve);
- process memory limit `1.5 GiB`; reaching 80% of graph budget triggers backpressure/compaction, reaching the hard cap rejects new affected-run work as `RESOURCE_LIMIT/UNKNOWN`.

These are encoded-format budgets, not a claim about V8 object size. The native/packed representation must be measured with allocator overhead before production. Scale horizontally by tenant/run partition; impose independent tenant quotas so one swarm cannot exhaust all workers. With a 30-minute hot window and 300 new artifacts/s, one partition receives 540,000 artifacts before edge fan-out; provision more partitions where fan-out or retained active runs exceed the cap.

### 3.2 Concurrency, order, and stale reads

The graph broker issues a snapshot token `(partition, highWatermark, graphVersion, policyVersion)`. Before reserving a tool capability, the policy service verifies that every parent receipt is committed at or below the watermark and that the graph version has not changed since evaluation. If a concurrent event changes the dependency set, evaluation restarts. Cross-partition parents require signed acknowledgments from every parent partition; missing/timeout means no permit. Do not infer causal order from wall clocks; use per-producer sequence plus explicit parent receipt references. Use hybrid logical time only for operations/retention, not trust decisions.

Hot lookup is `O(number of direct parents + bounded summary checks)`; graph reachability is an offline/async evidence query. If an authorization query would need unbounded traversal, use the committed summary proof or deny. All queue, batch, and storage operations have explicit byte/count limits and cancellation; backpressure propagates to agent calls instead of silently dropping graph records.

### 3.3 MCP router, adapters, sidecar, and TOCTOU control

```text
LangGraph / AutoGen / CrewAI
          │ signed adapter envelope (call digest + parent receipts)
          ▼
MCP ingress sidecar ── mTLS/workload identity ──► policy + lineage broker
          │                                          │
          └── one-use signed execution capability ◄──┘
                                                     │ exact immutable bytes
                                                     ▼
                                          sandboxed tool executor ──► tools
```

Adapters are thin protocol translators. They attach tenant/run/workload identity from the host, the exact argument digest, and all context receipt IDs; they cannot assert trust labels. A registration maps each runtime's agent IDs to workload identity and scoped capabilities. Unsupported framework paths, tools, or streaming modes are rejected until an adapter can capture their complete request/response boundary.

Use short-lived X.509 workload identities (SPIFFE/SPIRE or equivalent) with mutual TLS for remote sidecars and policy services. For local sockets, verify OS peer credentials and bind only to a private socket path. For MCP over HTTP, pin a supported protocol/schema version, authenticate every protected request, validate `Origin`, enforce request/body limits, and bind only to loopback when local. For MCP stdio, wrap the child process and validate each framed JSON-RPC message; stdout remains protocol-only. The current repository's gateway trusts unauthenticated localhost HTTP, so that development trust boundary must not be exposed as a production endpoint.

Linux eBPF cgroup `connect4/connect6` hooks can restrict which destinations a workload process may contact and route/deny direct egress. Pair this with network namespaces/firewall policy, seccomp/LSM or container policy for process/file controls, and a read-only capability filesystem. **eBPF socket hooks do not inspect TLS application payloads** and are not a substitute for the MCP parser or tool gate. Root/kernel compromise remains outside the guarantee. On platforms without equivalent enforcement, do not label the deployment complete-mediation mode.

The TOCTOU-resistant capability binds:

```text
H(tenant, run, principal, toolId, toolVersion, canonicalArgumentBytes,
  parentRoot, graphVersion, policyHash, nonce, expiry, decision)
```

Canonicalize once using a pinned canonical-CBOR profile; reject duplicate JSON keys and ambiguous encodings before conversion. The signed capability is short-lived and single-use. A linearizable store atomically consumes `nonce` and reserves the exact digest. The executor reads those immutable bytes, verifies the signature and all bound fields again, checks policy/graph freshness, writes a durable intent record, then executes. It does not accept agent-supplied replacement arguments after authorization. Human approval signs the same digest and graph/policy versions; any mutation requires a new review.

The linearization point for the effect is the executor's atomic `RESERVED → EXECUTING` transition. That transaction verifies the reservation is still unspent and that the graph and policy epochs equal the signed epochs. Policy revocation and graph-version changes use the same linearizable authority: a revocation either commits before the transition and invalidates the permit, or after it and applies to subsequent effects. There is no interval in which a remote caller can replace arguments or race a stale policy check.

## 4. Formal safety and cryptographic evidence

### 4.1 Gate state machine and invariants

Per request, allow only this forward state machine:

```text
NEW → AUTHENTICATED → SNAPSHOT_VERIFIED → POLICY_EVALUATED
    → PERMIT_RESERVED → INTENT_DURABLE → EXECUTING → COMMITTED
Any invalid input, denial, timeout, stale snapshot, unavailable dependency,
or crash before execution → DENIED (or RESOURCE_LIMIT); no transition back to ALLOW.
Lost response after a possible effect → OUTCOME_UNKNOWN; capability stays spent.
```

Let `Effect(r)` mean the executor has begun the protected effect for request `r`, `Permit(r)` a valid signed capability, `Spent(r)` the nonce was atomically consumed, and `Bound(r)` mean the permit digest equals the bytes actually executed. Required safety invariants are:

\[
\Box(Effect(r) \Rightarrow Permit(r)\land Spent(r)\land Bound(r))
\]
\[
\Box(Effect(r) \Rightarrow Authenticated(r)\land CompleteLineage(r)\land CurrentPolicy(r)\land FreshGraph(r))
\]
\[
\Box(Unknown(r)\lor TimeoutBeforePermit(r)\lor InvalidSignature(r)\Rightarrow \neg NewEffect(r))
\]
\[
\Box(Spent(r)\Rightarrow \neg Reusable(r)), \qquad \Box(CountEffects(r)\le 1)
\]

The executor's only effect-start transition is equivalent to this atomic operation (the external tool invocation follows only after it commits):

```text
BeginEffect(r, cap, immutableArgs):
  require phase[r] == INTENT_DURABLE
  require verifySignature(cap) && cap.requestId == r
  require H(immutableArgs) == cap.argumentDigest
  require identity[r] == cap.principal && lineageComplete[r]
  require policyAllows(labels[r], cap.sink) && graphEpoch == cap.graphEpoch
  require policyEpoch == cap.policyEpoch && nonce[r] == RESERVED
  require dispatchCount[r] == 0
  atomically set phase[r] = EXECUTING,
              nonce[r] = SPENT,
              dispatchCount[r] = 1
  dispatch exactly immutableArgs once using idempotency key r
```

The preconditions are checked in the same linearizable transaction that claims the nonce and dispatch slot. Every failure before that transition takes `DENIED` with `dispatchCount=0`; duplicate/replayed requests cannot claim the slot. A crash after the claim is recovered as `OUTCOME_UNKNOWN` and is not redispatched. The model's `CountEffects` is therefore the number of executor dispatch starts; the remote service's final effect count is additionally bounded by its idempotency contract.

The last invariant requires an idempotency/transaction contract with the tool or a durable executor that records the operation ID before forwarding. For non-idempotent remote tools, the strongest honest property is “at most one Chaperone dispatch”; the remote effect may remain unknown after a network partition. “Zero bypass” is a property of the complete mediation deployment and OS policy, not of the TypeScript gate in isolation.

Model-check the state machine with nondeterministic message loss, duplicate/reordered requests, process crash at each transition, stale graph versions, concurrent approval and timeout, key rotation, and replay. Check the invariants above plus that no path from `DENIED` or `OUTCOME_UNKNOWN` reaches `EXECUTING`. Liveness is conditional: an available, authenticated, policy-allowed request eventually executes only if graph, policy, ledger, nonce store, and executor remain available.

### 4.2 Signed ledger and ZK/TEE options

Upgrade the current single-process JSONL ledger for distributed writes to a sequenced append service per partition. Hash a typed, domain-separated canonical record (RFC 8785/JCS for JSON or pinned canonical CBOR for envelopes):

\[
h_i=H(\texttt{"AEGIS-LEDGER-v2"}\parallel partition\parallel seq_i\parallel h_{i-1}\parallel record_i).
\]

Use Merkle inclusion proofs over committed record hashes, Ed25519 or an approved HSM-backed signing key for checkpoint roots, key IDs and rotation/revocation records, and independently stored anchors. Serialize a single partition writer or use a transactional sequence allocator; the current `read-all then append` implementation is not a concurrent multi-writer protocol. Fsync intent before an effect; append the result/unknown outcome after it. Anchor roots outside the mutable host (separate account or transparency service) so a host owner cannot rewrite both log and local anchor.

**Optional zero-knowledge statement.** Commit to the payload and full parent set with hiding commitments and prove that (a) each parent belongs to the committed lineage root, (b) every transition follows the versioned monotone taint rule, (c) the call digest matches the public request commitment, and (d) the resulting sink policy accepts the public source-class/policy inputs. Public inputs are `{callCommitment, lineageRoot, policyHash, graphVersion, decision, nonce}`; raw text and parent payloads remain private witnesses. A recursive proof can amortize prior transition checks, but circuit version, proving/verifying key, setup ceremony (if required), and verifier implementation become part of the TCB.

A ZK proof proves a property of the **committed graph**; it does not prove that the agent disclosed every context item. Capture completeness must come from a trusted adapter/runtime or attested execution boundary. For high assurance, run the prompt assembler, model transport, provenance broker, and capability verifier in an attested TEE; verify a fresh quote over runtime measurement, policy hash, nonce, and key material, with debug mode disabled and revocation checked. The TEE can issue signed input/output receipts. ZK can then reveal only a proof over those receipts. TEEs still have side-channel, rollback, firmware, and operator trust risks; keep raw payloads encrypted at rest, minimize enclave secrets, and use external monotonic log anchors for rollback detection.

Roll out ZK only after a public-input/circuit threat review and independent implementation audit. For the first distributed release, signed receipts plus external Merkle anchors and attested capture give a simpler, reviewable assurance boundary.

## 5. Adversarial benchmark and quantitative targets

### 5.1 Benchmark construction

Create a source-separated corpus and deterministic multi-agent harness with oracle artifact IDs. Hold out domains, attack templates, and tool schemas from calibration. Include paired clean controls with similar vocabulary and payload shape. Every attack case records its source artifact, transformations, expected descendant set, target sink, expected gate outcome, and byte/token-level oracle alignment.

| Track | Cases to generate | Failure tested |
|---|---|---|
| Lineage masking | paraphrase, translation, summarization, identifier renaming, Unicode confusables, homoglyphs, homoglyph JSON keys, code comments/docstrings, hidden HTML, OCR/ASR, nested serialization | String-only/semantic matching misses derived data |
| Split-payload | instruction split over chunks, fields, tool results, agents, and turns; reorder; truncate; interleave benign text; partial canary; base64/hex/compression | Per-record limits and fragment union lose ancestry |
| Indirect manipulation | retrieved page → planner summary → retriever → executor; delegation; shared cache; model context rollover; multiple tools; benign-looking sink args | Deep graph propagation and session-state leakage |
| Graph pressure | fan-out/fan-in, cycles/rejected cycles, missing parents, stale replicas, duplicate IDs, compaction during read, Bloom saturation, quota exhaustion | Memory bounds, race conditions, summary soundness |
| Gate/transport | replayed capability, argument mutation after approval, duplicate request, nonce race, forged workload, invalid certificate, DNS rebinding/Origin abuse, direct egress attempt | Authentication and TOCTOU bypass |
| Fault injection | kill at every state transition, ledger/nonce service outage, packet loss, delayed/reordered ack, clock skew, failover, partial tool result | Every unknown path denies or reports outcome unknown |
| Benign hard negatives | policy quotes, code samples, incident reports, structured queries, synthetic IDs, harmless commands with shared context | False-positive cost and calibration |

Do not train and evaluate on variants of the same template in different splits. Use at least three independent annotators for semantic ground truth, report disagreement, and retain deterministic lineage ground truth separately from human judgments about intent.

### 5.2 Metrics

For a saliency threshold `t`, report `TPR(t)=TP/(TP+FN)` and `FPR(t)=FP/(FP+TN)`. Define `Recall@0.1%FPR = TPR(t*)`, where `t*` maximizes TPR subject to `FPR(t*)≤0.001`; choose `t*` on dev data, then report held-out recall and a 95% Wilson interval. With zero observed false positives among `n` independent negatives, the approximate 95% upper bound is `3/n`; therefore at least 3,000 independent negative runs are needed even to support an upper bound near 0.1%. Report (1) strict lineage recall: fraction of oracle-tainted high-risk calls denied/reviewed; (2) unauthorized effect count, with a target of zero in the fault/replay suite; (3) recall at fixed `0.1%` false-positive rate; (4) FPR and benign task completion; (5) ROC-AUC and PR-AUC for saliency only; (6) expected calibration error/Brier score; (7) instrumentation coverage and unknown-lineage rate; (8) p50/p95/p99 latency and peak resident memory by concurrency tier; (9) min-cut size, solver timeout rate, and clean continuation success.

Calculate confidence intervals by independent source/run clusters, not by treating many variants of one seed as independent samples. Freeze thresholds on dev data before final test. Compare against the current `92a5077` implementation, regex/sentinel-only, semantic-only, and an always-deny upper bound for detection; report both safety and utility. An empirical superiority claim is valid only if the held-out results and confidence intervals support it.

### 5.3 Initial SLOs (targets, not measured results)

| Operation | p50 | p95 | p99 | Load / boundary |
|---|---:|---:|---:|---|
| Auth + canonicalize + local capability verification | 2 ms | 5 ms | 10 ms | warm sidecar, ≤16 KiB args |
| Exact lineage parent/summary check | 1 ms | 3 ms | 8 ms | ≤32 direct parents, local partition cache |
| Complete local gate excluding model/provider/human wait | 5 ms | 15 ms | 25 ms | warm services; includes signature/nonce/ledger intent |
| Attribution analysis | 10 ms | 30 ms | 50 ms | ≤4,096 tokens, ≤32 groups, batched/distilled encoder on named hardware |
| Sustained ingress | — | — | — | 300 tool proposals/s/partition with 2× burst headroom and no dropped lineage events |

For measured latency samples `x₁,…,xₙ`, report `Qₚ = inf{x : Fₙ(x) ≥ p}` for `p∈{0.50,0.95,0.99}` and include sample count, warm/cold state, hardware, concurrency, and timeout/censoring policy.

Measure open-loop and closed-loop load, p99 under 300 proposals/s, cold start, cache miss, compaction, and injected partial outages. Also report remote network overhead separately; the local p95 does not include model inference, human response, or cross-region round trips. Attribution timeout must not delay the synchronous lineage decision. The shipped MiniLM 81 ms p95 is a baseline observation, not evidence for the 30 ms target.

Memory is bounded by the graph caps in §3.1 plus fixed worker budgets for queues, model batches, and audit buffers. Queue overflow pauses/rejects the affected run; never evict taint summaries to admit new traffic. Publish the maximum permitted queue length and bytes as deployment configuration and test the hard-limit path.

## 6. Implementation sequence and acceptance gates

1. **Taint correctness:** introduce broker-issued artifact receipts, monotone integrity joins, unknown-on-missing-parent, exact argument digests, and policy tests for existing tool paths. Retain the current UI score as an explanation field only.
2. **Transactional gate:** implement typed capabilities, atomic nonce consumption, durable intent, immutable argument execution, and an `OUTCOME_UNKNOWN` result. Add fault-injection and replay modeling before enabling writes.
3. **Graph service:** partitioned event log, high-watermark snapshots, bounded packed hot index, Merkle compaction, tenant quotas, and denial on resource exhaustion.
4. **Transport enforcement:** framework adapters and authenticated MCP sidecars; deploy network namespace/cgroup egress controls and remove ambient tool credentials from agents.
5. **Attribution v2:** structural offsets, batched occlusion, bounded caching, explicit coverage, and hardware-qualified latency benchmark. Keep it off the authorization critical path.
6. **Formal and cryptographic assurance:** model-check the gate state machine, threat-model and audit ledger/capability formats, then add TEE or ZK proof paths only for deployments that need private verifiable evidence.
7. **Canary rollout:** shadow decisions first, compare false positives and lineage coverage, then enforce by sink class. Rollback may disable a new analyzer, but may not re-enable direct agent-to-tool access.

The release gate is zero unauthorized effects in deterministic adversarial/fault suites, complete mediation demonstrated at the OS boundary, no missing-parent allow, bounded memory under sustained load, and published held-out metrics with confidence intervals. Passing unit tests alone is not evidence for those deployment properties.

## 7. Repository mapping and implementation notes

- `src/swarm/graph.ts`: replace mutable trust assertions and linear lookups with receipt-backed lineage service interfaces; maintain an append-only audit view and a separate containment overlay.
- `src/swarm/saliency.ts`: retain as a local/demo analyzer, then add structural grouping, batching, coverage, and model-versioned cache. Do not use its score as the authority label.
- `src/intercept/sentinel.ts`: keep as a defense-in-depth heuristic. Its bounded text fingerprints are not complete lineage and cannot be the only CTA mechanism.
- `src/intercept/adjudicate.ts`: make the final gate consume a verified lineage snapshot and one-use capability; the executor must reject calls lacking that capability.
- `server/mcp/gateway.mjs`: current localhost HTTP bridge is a development adapter. Production requires authenticated transport, protocol/version conformance, bounded parsing, and egress restrictions.
- `server/audit/ledger.ts` / `server/audit/anchor.ts`: preserve the demo hash-chain/Merkle pattern, but use a serialized distributed writer, canonical format, external checkpoint storage, and explicit key lifecycle before multi-worker deployment.

## References

- [MCP transport specification (2026-07-28)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx) — pin and test a supported protocol revision; validate `Origin` and authenticate remote endpoints.
- [SPIFFE concepts and SVIDs](https://spiffe.io/docs/latest/spiffe/concepts/) — workload identity documents, short-lived credentials, and trust bundles for mTLS.
- [Linux BPF program types](https://www.kernel.org/doc/html/v6.16/bpf/libbpf/program_types.html) — cgroup connect hooks useful for network mediation; they do not provide application-payload inspection.
