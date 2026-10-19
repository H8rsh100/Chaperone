/**
 * Acceptance helper: hits the Vite dev server APIs for the three demo scenarios.
 * Start `npm run dev` first, then run `npm run demo:acceptance`.
 */
const BASE = process.env.CHAPERONE_URL ?? 'http://127.0.0.1:5174'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json()
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  return res.json()
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function runScenario(name) {
  console.log(`\n=== ${name} ===`)
  await post('/api/chaperone/reset')
  const started = await post('/api/chaperone/run', { scenario: name })
  console.log('started:', started)

  for (let i = 0; i < 20; i++) {
    await sleep(400)
    const snap = await get('/api/chaperone/pending')
    const pending = snap.pending ?? []
    const audit = snap.audit ?? []
    console.log(
      `tick ${i}: pending=${pending.length} audit=${audit.length}`,
    )
    if (pending.length) {
      const id = pending[0].call.id
      console.log('resolving review as deny for', id)
      await post('/api/chaperone/decide', {
        id,
        decision: 'deny',
        token: pending[0].decisionToken,
      })
    }
    const latest = audit[0]
    if (latest && String(latest.inputSummary ?? '').includes(`scenario=${name}`)) {
      break
    }
    if (name !== 'borderline' && audit.some((a) => a.toolName && a.toolName !== '(run)')) {
      // auto path finished at least one tool decision
      if (i > 3) break
    }
  }

  const finalSnap = await get('/api/chaperone/pending')
  console.log(
    'audit sample:',
    (finalSnap.audit ?? []).slice(0, 4).map((a) => ({
      tool: a.toolName,
      decision: a.finalDecision ?? a.decision,
      by: a.decidedBy,
      score: a.riskScore,
    })),
  )
}

async function main() {
  await runScenario('destructive')
  await runScenario('benign-http')
  await runScenario('borderline')
  await runScenario('adversarial')
  await runScenario('encoded')
  console.log('\nAcceptance API passes complete. Record the UI screen capture next.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
