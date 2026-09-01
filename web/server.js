// Command center server.
//
//   node server.js [--port 7777]
//
// Zero dependencies — Node's http module and static files. Nothing to install.
//
// Beyond the first version:
//   * true token streaming (claude -p --output-format stream-json)
//   * real conversation continuity via Claude's own session ids (--resume),
//     rather than replaying a transcript into every prompt
//   * live tool-call visibility — you see what it runs, while it runs
//   * artifacts: files touched during a turn surface in a side panel
//   * multiple conversations, persisted across restarts
//
// Any file in this directory is served statically (index.html, portfolio.html,
// anything an agent writes here later).
//
// Bound to 127.0.0.1. It executes real commands; never expose it without auth.

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const WA_DIR = process.env.WA_DIR || path.join(os.homedir(), 'Workflow Automation')
// fileURLToPath, not URL().pathname — the directory name contains a space, and
// .pathname leaves it percent-encoded, which is not a usable path.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const STATE = path.join(WA_DIR, '.web')
const CONVOS = path.join(STATE, 'conversations')
const UPLOADS = path.join(STATE, 'uploads')

const PORT = Number(process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1] : 7777)

const TIERS = {
  sub: {},
  free: {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${process.env.FREE_PROXY_PORT || 8787}`,
    ANTHROPIC_AUTH_TOKEN: 'free-proxy',
    ANTHROPIC_API_KEY: 'free-proxy',
    ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
    ANTHROPIC_SMALL_FAST_MODEL: 'claude-3-5-haiku-20241022',
  },
  ar: {
    ANTHROPIC_BASE_URL: process.env.AGENTROUTER_BASE_URL || 'https://agentrouter.org',
    ANTHROPIC_AUTH_TOKEN: process.env.AGENTROUTER_API_KEY,
    ANTHROPIC_API_KEY: process.env.AGENTROUTER_API_KEY,
    ANTHROPIC_MODEL: 'claude-opus-5',
    ANTHROPIC_SMALL_FAST_MODEL: 'claude-opus-4-8',
  },
}

const TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch',
  'WebSearch', 'Task', 'TodoWrite', 'NotebookEdit']

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const envFor = (tier) => ({
  ...process.env, WA_DIR,
  PATH: `${WA_DIR}/bin:/usr/local/bin:${process.env.PATH}`,
  ...(TIERS[tier] || {}),
})

// --- persistence -----------------------------------------------------------

const convoPath = id => path.join(CONVOS, `${id}.json`)

async function loadConvo(id) {
  if (!id) return null
  try { return JSON.parse(await readFile(convoPath(id), 'utf8')) } catch { return null }
}
async function saveConvo(c) {
  c.updated = new Date().toISOString()
  await writeFile(convoPath(c.id), JSON.stringify(c, null, 1))
}
async function listConvos() {
  try {
    const out = []
    for (const f of (await readdir(CONVOS)).filter(f => f.endsWith('.json'))) {
      const c = await loadConvo(f.slice(0, -5))
      if (c?.messages) {
        out.push({ id: c.id, title: c.title, updated: c.updated, count: c.messages.length })
      }
    }
    return out.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
  } catch { return [] }
}

// --- one streaming turn ----------------------------------------------------

// Signatures that mean "this tier is out of quota", not "the task failed".
const LIMIT_RE = /usage limit|rate.?limit|quota|exceeded your|429|overloaded/i

// Escalation order: subscription (already paid) -> free ($0, verified able to
// run tools) -> AgentRouter (paid, last resort). Free sits in the middle so a
// spent subscription never silently starts costing money.
const FALLBACK = { sub: 'free', free: 'ar', ar: null }

function runTurn({ prompt, sessionId, tier, res }) {
  return new Promise((resolve) => {
    const args = ['-p', prompt,
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--allowedTools', ...TOOLS]

    // Resuming keeps the model's real context, instead of us re-feeding a
    // summary of it. Only valid once Claude has handed us a session id.
    if (sessionId) args.push('--resume', sessionId)

    const proc = spawn('claude', args, { cwd: WA_DIR, env: envFor(tier) })

    let text = ''
    let sid = sessionId || null
    let hitLimit = false
    const artifacts = new Map()
    let buf = ''

    const send = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`) } catch {} }
    current.proc = proc

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() || ''       // keep the trailing partial line

      for (const line of lines) {
        if (!line.trim()) continue
        let ev
        try { ev = JSON.parse(line) } catch { continue }

        if (ev.session_id && !sid) { sid = ev.session_id; send({ t: 'session', sid }) }

        if (ev.type === 'stream_event') {
          const e = ev.event
          if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
            text += e.delta.text
            send({ t: 'delta', text: e.delta.text })
          }
        }

        // Full assistant messages carry tool inputs — that's where file paths
        // appear, which is how artifacts get discovered.
        if (ev.type === 'assistant' || ev.type === 'message') {
          for (const c of ev.message?.content || []) {
            if (c.type === 'tool_use') {
              send({ t: 'tool', name: c.name, detail: summarizeTool(c) })
              const p = c.input?.file_path || c.input?.notebook_path
              if (p) artifacts.set(p, c.name)
            }
          }
        }

        if (ev.type === 'result') {
          if (LIMIT_RE.test(JSON.stringify(ev))) hitLimit = true
          send({ t: 'result', subtype: ev.subtype })
        }
      }
    })

    proc.stderr.on('data', (d) => {
      const s = d.toString()
      if (LIMIT_RE.test(s)) hitLimit = true
      // Claude writes benign notices to stderr; only surface real failures.
      if (/error|failed|denied|refus/i.test(s)) send({ t: 'stderr', text: s.slice(0, 400) })
    })

    proc.on('close', async () => {
      current.proc = null
      const files = []
      for (const [p, tool] of artifacts) {
        try {
          const st = await stat(p)
          if (st.size < 400_000) {
            files.push({ path: p, name: path.basename(p), tool,
              content: await readFile(p, 'utf8') })
          }
        } catch { /* temp file, or binary we can't show */ }
      }
      if (files.length) send({ t: 'artifacts', files })
      resolve({ text: text.trim(), sid, artifacts: files, hitLimit, tier })
    })

    proc.on('error', (e) => {
      current.proc = null
      send({ t: 'stderr', text: e.message })
      resolve({ text: `Failed to start claude: ${e.message}`, sid, artifacts: [], hitLimit: false, tier })
    })
  })
}

