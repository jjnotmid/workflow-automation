# Capabilities — what to reach for, and when

**This file is a contract, not a menu.** When a request matches a trigger below,
use the tool without being told to. Don't ask permission for read-only actions.
Do confirm before anything outward-facing (sending, posting, pushing).

---

## Cost discipline — read this first

Three model tiers. **Default to the cheapest that can do the job.**

| Tier | Command | Cost | Use for |
|---|---|---|---|
| 1 | `claude` | subscription | everything, until the limit hits |
| 2 | `claude-free` | **$0** | routine edits, file shuffling, lookups, boilerplate |
| 3 | `claude-ar` | **real money** ($225 finite) | architecture, hard debugging, long reasoning chains |

**Tier 3 is not the default fallback.** When the Anthropic limit hits, go to
tier 2 first. Escalate to tier 3 only when a task genuinely needs deep
reasoning and tier 2 has visibly failed at it. Every tier-3 token is spend that
doesn't come back.

`claude-auto` supervises this automatically and orders the tiers correctly.

---

## Triggers → tools

### Video / content creation
| User says | Do this |
|---|---|
| "cut the dead air", "tighten this" | `wa-video cut-silence in.mp4 out.mp4` |
| "make it vertical", "for TikTok/Reels" | `wa-video vertical in.mp4 out.mp4` |
| "add captions" | `wa-video audio` → whisper → `wa-video captions` |
| "trim/clip/thumbnail/speed up/compress" | corresponding `wa-video` subcommand |
| "make me a video about X" (from scratch) | **Read `vendor/OpenMontage/AGENT_GUIDE.md` first**, then pick a pipeline from `vendor/OpenMontage/pipeline_defs/` |
| "make one like this <url>" | OpenMontage `skills/meta/video-reference-analyst.md` |

OpenMontage has 13 pipelines. The relevant ones for Joshua: `talking-head`,
`clip-factory`, `screen-demo`, `podcast-repurpose`.

**Never** improvise Python around OpenMontage — its guide is explicit that the
intelligence lives in its stage-director skills. Read them.

### Email
| Trigger | Tool |
|---|---|
| "email X", "send a note to…" | `wa-email send --to … --subject … --body …` |
| "what accounts do I have" | `wa-email accounts` |

Drafts open in Mail for review by default. **Only add `--send` when Joshua has
clearly asked for it to go out.** Accounts: iCloud, Google, jjnotmid47@gmail.com.

### Screen & Mac control
| Trigger | Tool |
|---|---|
| "what's on my screen", "look at this" | `wa-screen shot` then Read the PNG |
| "click there", "type this", "open X" | `wa-screen click/type/focus` |

Needs Screen Recording + Accessibility granted to the terminal. Prefer the CLI
or an API over driving a GUI whenever both exist — UI automation is brittle.

### GitHub
`gh` is authenticated as **jjnotmid** (`repo`, `gist`, `read:org`). Use it
directly for issues, PRs, repos, gists. No MCP needed, works in every tier.

### Social media
- **Reading** (what's trending, competitor research, comment mining):
  Agent-Reach covers Twitter/X, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu.
- **Posting**: NOT wired. Agent-Reach is read-only. Posting needs per-platform
  API credentials that don't exist yet. Say so plainly rather than pretending.

### Specialist agents (271 indexed)
| Trigger | Tool |
|---|---|
| task needs domain expertise | `wa-agent route "<task>"` |
| load a persona | `wa-agent show <slug>` |
| browse | `wa-agent list [division]`, `wa-agent divisions` |

Reach for this when a task has a real specialist — sales strategy, video
editing, security review, GIS. Don't bother for generic coding.

### Orchestration
`ruflo` is the default coordination layer — memory, hooks, swarms.
Known limits found in testing: workflow files must be **JSON, not YAML**, and
`ruflo workflow run -f` collapses multi-step files into one "Execute" stage
rather than running each step as its own agent.

---

## Health

`wa-doctor` — verifies every tier, capability, and permission in one shot.
Run it when something behaves oddly, or at the start of a session after changes.

---

## Voice (`wa-voice`)

| Trigger | Command |
|---|---|
| talk to the desktop once | `wa-voice ask` |
| hands-free continuous | `wa-voice listen` (say "stop listening" to quit) |
| same pipeline, typed | `wa-voice text "..."` |
| check the mic | `wa-voice test` |

Chain: sox records until ~1.8s silence → whisper-cpp transcribes **offline** →
Claude runs it with the `wa-*` allowlist → macOS `say` speaks the reply.

Only the LLM call touches the network (a few KB). Recording, transcription and
speech are all local — this matters on metered data.

**Tier:** defaults to the Anthropic subscription. Free models answer questions
but are unreliable at driving tools — one reported "screenshot saved" having run
nothing. Use `WA_VOICE_TIER=free` only for pure Q&A.

Replies are written to be *heard*: ≤3 sentences, no markdown, no file paths.

---

## WhatsApp command center (`wa-bot`)

Message the bot from your phone; it runs on this Mac with the full toolkit.

| You send | What happens |
|---|---|
| text | straight to Claude with all `wa-*` tools |
| voice note | ffmpeg → whisper (local) → Claude |
| image + caption | saved, Claude reads it, acts on the caption |
| document | saved, path handed to Claude |
| video | saved; `wa-video` can cut silence, reframe, autocaption |

```bash
wa-bot allow 234XXXXXXXXXX   # your own number, digits + country code
wa-bot start                 # scan the QR once
wa-bot bg                    # then run it in the background
```

**Security — take this seriously.** The bot executes commands on the Mac in
response to WhatsApp messages. It replies ONLY to numbers in
`.whatsapp/allowed.json` and silently drops everything else. An over-broad
allowlist here is a remote shell for whoever finds the number.

Tier defaults to the subscription (`WA_BOT_TIER=free|ar` to change), for the
same reason as voice: free models fake tool use.

---

## Web command center (`wa-web`)

```bash
wa-web bg      # starts and opens http://127.0.0.1:7777
```

Three tabs, one model selector (subscription / free / AgentRouter):

- **Chat** — conversational, with memory across messages, and it can run tools.
- **Agents** — name a specialist, give it an assignment, watch its output stream
  live. Multiple agents run concurrently; each is its own `claude` process.
- **Goal** — hand the supervisor something like *"make Blu Tech Learn a billion
  dollar startup"*. It decomposes the goal into 3–6 workstreams, each with a
  named specialist and a concrete deliverable. Review the plan, then launch the
  whole fleet or individual agents.

Zero dependencies — Node's own http module and one HTML file.

**Bound to 127.0.0.1 only.** It executes real commands, so it must never be
exposed to a network without authentication in front of it. Reaching it from
your phone means a private tunnel (Tailscale), not port-forwarding.
