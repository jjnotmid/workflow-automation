// WhatsApp command center.
//
// Message the bot from your phone; it runs on your Mac with the full workflow
// toolkit and messages you back. Voice notes are transcribed locally with
// whisper, images and documents are handed to Claude, and everything routes
// through the same three model tiers as the desktop setup.
//
//   node bot.js            start (shows a QR to scan the first time)
//
// SECURITY: this executes commands on your Mac in response to WhatsApp
// messages. It therefore replies ONLY to numbers in ALLOWED_NUMBERS. Anyone
// else is ignored silently. Do not widen that list casually — a permissive
// allowlist here is a remote shell for whoever finds the number.

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import { writeFile, mkdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const execFileP = promisify(execFile)

const WA_DIR = process.env.WA_DIR || path.join(os.homedir(), 'Workflow Automation')
const STATE_DIR = path.join(WA_DIR, '.whatsapp')
const MEDIA_DIR = path.join(STATE_DIR, 'media')
const WHISPER_MODEL = path.join(WA_DIR, 'models', 'ggml-base.en.bin')

// Only these numbers may drive the machine. Digits only, with country code.
// Loaded from allowed.json so the list isn't baked into source.
let ALLOWED_NUMBERS = []

const TIER = process.env.WA_BOT_TIER || 'sub'

// WA_BOT_DEBUG=1 logs every inbound message envelope — use it when messages
// appear to vanish, to see the actual type/jid/fromMe values arriving.
const DEBUG = process.env.WA_BOT_DEBUG === '1'

// Broad allowlist — Joshua asked for everything pre-approved so requests run
// immediately instead of stalling on a prompt he can't see from his phone.
// `Bash` unqualified means ANY shell command. That is a real remote shell,
// gated solely by the number allowlist below. Keep that list to his own number.
const ALLOWED_TOOLS = [
  'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
  'Task', 'TodoWrite', 'NotebookEdit',
  // Direct MCP access — same ruflo tool surface as the interactive session,
  // not just the CLI-via-Bash fallback.
  'mcp__ruflo',
]

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// Baileys' own internals (message-retry, session decrypt) can throw outside
// handleMessage's try/catch, on a callback this process doesn't control. Left
// unhandled, that kills the entire bot — which is what actually happened
// during setup. Log it and keep running; the socket's own reconnect logic
// deals with real connection loss.
process.on('uncaughtException', (err) => {
  log('uncaught exception (bot kept running):', err?.message || err)
})
process.on('unhandledRejection', (err) => {
  log('unhandled rejection (bot kept running):', err?.message || err)
})

async function loadAllowlist() {
  const file = path.join(STATE_DIR, 'allowed.json')
  if (!existsSync(file)) {
    log('!! no allowed.json — bot will ignore EVERY message until you add one.')
    log('   create', file, 'containing e.g. ["2348012345678"]')
    return []
  }
  const list = JSON.parse(await readFile(file, 'utf8'))
  log('allowlist:', list.length, 'number(s)')
  return list.map(String)
}

// --- model tiers -----------------------------------------------------------
//
// `claude-free` (the shell function everywhere else) calls free-proxy-start
// before running. This bot talks to the proxy directly and never did that —
// so a fallback to 'free' when the proxy happened to be down would hit
// connection-refused, not a quota message, and just fail instead of
// continuing on to AgentRouter. ensureFreeProxy() closes that gap.

const FREE_PROXY_PORT = process.env.FREE_PROXY_PORT || '8787'
const ROUTER_DIR = path.join(WA_DIR, 'router')

async function freeProxyUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${FREE_PROXY_PORT}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch { return false }
}

async function ensureFreeProxy() {
  if (await freeProxyUp()) return true
  log('free proxy not running — starting it')
  const { spawn } = await import('node:child_process')
  const child = spawn('python3', ['free_proxy.py', '--port', FREE_PROXY_PORT], {
    cwd: ROUTER_DIR, detached: true, stdio: 'ignore',
  })
  child.unref()
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await freeProxyUp()) { log('free proxy up on', FREE_PROXY_PORT); return true }
  }
  log('free proxy failed to come up — skipping to next tier')
  return false
}