// Tracks the in-flight chat turn so it can be cancelled from the UI.
const current = { proc: null }

function summarizeTool(c) {
  const i = c.input || {}
  if (c.name === 'Bash') return String(i.command || '').slice(0, 200)
  return i.file_path || i.pattern || i.url
    || (i.query ? String(i.query).slice(0, 120) : '')
}

// --- agent fleet -----------------------------------------------------------

const agents = new Map()
const agentClients = new Set()

function emitAgents(o) {
  const p = `data: ${JSON.stringify(o)}\n\n`
  for (const r of agentClients) { try { r.write(p) } catch { agentClients.delete(r) } }
}

const agentView = ({ proc, ...a }) => ({ ...a, output: (a.output || '').slice(-8000) })

function runAgent({ name, role, task, tier = 'sub', goalId = null }) {
  const id = randomUUID().slice(0, 8)
  const prompt = [
    `You are "${name}", a ${role} agent working for Joshua Usifoh.`,
    '', 'Assignment:', task, '',
    `You run inside ${WA_DIR}; the wa-* tools are on PATH (wa-video, wa-email,`,
    'wa-screen, wa-daily, wa-agent, wa-social, wa-doctor), plus gh and ruflo.',
    'Read CAPABILITIES.md if you need to check what exists.',
    '',
    'Do the work — actually run things rather than describing them.',
    'End with a short report: what you did, what you found, what is still open.',
    'If something was not possible, say so plainly instead of inventing a result.',
  ].join('\n')

  const proc = spawn('claude', ['-p', prompt, '--allowedTools', ...TOOLS],
    { cwd: WA_DIR, env: envFor(tier) })

  const a = { id, name, role, task, tier, goalId, status: 'running', output: '',
    started: new Date().toISOString(), finished: null, proc }
  agents.set(id, a)
  emitAgents({ event: 'agent:start', agent: agentView(a) })
  log(`agent ${name} (${id}) started`)

  proc.stdout.on('data', d => {
    a.output += d.toString()
    emitAgents({ event: 'agent:output', id, chunk: d.toString() })
  })
  proc.stderr.on('data', d => { a.output += d.toString() })
  proc.on('close', code => {
    a.status = code === 0 ? 'done' : 'failed'
    a.finished = new Date().toISOString()
    a.proc = null
    emitAgents({ event: 'agent:done', agent: agentView(a) })
    log(`agent ${name} ${a.status}`)
  })
  proc.on('error', e => {
    a.status = 'failed'; a.output += `\n${e.message}`; a.proc = null
    emitAgents({ event: 'agent:done', agent: agentView(a) })
  })
  return a
}

