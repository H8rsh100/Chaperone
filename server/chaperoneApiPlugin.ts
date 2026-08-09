import type { Plugin } from 'vite'
import { runWithChaperone } from '../src/intercept/anthropicIntercept'
import { chaperoneToolDefs, toolRegistry } from './toolRegistry'
import {
  clearGate,
  getAuditLog,
  listPending,
  pushAudit,
  requestHumanDecision,
  resolveDecision,
} from './gateStore'

function readJson(req: import('http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function send(
  res: import('http').ServerResponse,
  status: number,
  body: unknown,
) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function chaperoneApiPlugin(): Plugin {
  return {
    name: 'chaperone-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/chaperone')) return next()

        try {
          if (req.method === 'GET' && url.startsWith('/api/chaperone/pending')) {
            return send(res, 200, { pending: listPending(), audit: getAuditLog() })
          }

          if (req.method === 'POST' && url.startsWith('/api/chaperone/decide')) {
            const body = (await readJson(req)) as {
              id?: string
              decision?: 'allow' | 'deny'
            }
            if (!body.id || (body.decision !== 'allow' && body.decision !== 'deny')) {
              return send(res, 400, { error: 'id and decision required' })
            }
            const ok = resolveDecision(body.id, body.decision)
            return send(res, ok ? 200 : 404, { ok })
          }

          if (req.method === 'POST' && url.startsWith('/api/chaperone/reset')) {
            clearGate()
            return send(res, 200, { ok: true })
          }

          if (req.method === 'POST' && url.startsWith('/api/chaperone/run')) {
            const body = (await readJson(req)) as {
              scenario?: 'destructive' | 'benign-http' | 'borderline' | 'all'
              prompt?: string
              useLiveModel?: boolean
            }

            const scenario = body.scenario ?? 'all'
            const apiKey = process.env.ANTHROPIC_API_KEY
            const useLive = Boolean(body.useLiveModel && apiKey)

            const userText =
              body.prompt ??
              (scenario === 'destructive'
                ? 'Clean up temp files aggressively on this machine.'
                : scenario === 'benign-http'
                  ? 'Fetch https://httpbin.org/get and summarize status.'
                  : scenario === 'borderline'
                    ? 'Run the unit test suite with npm test.'
                    : 'Run three tasks: clean temp with rm -rf, fetch httpbin.org/get, then npm test.')

            // Kick off without blocking the HTTP response forever for multi-review flows.
            // Client polls /pending while this runs.
            const runPromise = runWithChaperone(
              [{ role: 'user', content: userText }],
              {
                apiKey: useLive ? apiKey : undefined,
                demoScenario: useLive ? undefined : scenario,
                tools: chaperoneToolDefs,
                onReview: async (call) => requestHumanDecision(call),
                onAudit: (record) => pushAudit({ ...record }),
                executeTool: async (name, input) => {
                  const fn = toolRegistry[name]
                  if (!fn) return { error: `Unknown tool ${name}` }
                  return fn(input)
                },
              },
            )

            // Attach for debugging; response returns immediately with runId status
            void runPromise.then((result) => {
              pushAudit({
                id: `run-complete-${Date.now()}`,
                timestamp: new Date().toISOString(),
                toolName: '(run)',
                inputSummary: `completed scenario=${scenario}`,
                riskScore: 0,
                riskLevel: 'low',
                decision: 'allow',
                decidedBy: 'auto',
                finalText: result.finalText,
                audits: result.audits.length,
              })
            })

            return send(res, 202, {
              started: true,
              mode: useLive ? 'live-anthropic' : 'demo-scripted',
              scenario,
              message:
                'Run started. Poll /api/chaperone/pending for review items and audit.',
            })
          }

          return send(res, 404, { error: 'not found' })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return send(res, 500, { error: message })
        }
      })
    },
  }
}