function tierEnv(tier) {
  const base = { ...process.env, WA_DIR, PATH: `${WA_DIR}/bin:/usr/local/bin:${process.env.PATH}` }
  if (tier === 'free') {
    const port = FREE_PROXY_PORT
    return {
      ...base,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      ANTHROPIC_AUTH_TOKEN: 'free-proxy',
      ANTHROPIC_API_KEY: 'free-proxy',
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
      ANTHROPIC_SMALL_FAST_MODEL: 'claude-3-5-haiku-20241022',
    }
  }
  if (tier === 'ar') {
    return {
      ...base,
      ANTHROPIC_BASE_URL: process.env.AGENTROUTER_BASE_URL || 'https://agentrouter.org',
      ANTHROPIC_AUTH_TOKEN: process.env.AGENTROUTER_API_KEY,
      ANTHROPIC_API_KEY: process.env.AGENTROUTER_API_KEY,
      ANTHROPIC_MODEL: 'claude-opus-5',
      ANTHROPIC_SMALL_FAST_MODEL: 'claude-opus-4-8',
    }
  }
  return base // subscription
}

// --- conversation memory ---------------------------------------------------
//
// Every `claude -p` used to be a cold start stitched back together from a
// manually-replayed 12-turn text transcript — a poor substitute for real
// conversation state. `--continue` isn't right either: it resumes "the most
// recent conversation in this directory", which the voice assistant and
// interactive sessions also use, so they'd hijack each other. Instead the bot
// gets one dedicated Claude session (its own UUID) and resumes *that specific
// session* every time — real multi-turn memory, no collision with anything
// else running in this directory.

const SESSION_FILE = path.join(STATE_DIR, 'claude-session-id')
let sessionIsNew = false

async function sessionId() {
  try {
    const id = (await readFile(SESSION_FILE, 'utf8')).trim()
    if (id) return id
  } catch { /* no session yet */ }
  const id = crypto.randomUUID()
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(SESSION_FILE, id)
  sessionIsNew = true
  return id
}

async function sessionArgs() {
  const id = await sessionId()
  const args = sessionIsNew ? ['--session-id', id] : ['--resume', id]
  sessionIsNew = false // only the call that actually creates the file starts fresh
  return args
}

async function resetSession() {
  await rm(SESSION_FILE, { force: true })
}

// Lightweight plain-text audit log, kept for debugging — no longer used to
// reconstruct context, since --resume now does that for real.
const HISTORY_FILE = path.join(STATE_DIR, 'history.json')
const HISTORY_TURNS = 12

async function saveTurn(role, text) {
  let h = []
  try { h = JSON.parse(await readFile(HISTORY_FILE, 'utf8')) } catch { /* first run */ }
  h.push({ role, text: String(text).slice(0, 4000), at: new Date().toISOString() })
  await writeFile(HISTORY_FILE, JSON.stringify(h.slice(-HISTORY_TURNS * 2), null, 1))
}

// Shared long-term memory. The web UI, voice assistant and this bot all read
// the same MEMORY.md, so telling one thing to one surface is known by all.
async function memoryBlock() {
  try {
    const m = await readFile(path.join(WA_DIR, 'MEMORY.md'), 'utf8')
    return `\n\nWhat you already know about Joshua:\n\n${m}\n`
  } catch { return '' }
}

// Signatures that mean "out of quota", not "the task failed".
const LIMIT_RE = /usage limit|rate.?limit|quota|exceeded your|429|overloaded/i
// subscription -> free ($0) -> AgentRouter (paid). Free before paid, always.
const FALLBACK = { sub: 'free', free: 'ar', ar: null }

// Multi-agent swarm work can run long; give it real headroom instead of
// getting cut off mid-flight. Override with WA_BOT_TIMEOUT_MS if needed.
const TIMEOUT_MS = Number(process.env.WA_BOT_TIMEOUT_MS) || 30 * 60 * 1000

// Human-readable tier names for the "switched tier" note appended to replies.
const TIER_LABEL = { sub: 'subscription', free: 'free', ar: 'AgentRouter (paid)' }

