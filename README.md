# Workflow Automation

Joshua's personal AI command center — a WhatsApp-reachable bridge to Claude
Code, a three-tier cost-fallback model router, and a set of `wa-*` CLI tools
for video editing, screen control, email, and scheduling. Includes custom
agent definitions under `.claude/agents/`, including `n28-product-manager`
for his N28 role.

This repo is a **source/config backup and multi-machine mirror**, not a
distributable app. It exists so a dead Mac or a switch to a different machine
doesn't mean starting over.

## What's in here

| Path | What it is |
|---|---|
| `whatsapp/bot.js` | The WhatsApp command center — spawns `claude` locally in response to messages, with tiered model fallback, session continuity, and voice/image/doc/video handling |
| `bin/wa-*` | CLI wrappers: `wa-video`, `wa-email`, `wa-screen`, `wa-doctor`, `wa-schedule`, `wa-agent`, `wa-social`, `wa-daily`, `wa-web`, `wa-permissions`, `wa-voice` |
| `router/` | The subscription → free → AgentRouter model-tier fallback (`router.sh`, `claude-auto`, `free_proxy.py`) |
| `web/` | The local web command-center dashboard |
| `.claude/agents/` | Custom agent definitions, including `n28-product-manager.md` |
| `CAPABILITIES.md` | What's installed and how to invoke it |
| `LOCAL-SETUP.md` | Original setup log — what's verified working and what's left |
| `ARCHITECTURE.md` | System design notes |

## What's deliberately NOT in here

Everything below is excluded by `.gitignore` and has to be recreated per
machine — this repo is code and config only, never secrets or personal state:

- **Credentials & secrets** — `.env`, `router/credentials.env`
- **WhatsApp session** — `.whatsapp/` (auth, linked-device session, the
  bot's persistent Claude session id, received media). Re-link with
  `wa-bot allow <number>` then `wa-bot start` and scan a fresh QR.
- **Memory / runtime state** — `.swarm/`, `.claude-flow/data|logs|sessions/`,
  `agentdb.rvf`, `*.db`. Ruflo memory (including the `n28-syntricore`
  namespace) is local and does not travel with git.
- **Personal documents** — CVs, contracts, PRDs, business plans (`*.pdf`,
  `*.docx`, `*.pptx`, a few named `.md` files). These live on this machine
  only, deliberately.
- **Installed dependencies** — `whatsapp/node_modules/`, `web/node_modules/`,
  `.venv/`, `models/` (Whisper model binary).

## Setting up on a new machine

1. Clone this repo (private — `gh auth login` or SSH key needed).
2. `bash setup.sh` — installs cliclick, the Agent-Reach venv, and anything
   else that needs explicit approval to install system-wide.
3. `cd whatsapp && npm install`, `cd web && npm install`.
4. Recreate `router/credentials.env` (AgentRouter key) and any other `.env`
   files — not in git, see above.
5. `wa-doctor` — confirms what's live and what's still missing.
6. `wa-bot allow <your number>` then `wa-bot start` — scan the QR to relink
   WhatsApp; it's a fresh session on a new machine.
7. Read `CAPABILITIES.md` for the full command reference.

## Cost discipline

Three tiers, cheapest-first: `claude` (subscription, default) → `claude-free`
(free models, $0) → `claude-ar` (AgentRouter, paid — finite balance, heavy
reasoning only). See `CLAUDE.md` for the full rule.
