# Chaperone — Complete UI Brief

> **For a UI/design agent:** this document is the single source of truth for
> building or re-theming the Chaperone interface. It describes the product, the
> data the UI receives, every screen and state, the exact copy, and the design
> language. **Do not change application logic or the API contract** — this is a
> presentation layer over an existing, working system. Read `README.md` for the
> engine; this file is everything visual.

---

## 1. What the product is

**Chaperone** — "parental controls for AI agents." A human-in-the-loop firewall
that sits between an AI agent and its tools. Before any tool call executes, it is
risk-scored and routed three ways:

- **allow** — safe; runs immediately
- **review** — ambiguous; **freezes the agent** until a human approves/denies
- **deny** — unsafe; blocked, never runs

Tagline (existing): **"Parental controls, for AI agents."**
One-line pitch: **"Watch a real agent try something destructive and get blocked live."**

Tone: serious security tool with a confident streak. Not playful, not corporate.
Think "control room / checkpoint operator console."

## 2. App structure

Two full-screen views, toggled in `App.tsx`:

1. **Hero** (landing) — brand + status + "Enter Checkpoint" CTA.
2. **Checkpoint** (the gate) — the operator console where the demo happens.

Plus a decorative **Atmosphere** layer (background glow/scanlines).

Single-page React 19 + TypeScript + Vite. Per-component CSS files, all styling
driven by CSS custom properties in `src/index.css`.

## 3. Screens & components

### 3.1 Hero (`.hero`)
Purpose: set the tone, then push the user into the gate.
- `.hero__badge` — `v0.2 // HUMAN-IN-THE-LOOP FIREWALL`
- `.hero__title` — `CHAPERONE` (display font, huge)
- `.hero__tagline` — `Parental controls, for AI agents.`
- `.hero__cards` — three status chips:
  - **Gate Status** → `Armed`
  - **Approval Mode** → `Human Required`
  - **Intercept** → `Shell + HTTP`
  - Each has a small green dot (`.hero__card-dot--green`).
- `.hero__cta` — button `Enter Checkpoint`
- `.hero__hint` — `Deny blocks execution. Review freezes the agent.`

### 3.2 Checkpoint (`.gate`) — the console
Layout: a top nav, then a two-column body (sidebar + main).

**Top nav (`.gate__nav`)**
- Back: `← Home`
- Logo: `CHAPERONE`
- **Scenario chips** (`.gate__chip`): `Destructive`, `Benign`, `Borderline`,
  `Adversarial`, `Encoded`, `Run All` (active), `Offline`.

**Sidebar — Pending Queue (`.gate__sidebar`)**
- Title: `Pending Queue`
- One item per call awaiting a human. Each item shows: agent name, summary, and
  a **risk-level badge** (low/medium/high/critical). Item's left border is
  color-coded by level. Hidden entirely when the queue is empty.

**Main — Review Card (`.gate__card`)** (shown when a call is pending)
- `.gate__tool-pill` — the tool kind (`shell`, `http`, `fs.read`, …)
- `.gate__card-time` — request time
- **Risk gauge** — a horizontal bar, width = score (0–100), colored by level,
  with the numeric score at the end.
- `.gate__level-badge` — `LOW | MEDIUM | HIGH | CRITICAL`
- **Fail-closed countdown** (`.gate__countdown`) — only on review-tier live
  calls: "Fail-closed in {n}s — no response auto-denies". Turns red/pulsing
  (`.gate__countdown--urgent`) under 10s. Contains a `.gate__countdown-dot`.
- Headline: `Agent wants to run <tool>`
- `.gate__verdict` — the verdict sentence (see §5 for exact strings)
- `.gate__agent-row` — `Agent` label + agent name
- **Payload panel** (`.gate__payload`) — label `Request Payload` + monospace
  code block with the raw call
- **Findings** (`.gate__findings`) — numbered list; each finding has a title and
  a one-line detail
- **Actions** (`.gate__actions`) — two buttons: `Don't Allow` (deny) and `Allow`

**Main — Empty state (`.gate__empty`)** (no pending calls)
- check glyph, `No pending tool calls`, sub `Start a scenario to see the
  checkpoint in action.`, and a `Run All Scenarios` button.

