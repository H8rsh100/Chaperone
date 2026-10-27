# Chaperone

**A security prototype for understanding and controlling AI agent tool calls.**

Chaperone combines local AI-assisted analysis, context lineage, a tool-call gate,
human review, and a tamper-evident audit trail. Its central question is:

> What should happen when an AI workflow attempts an action involving content
> obtained from an untrusted source?

Built by **HTML Houdinis** for the AI Innovation Challenge 2026, in the Cyber
Security & Digital Trust category.

> **Prototype scope:** The multi-agent scenario uses three scripted roles and
> fixed tool-call proposals. It demonstrates a real local tool gate and a
> specific content-matching attack; it is not a production-ready autonomous
> agent platform or a guarantee against every form of prompt injection.

## The problem

AI agents can read external pages and use tools such as shell commands or HTTP
requests. An attacker can hide instructions in material an agent was meant only
to read. This is **indirect prompt injection**: untrusted content attempts to
influence a later action.

The final command may look harmless when viewed alone. For example, a page can
introduce a distinctive value that later appears in a proposed `echo` command.
Chaperone investigates the action in the context of content observed earlier,
then applies policy before the tool is executed.

## What Chaperone provides

| Component | Purpose |
|---|---|
| **Live Lab** | Visualizes a scripted planner, retriever, and executor, their context lineage, model evidence, and the gate's outcome. |
| **AI-assisted analysis** | Uses embeddings and occlusion to highlight influential spans in untrusted content. |
| **Kernel** | Scores proposed tool calls and routes them to allow, human review, or deny. |
| **Taint sentinel** | Matches markers and text overlap from observed untrusted outputs against sensitive tool-call arguments. |
| **Human review** | Pauses review-tier calls or the demonstration's containment hold; a timeout denies the request. |
| **Audit and checkpoints** | Attempts to record decisions in a hash chain and can create Ed25519-signed Merkle checkpoints. |
| **Integrations** | Provides a limited MCP stdio gateway and an optional Anthropic tool-use loop through the shared adjudicator. |

## How the demonstration works

```text
Operator's task
      |
      v
Planner ---> Retriever ---> Executor
                |               |
          untrusted page    proposed tool call
                |               |
                +-----> Kernel <-+
                         |
              allow / review / deny
                         |
            human hold and audit record
```

1. The **planner** publishes a trusted plan to retrieve release notes.
2. The **retriever** fetches a local fixture through the `http_fetch` tool. In
   the poisoned scenario, the page contains an instruction and the marker
   `ZQ7XK2M9`.
3. The model-analysis panel highlights a top-ranked span and displays an
   embedding-based occlusion measurement. The context graph shows the observed
   lineage between the scripted roles.
4. The **executor** proposes the fixed command `echo ZQ7XK2M9`. The sentinel
   matches the marker against the fetched content. In the demonstrated run, the
   kernel returns `blocked_by_policy` with a score of **56**, so that command
   does not execute.
5. The demonstration marks the executor role as isolated and opens a
   **20-second human hold**. The operator can keep it isolated or allow a
   replacement context and a fixed safe action. No response results in denial.
6. The **clean control** uses a benign page and `echo swarm-ok`. In the tested
   scenario, the call executes and no role is isolated.

The AI analysis and the enforcement decision are separate: **the marker match,
not the model's saliency score, drives isolation in this scenario**. Isolation is
an in-process role state, not process-level or network isolation. The earlier
context remains visible in the graph after the replacement action.

## The AI contribution

When available, Chaperone uses a quantized **MiniLM-L6-v2** model through ONNX
Runtime to generate 384-dimensional text embeddings. If the model is unavailable,
the analyzer uses a deterministic 512-dimensional hashing fallback; the Live
Lab displays the selected backend.

For each analyzed span, the prototype embeds the full page, removes the span,
and embeds the remaining text. It measures the change using:

```text
occlusion = clamp(1 - cosine(full-page embedding, embedding without span), 0, 1)
```

The interface shows this raw measurement, a ranked span, and relative token
occlusion. Span ranking also uses heuristic intent and instruction-density
signals. The displayed contamination score combines span risk, embedding
drift, context share, marker presence, and taint carry.

**Interpretation:** occlusion measures a change in an embedding; it does not
prove why an agent acted. Contamination is a prototype heuristic, not a
validated probability of compromise. The analyzer examines a bounded number of
spans and tokens and can miss relevant content.

## Quick start

**Requirements:** Node.js and npm. The project was verified with Node.js 24.
Installing dependencies and fetching a missing model may require internet access.

```bash
npm ci
npm run models:fetch  # preload MiniLM; requires network if it is not cached
npm run dev
```

Open **http://localhost:5174** and choose **Enter Chaperone**, or open the
Live Lab directly at **http://localhost:5174/#swarm**. Choose **Kernel** to
inspect the tool-call gate; use **Live Lab** in its navigation to return.

Check **http://localhost:5174/healthz** before presenting. A warm model reports
`model: "warm"` and backend `onnx-all-MiniLM-L6-v2`. If the model cannot load,
the application falls back to hashing instead of claiming transformer inference.
Preload the model and rehearse the complete workflow without internet access on
the presentation machine before making an offline claim.

The demonstrated API runs as middleware in the Vite development server on
strict port **5174**. `npm run build` verifies and builds the frontend, but a
static build or `vite preview` alone is not the demonstrated API server.