// --- supervisor ------------------------------------------------------------

function claudeOnce(prompt, tier = 'sub') {
  return new Promise(resolve => {
    const proc = spawn('claude', ['-p', prompt, '--allowedTools', ...TOOLS],
      { cwd: WA_DIR, env: envFor(tier) })
    let out = ''
    proc.stdout.on('data', d => { out += d })
    proc.on('close', () => resolve(out.trim()))
    proc.on('error', e => resolve(`error: ${e.message}`))
  })
}

const goals = new Map()

async function planGoal(goal, tier) {
  const raw = await claudeOnce(`You are the supervisor of an agent fleet working for
Joshua Usifoh — Lagos-based founder of Blu Tech Learn (AI EdTech) and NepaWatch
(Nigerian power-outage tracker), full-stack developer and B2B sales operator.

His goal:
"${goal}"

Break it into 3-6 workstreams, each assigned to one specialist agent. Every task
must be something an agent can START NOW using web research, file work, or local
tooling — not vague advice like "build a great product". Each needs a concrete
deliverable.

Respond with ONLY a JSON array, no prose and no code fence:
[{"name":"agent-name","role":"specialty","task":"specific assignment with a deliverable"}]`, tier)

  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) return { error: 'supervisor returned no usable plan', raw: raw.slice(0, 1500) }
  try { return { tasks: JSON.parse(m[0]) } }
  catch (e) { return { error: `unparseable plan: ${e.message}`, raw: raw.slice(0, 1500) } }
}

// --- http helpers ----------------------------------------------------------

const json = (res, code, b) => {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(b))
}