async function askClaude(prompt, tier = TIER) {
  const startTier = tier
  let cur = tier
  let args = await sessionArgs()
  let retriedSession = false
  while (cur) {
    if (cur === 'free' && !(await ensureFreeProxy())) {
      const next = FALLBACK[cur]
      if (next) { cur = next; continue }
      return 'Every model tier is out of quota right now.'
    }
    try {
      const { stdout, stderr } = await execFileP(
        'claude',
        ['-p', prompt, ...args, '--allowedTools', ...ALLOWED_TOOLS],
        { cwd: WA_DIR, env: tierEnv(cur), maxBuffer: 20 * 1024 * 1024, timeout: TIMEOUT_MS },
      )
      const out = stdout.trim()
      // A quota message can arrive on either stream with a zero exit code.
      if (LIMIT_RE.test(stderr || '') || (!out && LIMIT_RE.test(stdout))) {
        const next = FALLBACK[cur]
        if (next) { log(`tier ${cur} out of quota -> ${next}`); cur = next; continue }
      }
      // Tell Joshua when a fallback actually happened — this used to be
      // silent (only in the log file), so a reply from a different tier
      // looked identical to a normal one.
      if (cur !== startTier) {
        return `${out}\n\n[switched to ${TIER_LABEL[cur]} tier]`
      }
      return out
    } catch (err) {
      const msg = `${err.stderr || ''} ${err.shortMessage || err.message}`
      // The resumed session id can go stale (e.g. its history was pruned).
      // Start a fresh one once rather than fail the whole message.
      if (/no conversation found|session.*not found|invalid session/i.test(msg) && !retriedSession) {
        log('session resume failed, starting fresh:', msg.slice(0, 200))
        await resetSession()
        args = await sessionArgs()
        retriedSession = true
        continue
      }
      const next = FALLBACK[cur]
      if (LIMIT_RE.test(msg) && next) {
        log(`tier ${cur} out of quota -> ${next}`)
        cur = next
        continue
      }
      log('claude failed:', err.shortMessage || err.message)
      return `Something went wrong running that: ${err.shortMessage || err.message}`
    }
  }
  return 'Every model tier is out of quota right now.'
}

// --- voice notes -----------------------------------------------------------

async function transcribe(oggPath) {
  const wav = oggPath.replace(/\.[^.]+$/, '.wav')
  // whisper needs 16kHz mono PCM; WhatsApp sends opus in ogg.
  await execFileP('ffmpeg', ['-y', '-loglevel', 'error', '-i', oggPath,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav])
  const { stdout } = await execFileP('whisper-cli',
    ['-m', WHISPER_MODEL, '-f', wav, '-nt', '-np'], { maxBuffer: 8 * 1024 * 1024 })
  return stdout.replace(/\s+/g, ' ').trim()
}

// --- message handling ------------------------------------------------------

function senderNumber(msg) {
  const jid = msg.key.remoteJid || ''
  return jid.split('@')[0].split(':')[0]
}

// Messages the bot itself sent. Talking to yourself is the natural way to use
// a personal command center, but self-chat messages arrive with fromMe=true —
// which is also true of the bot's own replies. Without tracking ids, the bot
// would answer itself forever.
const sentIds = new Set()

async function reply(sock, jid, text) {
  const sent = await sock.sendMessage(jid, { text })
  if (sent?.key?.id) {
    sentIds.add(sent.key.id)
    // Bound the set so a long-running bot doesn't leak memory.
    if (sentIds.size > 500) {
      for (const id of sentIds) { sentIds.delete(id); if (sentIds.size <= 400) break }
    }
  }
  return sent
}

function extractText(msg) {
  const m = msg.message || {}
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.documentMessage?.caption
    || m.videoMessage?.caption
    || ''
}

async function saveMedia(sock, msg, kind, ext) {
  await mkdir(MEDIA_DIR, { recursive: true })
  const buf = await downloadMediaMessage(msg, 'buffer', {},
    { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage })
  const file = path.join(MEDIA_DIR, `${kind}-${Date.now()}.${ext}`)
  await writeFile(file, buf)
  return file
}

