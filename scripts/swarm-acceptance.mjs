/**
 * Chaperone swarm acceptance: drives the live API through a poisoned run and a
 * clean control run, asserting isolation, kernel denial, hold resolution, and
 * the sanitized resume. Start `npm run dev`, then `npm run swarm:acceptance`.
 */
const BASE = process.env.CHAPERONE_URL ?? 'http://localhost:5174'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json() }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

function fail(message) {
  throw new Error(message)
}

async function reset() {
  await post('/api/swarm/reset').catch(() => {})
}

async function waitFor(label, predicate, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const snap = await get('/api/swarm/state')
    const pending = await get('/api/chaperone/pending')
    const hit = await predicate(snap, pending)
    if (hit) return hit
    await sleep(120)
  }
  fail(`Timed out waiting for ${label}`)
}

function observe(snap, tracker) {
  const state = snap.state
  if (!state) return
  tracker.maxContamination = Math.max(tracker.maxContamination, state.contamination)
  tracker.peak = Math.max(tracker.peak ?? 0, state.peakContamination ?? 0)
  if (state.isolated.includes('executor')) tracker.sawIsolation = true
  if (state.phase === 'held') tracker.sawHold = true
  if (state.kernel) tracker.kernel = state.kernel
  if (state.saliency) tracker.saliency = state.saliency
}

async function poisonedRun() {
  console.log('\n=== poisoned swarm (tainted retrieval) ===')
  await reset()
  const started = await post('/api/swarm/run', { mode: 'poisoned' })
  check('run accepted', started.status === 202, `status ${started.status}`)

  const tracker = { maxContamination: 0, sawIsolation: false, sawHold: false }

  const hold = await waitFor('the human containment hold', async (snap, pending) => {
    observe(snap, tracker)
    const item = pending.pending?.find((p) => p.call.toolName === 'swarm_quarantine')
    if (item) {
      // The pending item can race one poll ahead of the published snapshot.
      tracker.sawHold = true
      return { snap, item }
    }
    if (!snap.running && snap.state) return { snap, item: null }
    return null
  })

  if (hold.item) {
    console.log(
      `hold opened: ${hold.item.call.id} · ${hold.item.verdict.score}% · ` +
        `${Math.round((new Date(hold.item.expiresAt) - Date.now()) / 1000)}s left`,
    )
    const decided = await post('/api/chaperone/decide', {
      id: hold.item.call.id,
      decision: 'deny',
      token: hold.item.decisionToken,
    })
    check('operator denied containment', decided.status === 200, `status ${decided.status}`)
  } else {
    console.log('hold was not observed (the run already failed closed)')
  }

  const done = await waitFor('the poisoned run to settle', async (snap) => {
    observe(snap, tracker)
    return snap.running ? null : snap
  })

  const state = done.state
  check('executor was isolated', tracker.sawIsolation)
  check('human hold opened', tracker.sawHold)
  check(
    'contamination crossed the danger line',
    tracker.maxContamination >= 65,
    `max ${tracker.maxContamination}%`,
  )
  check(
    'kernel blocked the tainted shell call',
    tracker.kernel?.outcome === 'blocked_by_policy' && tracker.kernel?.score >= 50,
    `${tracker.kernel?.outcome} · score ${tracker.kernel?.score}`,
  )
  check(
    'taint carry-over reached the sink',
    (tracker.saliency?.carry ?? 0) >= 0.5,
    `carry ${Math.round((tracker.saliency?.carry ?? 0) * 100)}%`,
  )
  check(
    'high-risk finding is the taint sentinel',
    !!tracker.kernel?.findings?.some((f) => f.id === 'taint-flow'),
  )
  check(
    'planner and retriever state survived',
    state?.nodes?.find((n) => n.id === 'planner')?.status === 'done' &&
      state?.nodes?.find((n) => n.id === 'executor')?.status === 'quarantined',
  )
  check('run settled contained', state?.phase === 'contained', state?.phase)

  const audit = (await get('/api/chaperone/pending')).audit ?? []
  const holdEntry = audit.find((a) => a.toolName === 'swarm_quarantine')
  check(
    'isolation decision written to the ledger',
    !!holdEntry && holdEntry.decision === 'deny',
    holdEntry ? `${holdEntry.decidedBy} · ${holdEntry.outcome}` : 'missing',
  )
  const execEntry = audit.find(
    (a) => a.toolName === 'shell_command' && a.inputSummary?.includes('ZQ7XK2M9'),
  )
  check('kernel denial written to the ledger', !!execEntry, execEntry?.outcome)
}

async function benignRun() {
  console.log('\n=== clean control swarm (benign retrieval) ===')
  await reset()
  const started = await post('/api/swarm/run', { mode: 'benign' })
  check('control run accepted', started.status === 202, `status ${started.status}`)

  const tracker = { maxContamination: 0, sawIsolation: false, sawHold: false }
  const done = await waitFor('the control run to settle', async (snap) => {
    observe(snap, tracker)
    return snap.running ? null : snap
  })

  const state = done.state
  check('control run completed', state?.phase === 'complete', state?.phase)
  check('no agent isolated', (state?.isolated ?? []).length === 0)
  check(
    'clean call executed through the kernel',
    state?.kernel?.outcome === 'executed',
    state?.kernel?.outcome,
  )
  check(
    'contamination stayed out of the danger line',
    tracker.maxContamination < 65,
    `max ${tracker.maxContamination}%`,
  )
  check(
    'no taint carry-over',
    (state?.saliency?.carry ?? 0) === 0,
    `carry ${Math.round((state?.saliency?.carry ?? 0) * 100)}%`,
  )
}

async function resumedRun() {
  console.log('\n=== poisoned swarm + operator resume ===')
  await reset()
  await post('/api/swarm/run', { mode: 'poisoned' })

  const hold = await waitFor('the human containment hold', async (snap, pending) => {
    const item = pending.pending?.find((p) => p.call.toolName === 'swarm_quarantine')
    if (item) return { item }
    if (!snap.running && snap.state) return { item: null }
    return null
  })

  if (!hold.item) {
    check('resume path reached the hold', false, 'hold already expired')
    return
  }

  const decided = await post('/api/chaperone/decide', {
    id: hold.item.call.id,
    decision: 'allow',
    token: hold.item.decisionToken,
  })
  check('operator confirmed containment', decided.status === 200, `status ${decided.status}`)

  const done = await waitFor('the resumed run to settle', async (snap) =>
    snap.running ? null : snap,
  )
  const state = done.state
  check('run completed after resume', state?.phase === 'complete', state?.phase)
  check('executor released on sanitized context', (state?.isolated ?? []).length === 0)
  check(
    'contamination estimate after replacement context',
    state?.contamination < 30,
    `${state?.contamination}%`,
  )
  check(
    'sanitized action recorded',
    state?.events?.some((e) => e.kind === 'resume'),
  )
}

async function main() {
  console.log(`Chaperone swarm acceptance against ${BASE}`)
  await poisonedRun()
  await benignRun()
  await resumedRun()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('failed:', failed.map((r) => r.name).join(' | '))
    process.exit(1)
  }
  console.log('Chaperone swarm acceptance passes.')
}

main().catch((err) => {
  console.error('\nChaperone swarm acceptance failed:', err.message)
  process.exit(1)
})