**Main — Decision Log (`.gate__log`)** (bottom, appears once there are decisions)
- Title: `Decision Log`
- One row per decided call: time, a **decision badge** (`approved` green /
  `denied` red), the call summary, and an `auto` tag when the system decided
  without a human.

## 4. Data the UI receives (API contract — do not change)

The UI polls **`GET /api/chaperone/pending`** every ~800 ms. It returns:

```jsonc
{
  "pending": [
    {
      "call":     { "id": "demo_borderline", "toolName": "shell_command", "input": {} },
      "toolCall": { "id", "agent", "tool": "shell", "summary", "payload", "requestedAt" },
      "verdict":  { "level": "medium", "score": 28, "findings": [], "recommendation": "review", "headline": "…" },
      "createdAt": "ISO", "expiresAt": "ISO", "timeoutMs": 30000
    }
  ],
  "audit": [
    {
      "id", "timestamp", "toolName", "inputSummary",
      "riskScore": 60, "riskLevel": "high",
      "decision": "allow | deny | review",
      "decidedBy": "auto | human",
      "finalDecision": "allow | deny",
      "reason": "fail-closed after 30s with no human response"
    }
  ]
}
```

Actions the UI calls:
- `POST /api/chaperone/decide` — body `{ "id", "decision": "allow" | "deny" }`
- `POST /api/chaperone/run` — body `{ "scenario", "useLiveModel": false }`
- `POST /api/chaperone/reset`

**Scenario names:** `destructive | benign-http | borderline | adversarial | encoded | all`.

**Recommended outcomes to design for (what each scenario produces):**

| Scenario | Verdict | Visible result |
|---|---|---|
| Destructive | deny (score 60) | a `denied` / `auto` row in the Decision Log |
| Benign | allow (score 0) | an `approved` / `auto` row |
| Borderline | review (28) | a review card + countdown; human decides |
| Adversarial | review (32) | review card; finding = "Semantic manipulation match" |
| Encoded | allow (0), but blocked at execution | currently an `approved` row (see gap, §8) |

## 5. Vocabulary (exact strings — reuse these)

Risk levels: `low` · `medium` · `high` · `critical`
Recommendations: `allow` · `review` · `deny`
Decided by: `auto` · `human`

Verdict headlines (from the engine):
- deny → `Hold. This action crosses a hard boundary.`
- review → `Pause. A human should confirm intent.`
- allow → `Clear lane. Residual risk is within policy.`

Findings the engine can emit (title / weight):
- `Destructive mutation` / 50
- `Secret exposure path` / 34
- `Prompt injection residue` / 30
- `Privilege escalation` / 28
- `Sensitive path access` / 26
- `External egress` / 26
- `Semantic manipulation match` / 26–32

Tool kinds: `shell` · `http` · `fs.read` · `fs.write` · `db` · `secrets`

## 6. State matrix (design every cell)

Level → color, and the affordance:
- **low** — allow green. Calm. `allow` happens with no UI stall.
- **medium** — amber. "Review": the card is interactive, human decides.
- **high / critical** — orange → red. Auto-denied; only a log row.

Decision log badges: **approved** (green) · **denied** (red).
Auto vs human: `auto` tag/pill distinct from human decisions (human rows have no tag).

Empty vs populated: sidebar hidden when queue empty; Decision Log hidden until
there is at least one decision; card swaps between "review card" and "empty state".

Loading: scenario chips are disabled (`busy`) while a run starts.

## 7. Interaction flows

1. **Hero → gate:** click `Enter Checkpoint`.
2. **Launch a scenario:** click a chip → `reset` then `run` → the UI polls and
   renders whatever appears (card or log rows).
3. **Human decision:** on a review card, click `Allow` or `Don't Allow` →
   `POST /decide` → card disappears, a row lands in the Decision Log.
4. **Fail-closed:** on a review card, do nothing → the countdown hits 0 → the
   card disappears and a `denied` / `auto` row appears.
5. **Offline:** click `Offline` → the UI loads 8 built-in scenarios and scores
   them **client-side** with no server calls (the no-WiFi fallback).
6. **Back:** `← Home` returns to the Hero.

## 8. Known gap the theme can help paper over
The **Encoded** scenario is scored `allow` and then blocked by the *execution*
allowlist — but that block is not yet shown in the UI. If the brief allows a
small UI-only affordance, design a place to surface an "execution blocked" state
(e.g., a muted stamp on the corresponding log row). Otherwise leave it and flag
to the lead.