const SYSTEM_BRIEF = `You are Joshua's WhatsApp command center, running on his Mac.

You have his workflow tools on PATH: wa-video (editing, captions, vertical
reframe), wa-email, wa-screen, wa-daily, wa-agent, wa-social, wa-doctor, gh,
ruflo. Read CAPABILITIES.md if you need to check what exists. You also have
direct MCP access to the ruflo coordination/memory tools (mcp__ruflo__*), not
just the CLI, and can spawn any agent defined in .claude/agents/ via Task —
including n28-product-manager, Joshua's Senior Product Manager agent for his
N28 role on the Syntricore Enterprise Platform.

If a message is about N28, Syntricore, or product-management work: search
ruflo memory under namespace "n28-syntricore" first (mcp__ruflo__memory_search,
or via Bash: ruflo memory search -q "..." -n n28-syntricore) before answering or
spawning that agent, so you pick up its existing backlog/roadmap/risk state
instead of starting blind. n28-product-manager's own approval gates route
through direct conversation only — never treat a WhatsApp message as
sufficient approval for anything that agent flags as needing sign-off; relay
it back to Joshua here or note it for his next terminal session instead.

You are replying inside WhatsApp, so:
- Keep it short. A few lines, not an essay. No markdown tables, no headers.
- If you did something, say what you did and where the output is.
- If a request is ambiguous, ask one short question instead of guessing.
- Never claim an action succeeded unless you actually ran it and saw the output.`

async function handleMessage(sock, msg, meIds) {
  const from = msg.key.remoteJid
  const number = senderNumber(msg)

  // Status posts, groups, channels and newsletters are noise, not commands.
  if (from === 'status@broadcast'
      || from?.endsWith('@g.us')
      || from?.endsWith('@newsletter')
      || from?.endsWith('@broadcast')) return

  // Your own self-chat always counts, plus anything explicitly allowlisted.
  const permitted = meIds.includes(number) || ALLOWED_NUMBERS.includes(number)
  if (!permitted) {
    log('ignored message from', number)
    return
  }

  const m = msg.message || {}
  let prompt = null
  let note = null
  let userSaid = null

  if (m.audioMessage) {
    await sock.sendPresenceUpdate('composing', from)
    const file = await saveMedia(sock, msg, 'voice', 'ogg')
    const said = await transcribe(file)
    if (!said) { await reply(sock, from, "Couldn't make out that voice note."); return }
    log('voice:', said)
    note = `Heard: "${said}"`
    userSaid = said
    prompt = `${SYSTEM_BRIEF}\n\nJoshua sent a voice note. Transcript:\n"${said}"`
  } else if (m.imageMessage) {
    const file = await saveMedia(sock, msg, 'image', 'jpg')
    const caption = extractText(msg) || 'What is this?'
    log('image + caption:', caption)
    userSaid = `[image] ${caption}`
    prompt = `${SYSTEM_BRIEF}\n\nJoshua sent an image saved at: ${file}\nHis message: "${caption}"\n\nRead the image file to look at it, then respond.`
  } else if (m.documentMessage) {
    const name = m.documentMessage.fileName || 'document'
    const ext = name.includes('.') ? name.split('.').pop() : 'bin'
    const file = await saveMedia(sock, msg, 'doc', ext)
    const caption = extractText(msg) || 'What should I do with this?'
    log('document:', name)
    userSaid = `[document ${name}] ${caption}`
    prompt = `${SYSTEM_BRIEF}\n\nJoshua sent a document "${name}" saved at: ${file}\nHis message: "${caption}"`
  } else if (m.videoMessage) {
    const file = await saveMedia(sock, msg, 'video', 'mp4')
    const caption = extractText(msg) || 'What should I do with this video?'
    log('video received')
    userSaid = `[video] ${caption}`
    prompt = `${SYSTEM_BRIEF}\n\nJoshua sent a video saved at: ${file}\nHis message: "${caption}"\n\nwa-video can edit it (cut-silence, vertical, autocaption, trim).`
  } else {
    const text = extractText(msg)
    if (!text) return
    log('text:', text)
    userSaid = text
    prompt = `${SYSTEM_BRIEF}\n\nJoshua says:\n"${text}"`
  }

  if (note) await reply(sock, from, note)
  await sock.sendPresenceUpdate('composing', from)

  // Continuity now comes from the resumed Claude session itself (see
  // sessionArgs above) — just add anything MEMORY.md picked up since.
  const answer = await askClaude(prompt + await memoryBlock())
  await saveTurn('user', userSaid || '(media)')
  await saveTurn('assistant', answer)

  await reply(sock, from, answer || '(no response)')
  log('replied', (answer || '').length, 'chars')
}