## Live Lab walkthrough

1. Select **Run poisoned scenario**.
2. Observe the retrieved page, role graph, model-analysis panel, and kernel
   verdict. When the hold appears, select **Keep isolated** before it expires.
3. Confirm the result is **Contained**.
4. Select **Run clean control** and confirm the call executes without isolation.
5. Optionally run the poisoned scenario again and select **Sanitize & resume**
   to exercise the fixed replacement action.

The exact observations depend on the selected model backend and live runtime.
The [10-minute presentation script](docs/ten-minute-presentation.md) provides
speaker handoffs, demo cues, and Q&A.

## Kernel and integrations

The shared adjudicator inspects a tool call, incorporates sentinel findings,
and applies one of three outcomes:

- **Allow:** pass the call to the tool registry.
- **Review:** wait for an operator decision; a timeout denies the call.
- **Deny:** return a blocked outcome without executing the call.

The shell registry rejects shell metacharacters, implements a small set of
built-ins, and permits only the exact external commands `npm test` and
`npm run build`. This is an allowlist, **not a sandbox**: allowed npm scripts
can themselves run project code. The HTTP tool accepts HTTP(S) destinations and
does not provide a comprehensive network isolation boundary.

### MCP gateway

With the dev server running, `npm run mcp:demo` exercises the stdio gateway.
The gateway exposes a limited JSON-RPC/MCP surface for `shell_command` and
`http_fetch` and forwards calls to the shared gate. See
[docs/mcp.md](docs/mcp.md) for configuration and its trust boundary. Direct
tool access that bypasses this gateway is not mediated by Chaperone.

### Optional Anthropic integration

The separate Anthropic tool-use loop requires `ANTHROPIC_API_KEY` and network
access. The local Live Lab does not require this integration. If a live model is
requested without the key, the API can select a scripted scenario instead; check
the returned mode rather than assuming a remote model was used.

## Review and audit

Review requests use expiring, call-bound HMAC decision tokens. Their single-use
state is maintained in the running process. The token does **not** independently
authenticate the person using the interface. Default review timeouts are 8
seconds in development and 30 seconds in production; the swarm hold requests
20 seconds. `CHAPERONE_REVIEW_TIMEOUT_MS` configures the general timeout.

Decisions are attempted in a local, hash-chained ledger. An optional checkpoint
signs a Merkle root with Ed25519. Meaningful independent verification requires
an independently trusted public key and retained checkpoint: locally stored
keys and anchors alone do not prevent a host owner from rewriting both. Audit
write failures are currently not treated as execution failures.

The development API and pending decision tokens are not protected by operator
authentication. **Do not expose the control plane to untrusted networks.**

## Tests and evaluation

With the dev server running for the live checks:

```bash
npm test                         # automated unit and integration tests
npm run build                    # TypeScript and production frontend build
npm run swarm:acceptance         # poisoned, clean, and resume API scenarios
node scripts/onnx-ablation.mjs   # paired kernel comparison; MiniLM must be warm
npm run mcp:demo                 # MCP gateway demonstration
```

The latest verified run passed **115 tests across 15 files** and **23 of 23
Live Lab acceptance checks**. These checks are regression evidence, not a
security certification.

The kernel benchmark contains **35 author-curated cases**: 25 expected to be
gated and 10 benign. The recorded MiniLM-warm run gated 23 of 25 positives
(92% recall) and none of the 10 benign cases. Its reported kernel inspect
round-trip latency was 39 ms p50 and 81 ms p95. These figures are not
end-to-end Live Lab latency or an independent estimate of production accuracy.

In a paired comparison on those same cases, a reconstructed rules-plus-hashing
baseline gated **22/25** positives, while the observed MiniLM overlay gated
**23/25**; neither gated any of the 10 benign cases. One case changed from
allow to review. This comparison is not a held-out evaluation or latency test.
Two documented obfuscation cases remain misses. See
[docs/benchmarks.md](docs/benchmarks.md) and `scripts/onnx-ablation.mjs`.

## Architecture and key files

```text
src/components/       React landing page, Live Lab, and Kernel interface
src/swarm/            Scripted roles, context graph, saliency, orchestration
src/intercept/        Shared adjudication, integrations, and taint sentinel
src/lib/              Risk scoring and deterministic semantic analysis
server/               API, tool registry, model integration, approvals, audit
server/mcp/           MCP stdio gateway
scripts/              Test fixtures, acceptance checks, benchmarks, ablation
deck/                 Presentation deck
docs/                 Benchmarks, presentation script, and engineering notes
```

The [v2 engineering blueprint](docs/aegis-swarm-v2-blueprint.md) describes
proposed research and distributed-system work. It is **not** a description of
features already implemented in this prototype.

## Current limitations

- The three-role workflow and proposed commands are scripted; the graph does
  not establish complete information flow or causal influence.
- The sentinel can miss transformed, obfuscated, or unobserved information.
- Isolation is a demonstration state, not a general min-cut algorithm or
  operating-system sandbox.
- Local API access and operator identity need stronger authentication; HTTP
  destination controls and audit failure handling need hardening.
- The benchmark is small and author-curated. Independent evaluation, broader
  attack coverage, and end-to-end latency measurements remain future work.

## License

Released under the [MIT License](LICENSE).