async function readBody(req) {
  const c = []
  for await (const x of req) c.push(x)
  return c.length ? JSON.parse(Buffer.concat(c).toString()) : {}
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  try {
    // Static: anything in web/, including pages agents write there later.
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
      const file = path.resolve(HERE, rel)
      if (!file.startsWith(HERE)) { res.writeHead(403); return res.end('forbidden') }
      try {
        const data = await readFile(file)
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'text/plain' })
        return res.end(data)
      } catch { res.writeHead(404); return res.end('not found') }
    }

    if (url.pathname === '/api/conversations') {
      return json(res, 200, { conversations: await listConvos() })
    }

    if (url.pathname === '/api/conversation' && req.method === 'GET') {
      return json(res, 200, { conversation: await loadConvo(url.searchParams.get('id')) })
    }

    if (url.pathname === '/api/conversation' && req.method === 'DELETE') {
      const { id } = await readBody(req)
      try { await unlink(convoPath(id)) } catch {}
      return json(res, 200, { ok: true })
    }

    // Streaming chat — the response body IS the SSE stream for this turn.
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const { message, tier, conversationId, attachments } = await readBody(req)
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })

      let convo = await loadConvo(conversationId)
      if (!convo) {
        convo = { id: randomUUID().slice(0, 8), title: (message || 'New chat').slice(0, 60),
          sessionId: null, messages: [], created: new Date().toISOString() }
        res.write(`data: ${JSON.stringify({ t: 'conversation', id: convo.id, title: convo.title })}\n\n`)
      }

      let prompt = message
      if (attachments?.length) {
        prompt += `\n\nAttached files (read them if relevant):\n${attachments.map(a => `- ${a}`).join('\n')}`
      }
      // Brief the model only on the first turn; --resume carries it after that.
      // MEMORY.md is the cross-conversation spine — it persists what matters
      // between chats, so a new conversation isn't a stranger.
      if (!convo.sessionId) {
        let memory = ''
        try { memory = await readFile(path.join(WA_DIR, 'MEMORY.md'), 'utf8') } catch {}
        prompt = `You are Joshua's AI command center, running on his Mac in ${WA_DIR}.

The wa-* tools are on PATH (wa-video, wa-email, wa-screen, wa-daily, wa-agent,
wa-social, wa-doctor, wa-schedule), plus gh, ruflo, ffmpeg and whisper-cli.
Read CAPABILITIES.md for the full list. Be concise and concrete — actually run
things rather than describing them. Use markdown; put code in fenced blocks.

When Joshua tells you something worth remembering across conversations — a
preference, a decision, a fact about a project — append it to MEMORY.md yourself
using Edit. Do not ask permission; just record it and mention you did.
${memory ? `\nWhat you already know:\n\n${memory}\n` : ''}
${prompt}`
      }

      convo.messages.push({ role: 'user', text: message, at: new Date().toISOString() })

      // Automatic failover. If the chosen tier is out of quota, escalate rather
      // than handing back an error — that is the whole point of having tiers.
      let startTier = tier || 'sub'
      let out = await runTurn({ prompt, sessionId: convo.sessionId, tier: startTier, res })

      while (out.hitLimit && FALLBACK[out.tier]) {
        const next = FALLBACK[out.tier]
        log(`tier ${out.tier} out of quota -> ${next}`)
        res.write(`data: ${JSON.stringify({ t: 'tier', from: out.tier, to: next })}\n\n`)
        // Session ids do not transfer between providers, so the resumed
        // context is dropped and the turn restarts on the new tier.
        out = await runTurn({ prompt, sessionId: null, tier: next, res })
      }
      res.write(`data: ${JSON.stringify({ t: 'done' })}\n\n`)
      convo.sessionId = out.sid || convo.sessionId
      convo.messages.push({ role: 'assistant', text: out.text,
        artifacts: out.artifacts.map(f => ({ path: f.path, name: f.name })),
        at: new Date().toISOString() })
      await saveConvo(convo)
      return res.end()
    }

    if (url.pathname === '/api/chat/stop' && req.method === 'POST') {
      if (current.proc) { current.proc.kill('SIGTERM'); current.proc = null }
      return json(res, 200, { ok: true })
    }

    // The 271 indexed specialist personas, for the picker.
    if (url.pathname === '/api/specialists') {
      try {
        const idx = JSON.parse(await readFile(
          path.join(WA_DIR, '.router-state', 'agents-index.json'), 'utf8'))
        return json(res, 200, {
          specialists: idx.map(a => ({
            slug: a.slug, name: a.name, division: a.division,
            emoji: a.emoji, description: (a.description || '').slice(0, 220),
          })),
        })
      } catch (e) {
        return json(res, 200, { specialists: [], error: 'run: wa-agent index' })
      }
    }

    if (url.pathname === '/api/agents' && req.method === 'GET') {
      return json(res, 200, { agents: [...agents.values()].map(agentView) })
    }
    if (url.pathname === '/api/agents' && req.method === 'POST') {
      const { name, role, task, tier } = await readBody(req)
      if (!task) return json(res, 400, { error: 'task required' })
      return json(res, 200, { agent: agentView(runAgent({
        name: name || 'agent', role: role || 'generalist', task, tier: tier || 'sub' })) })
    }
    if (url.pathname === '/api/agents/stop' && req.method === 'POST') {
      const { id } = await readBody(req)
      const a = agents.get(id)
      if (a?.proc) { a.proc.kill('SIGTERM'); a.status = 'stopped' }
      return json(res, 200, { ok: true })
    }
    if (url.pathname === '/api/agents/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream',
        'cache-control': 'no-cache', connection: 'keep-alive' })
      res.write(': ok\n\n')
      agentClients.add(res)
      req.on('close', () => agentClients.delete(res))
      return
    }

    if (url.pathname === '/api/goal' && req.method === 'POST') {
      const { goal, tier, autostart } = await readBody(req)
      if (!goal) return json(res, 400, { error: 'goal required' })
      const plan = await planGoal(goal, tier || 'sub')
      if (plan.error) return json(res, 200, plan)
      const id = randomUUID().slice(0, 8)
      goals.set(id, { id, goal, tasks: plan.tasks })
      const spawned = autostart
        ? plan.tasks.map(t => agentView(runAgent({ ...t, tier: tier || 'sub', goalId: id })))
        : []
      return json(res, 200, { id, goal, tasks: plan.tasks, spawned })
    }

    if (url.pathname === '/api/file' && req.method === 'GET') {
      try { return json(res, 200, { content: await readFile(url.searchParams.get('path'), 'utf8') }) }
      catch (e) { return json(res, 404, { error: e.message }) }
    }

    if (url.pathname === '/api/upload' && req.method === 'POST') {
      const { name, dataUrl } = await readBody(req)
      const b64 = String(dataUrl).split(',')[1] || ''
      const safe = `${Date.now()}-${name}`.replace(/[^\w.\-]/g, '_')
      const dest = path.join(UPLOADS, safe)
      await writeFile(dest, Buffer.from(b64, 'base64'))
      return json(res, 200, { path: dest })
    }

    // Voice notes from the browser. MediaRecorder gives webm/opus; whisper
    // needs 16kHz mono PCM, so ffmpeg converts before transcription. All local.
    if (url.pathname === '/api/transcribe' && req.method === 'POST') {
      const { dataUrl } = await readBody(req)
      const b64 = String(dataUrl).split(',')[1] || ''
      const stamp = Date.now()
      const src = path.join(UPLOADS, `note-${stamp}.webm`)
      const wav = path.join(UPLOADS, `note-${stamp}.wav`)
      await writeFile(src, Buffer.from(b64, 'base64'))

      const run = (cmd, args) => new Promise((resolve, reject) => {
        const p = spawn(cmd, args)
        let err = ''
        p.stderr.on('data', d => { err += d })
        p.on('close', c => c === 0 ? resolve() : reject(new Error(err.slice(-400))))
        p.on('error', reject)
      })

      try {
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src,
          '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav])
      } catch (e) {
        return json(res, 500, { error: `audio convert failed: ${e.message}` })
      }

      const model = path.join(WA_DIR, 'models', 'ggml-base.en.bin')
      const out = await new Promise(resolve => {
        const p = spawn('whisper-cli', ['-m', model, '-f', wav, '-nt', '-np'],
          { env: envFor('sub') })
        let s = ''
        p.stdout.on('data', d => { s += d })
        p.on('close', () => resolve(s))
        p.on('error', () => resolve(''))
      })

      const text = out.replace(/\s+/g, ' ').trim()
      // Whisper brackets non-speech: "[BLANK_AUDIO]", "(wind blowing)".
      const junk = /^[\[(].*[\])]$/.test(text) || text.length < 2
      return json(res, 200, { text: junk ? '' : text })
    }

    if (url.pathname === '/api/health') {
      return json(res, 200, { ok: true, wa: WA_DIR, agents: agents.size })
    }

    res.writeHead(404); res.end('not found')
  } catch (e) {
    log('error:', e.message)
    try { json(res, 500, { error: e.message }) } catch {}
  }
})

await mkdir(CONVOS, { recursive: true })
await mkdir(UPLOADS, { recursive: true })

server.listen(PORT, '127.0.0.1', () => {
  log(`command center → http://127.0.0.1:${PORT}`)
  log('localhost only — do not expose without auth')
})
