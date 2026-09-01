# Memory

Long-term memory for the command center. Everything here is loaded at the start of every new
conversation, across the web UI, WhatsApp and voice. Append to it when Joshua
says something worth keeping; keep entries short and factual.

## Who

Usifoh Eseosa Joshua — Lagos, Nigeria. Tech business development executive,
founder, full-stack developer. ~7 years B2B sales across tech, EdTech, SaaS,
real estate and travel. University of Lagos student. GitHub: `jjnotmid`.
WhatsApp: 2348124966881.

## Projects

- **Blu Tech Learn** — AI-powered EdTech platform. Co-founder.
- **NepaWatch** — real-time crowd-sourced Nigerian power-outage tracker, 600+ users.
- **Content creation** — short-form video; wants editing and posting automated.

Stack: Next.js, React, Supabase, plus IT admin / RBAC / DevOps.

## Working preferences

- **Data is limited.** Never download anything without asking first — no brew,
  pip, npm or model pulls. Check what's already installed.
- **Cost order:** Anthropic subscription → free models ($0) → AgentRouter (paid,
  finite $225). Never jump to paid without reason.
- **OpenRouter is free-tier only.** Never route it to paid models.
- Prefers things fully set up and working over being handed instructions.
- Wants permissions pre-approved so nothing stalls waiting for a prompt.

## Decisions made

- `ruflo` is the default orchestration layer.
- Capabilities are built as **CLI scripts, not MCP connectors**, because
  claude.ai connectors are disabled whenever a custom auth token is set — they'd
  vanish in every router/fallback session.
- iPhone, so no tool can inject taps into his phone. WhatsApp bot is the
  workaround.
- Web UI is **Joshua's AI Command Center**, blue theme, no emojis anywhere.

## Known environment gotchas

- Python 3.13 ships without a CA bundle (fixed via Install Certificates.command).
- `openai-whisper` won't build on 3.13 — using `whisper-cpp` instead.
- Homebrew's core `ffmpeg` lacks libass; `ffmpeg-full` has it and is keg-only.
- `screencapture` silently refuses dotfile destinations.
- BSD `sed` doesn't support `\?`.
- Free models answer questions fine but **fabricate tool use** — don't trust them
  for actions.
