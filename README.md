# Workflow Automation

I built myself a personal AI command center — I run it from WhatsApp, and
it runs real commands on my Mac in response. Not a chatbot wrapper: every
message spawns an actual coding agent with full system access, so it can
edit files, run scripts, browse the web, and act on whatever I send it.

## What it actually does

- **Message it like a person.** Text, voice note, photo, document, or video —
  all handled the same way, through WhatsApp, from my phone.
- **Voice notes get transcribed locally** (no cloud speech API) and fed
  straight into the agent as a real instruction.
- **Photos, docs, and videos get downloaded, saved, and acted on** — read a
  document and summarize it, look at a photo and describe it, edit a video —
  in one message, no app-switching.
- **Real conversation memory.** Not a replayed transcript — a persistent
  session it resumes every time, so context carries across the day like an
  actual conversation.
- **Three-tier cost fallback.** Subscription first, free models at $0 second,
  a paid tier only for genuinely hard reasoning last — and it degrades
  automatically if one tier is unavailable or rate-limited, so I don't have
  to think about cost.
- **Crash-hardened.** Internal errors used to silently kill the whole bot;
  now they're caught and logged, and it keeps running.
- **A full video pipeline** — auto-captions, silence-cutting, vertical
  reframing for shorts — triggerable from a single WhatsApp message.
- **Custom agent personas** for different parts of my life — including a
  product-manager agent scoped to my day job's own KPI structure and
  stakeholder workflow, orchestrating the same underlying toolset.
- Plus screen control, email, and scheduling, all reachable the same way.

## Why this repo exists

I keep this as a **source/config backup and multi-machine mirror**. It
exists so a dead Mac, or moving to a different machine, doesn't mean
starting from zero.

## What's in here

| Path | What it is |
|---|---|
| `whatsapp/bot.js` | The WhatsApp bridge — spawns `claude` locally per message, with tiered model fallback, session continuity, and voice/image/doc/video handling |
| `bin/wa-*` | CLI wrappers: `wa-video`, `wa-email`, `wa-screen`, `wa-doctor`, `wa-schedule`, `wa-agent`, `wa-social`, `wa-daily`, `wa-web`, `wa-permissions`, `wa-voice` |
| `router/` | The subscription → free → paid model-tier fallback (`router.sh`, `claude-auto`, `free_proxy.py`) |
| `web/` | The local web command-center dashboard |
| `.claude/agents/` | Custom agent personas, each scoped to a different part of what I do |
| `CAPABILITIES.md` | What's installed and how to invoke it |
| `LOCAL-SETUP.md` | My original setup log — what's verified working and what's left |
| `ARCHITECTURE.md` | System design notes |

## What I've deliberately left out

Everything below is excluded by `.gitignore` and has to be recreated per
machine — this repo is code and config only, never secrets, credentials, or
anything confidential:

- **Credentials & secrets** — `.env`, `router/credentials.env`
- **WhatsApp session** — `.whatsapp/` (auth, linked-device session, the
  bot's persistent Claude session id, received media). I re-link with
  `wa-bot allow <number>` then `wa-bot start` and scan a fresh QR.
- **Memory / runtime state** — `.swarm/`, `.claude-flow/data|logs|sessions/`,
  `agentdb.rvf`, `*.db` — all local, doesn't travel with git.
- **Personal and work-confidential documents** — CVs, contracts, PRDs,
  business plans, anything NDA-bound (`*.pdf`, `*.docx`, `*.pptx`, a few
  named `.md` files). Those stay on the machine they're on, on purpose.
- **Installed dependencies** — `whatsapp/node_modules/`, `web/node_modules/`,
  `.venv/`, `models/` (the Whisper model binary).

## Setting up on a new machine

1. Clone this repo (private — need `gh auth login` or an SSH key).
2. `bash setup.sh` — installs cliclick, the Agent-Reach venv, and anything
   else that needs my explicit approval to install system-wide.
3. `cd whatsapp && npm install`, `cd web && npm install`.
4. Recreate `router/credentials.env` and any other `.env` files — not in
   git, see above.
5. `wa-doctor` — tells me what's live and what's still missing.
6. `wa-bot allow <my number>` then `wa-bot start` — scan the QR to relink
   WhatsApp; it's a fresh session on a new machine.
7. `CAPABILITIES.md` has the full command reference.

## Cost discipline

Three tiers, cheapest first: `claude` (subscription, default) → `claude-free`
(free models, $0) → `claude-ar` (paid, finite balance, heavy reasoning only).
Full rule is in `CLAUDE.md`.