---

## 9. Design language

### 9.1 Direction (recommended): **BORDER CONTROL — "Passport Checkpoint"**
Chaperone is the immigration officer; each tool call is a traveller at the
border. The product *is* a checkpoint, so this reads instantly and gives one
unforgettable stage moment.
- **Verdicts are rubber stamps:** green `CLEARED`, amber `SECONDARY SCREENING`
  (review), red `ENTRY DENIED` that slams down with a slight screen shake.
- The **Pending Queue** is a "HOLD ROOM."
- The **Payload** panel is a passport/manifest.

*(Alternates if you want a different flavour: **X-Ray Scanner** — scanline sweeps
and threats glow; **Reactor Control Room** — risk = pressure gauge + alarm.)*

### 9.2 Design tokens (`src/index.css`)

Current (mission-control baseline):

```css
:root {
  --bg:#0b1120; --surface:#131d33; --surface-raised:#1a2744;
  --surface-glass:rgba(19,29,51,.7);
  --ink:#e0e6f0; --mute:#6b7a94; --border:#1e2d4a;
  --amber:#f0a500; --amber-dim:rgba(240,165,0,.15);
  --cyan:#00d4ff;  --cyan-dim:rgba(0,212,255,.1);
  --deny:#ff4444;  --deny-dim:rgba(255,68,68,.12);
  --allow:#00e676; --allow-dim:rgba(0,230,118,.12);
  --orange:#ff8800;
  --radius:12px; --radius-sm:8px; --radius-pill:9999px;
  --shadow:0 4px 24px rgba(0,0,0,.3); --shadow-sm:0 2px 8px rgba(0,0,0,.2);
  --blur:blur(16px);
  --font-display:'Bebas Neue',sans-serif;
  --font-body:'Inter',ui-sans-serif,system-ui,sans-serif;
  --font-mono:'Space Mono',ui-monospace,monospace;
}
```

**Border Control override (drop-in):**

```css
:root {
  --bg:#060b18; --surface:#0d1730; --surface-raised:#14224a;
  --surface-glass:rgba(13,23,48,.7);
  --ink:#f1e9d2; --mute:#7d8bb0; --border:#1c2b52;
  --amber:#f0a500; --amber-dim:rgba(240,165,0,.15);
  --cyan:#3ba7d4;  --cyan-dim:rgba(59,167,212,.12);
  --deny:#e63946;  --deny-dim:rgba(230,57,70,.14);
  --allow:#2a9d8f; --allow-dim:rgba(42,157,143,.14);
  --orange:#ff7a1a;
}
```

### 9.3 Signature motions (build in this order)
1. **Verdict stamp** — big rotated stamp (`scale + rotate` + a 2px shake) on
   deny/allow; review gets a "SECONDARY SCREENING" band instead of a stamp.
2. **Scanline sweep** across the payload panel while a call is inspected
   (`translateX` keyframe, ~1.2s, loops twice).
3. **Boarding countdown** — restyle the fail-closed countdown as "FINAL CALL —
   auto-deny in {n}s", red + pulse under 10s.

## 10. Constraints for the UI agent
- **React 19 + TypeScript + Vite**, per-component CSS, styled via the CSS
  variables above. Do **not** introduce a CSS framework or a new runtime dep
  without the lead's OK.
- **Do not touch** `src/lib`, `src/intercept`, `server/**`, or the API contract —
  presentation only. Component logic (`Checkpoint.tsx`, `Hero.tsx`, `App.tsx`)
  may be restructured for layout, but the data flow and handlers must stay.
- **Accessibility:** keep text on `--ink` for contrast; the **risk gauge,
  score, level badge, and countdown must stay fully legible** — judges read them.
- **Responsive:** the gate collapses to a single column under 768px (existing).
- **Performance:** animations must stay cheap (transform/opacity only).
- **Offline:** the `Offline` scenario path must keep working with no network.

## 11. Deliverable
A re-themed, fully working UI that:
- keeps all existing class hooks (or documents replacements),
- renders every state in §6,
- demonstrates the three signature motions in §9.3,
- looks like a **border checkpoint for AI agents**, not a generic dashboard.