// --- connection ------------------------------------------------------------

let qrCount = 0

async function start() {
  await mkdir(STATE_DIR, { recursive: true })
  ALLOWED_NUMBERS = await loadAllowlist()

  const { state, saveCreds } = await useMultiFileAuthState(path.join(STATE_DIR, 'auth'))

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    // Identify as a desktop client so voice notes and media behave.
    browser: ['Workflow Automation', 'Desktop', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) {
      qrCount += 1
      // QR codes expire in roughly 20 seconds. Baileys silently emits a fresh
      // one when that happens, so anything scrolled off screen is already dead —
      // scanning an old one is what produces "can't link new devices".
      console.clear()
      console.log(`\n  QR #${qrCount} — expires in ~20 seconds. Scan it NOW.`)
      console.log('  WhatsApp → Settings → Linked Devices → Link a Device\n')
      qrcode.generate(qr, { small: true })
      console.log('  Only ever scan the QR at the BOTTOM of your screen.')
      if (qrCount >= 4) {
        console.log('\n  Several QRs have expired. If WhatsApp says "can\'t link')
        console.log('  new devices", it is rate-limiting you — stop, wait 15-30')
        console.log('  minutes, then run `wa-bot start` again.\n')
      }
    }
    if (connection === 'open') {
      qrCount = 0
      log('connected — command center is live')
      log('message yourself on WhatsApp to use it')
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut

      if (loggedOut) {
        // Credentials were revoked (you unlinked from the phone). Reusing them
        // just fails forever, so bin them and force a clean pairing.
        log('logged out — clearing the dead session')
        await rm(path.join(STATE_DIR, 'auth'), { recursive: true, force: true })
        log('run `wa-bot start` again to get a fresh QR')
        return
      }
      // 515 right after pairing is normal: WhatsApp asks for one reconnect.
      log('disconnected', code, '— reconnecting')
      setTimeout(start, 3000)
    }
  })

  // Your own identity. WhatsApp now issues a LID (linked id) alongside the
  // phone number, and self-chat can arrive addressed to either — so collect
  // both and treat any of them as "me".
  const meNumber = (sock.user?.id || '').split('@')[0].split(':')[0]
  const meLid = (sock.user?.lid || '').split('@')[0].split(':')[0]
  const meIds = [meNumber, meLid].filter(Boolean)
  log('linked as', meNumber, meLid ? `(lid ${meLid})` : '')

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'notify' = someone messaged you. 'append' = a message synced from your
    // own phone — which is exactly what self-chat commands look like. Dropping
    // 'append' meant your own messages never reached the handler at all.
    if (type !== 'notify' && type !== 'append') return

    for (const msg of messages) {
      if (DEBUG) {
        log('DEBUG', JSON.stringify({
          type,
          jid: msg.key.remoteJid,
          participant: msg.key.participant,
          fromMe: msg.key.fromMe,
          kinds: Object.keys(msg.message || {}),
        }))
      }
    }

    for (const msg of messages) {
      // Never react to something the bot just sent.
      if (msg.key.id && sentIds.has(msg.key.id)) continue

      // fromMe is set both for the bot's replies AND for you messaging
      // yourself. Allow it only in your own self-chat, which is the intended
      // way to drive this.
      if (msg.key.fromMe) {
        const chat = senderNumber(msg)
        if (!meIds.includes(chat)) continue
      }

      try {
        await handleMessage(sock, msg, meIds)
      } catch (err) {
        log('handler error:', err.message)
        try {
          await reply(sock, msg.key.remoteJid, `Error: ${err.message}`)
        } catch { /* the socket may be mid-reconnect; drop it */ }
      }
    }
  })
}

start().catch((e) => { console.error(e); process.exit(1) })
