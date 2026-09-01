# Structure — what this is, and what it isn't yet

An honest audit. Written after building the whole thing, so it reflects what
actually works rather than what was intended.

---

## The core problem

We built a lot of **capabilities** and almost no **operating rhythm**.

Right now the system does things when spoken to and then goes quiet. It has no
goals it's pursuing, no schedule it keeps, and no memory that survives across
the surfaces you talk to it through. That's why it feels underused — not because
pieces are missing, but because nothing connects them.

Three concrete symptoms:

1. **Four separate memories.** The voice assistant, WhatsApp bot, web chat, and
   ruflo each keep their own state. Tell one something and the others never
   learn it. You noticed this yourself on WhatsApp.
2. **Nothing runs unattended.** `wa-schedule` exists but no job is installed. The
   system is 100% reactive.
3. **Work evaporates.** Agents produce output into a log that scrolls away.
   Nothing is filed, indexed, or built upon.

---

## What's actually built and working

| Layer | State |
|---|---|
| Model routing — 3 tiers + auto-failover | ✅ solid |
| Session handoff on limit | ✅ solid |
| Voice assistant | ✅ works |
| WhatsApp command center | ✅ works |
| Web command center | ✅ rebuilt with streaming + artifacts |
| Video pipeline (edit, caption, reframe) | ✅ verified |
| Email, screen control, GitHub | ✅ verified |
| Agent fleet + supervisor | ⚠️ spawns, but agents don't coordinate |
| 271 specialist agents | ⚠️ indexed, almost never invoked |

## What's dead weight right now

| Thing | Status |
|---|---|
| `codebase-memory-mcp` | cloned, never wired into anything |
| OpenMontage — 13 pipelines | cloned, never used once |
| ruflo memory / hooks / swarm | initialized, barely touched |
| Agent-Reach | 4 of 15 channels live |
| `wa-schedule` | built, zero jobs installed |

That's a meaningful amount of capability sitting idle. Cheaper to wire up what's
already on disk than to add anything new.

---

## The structure it needs

### 1. One memory spine

Every surface should read and write the same store. Ruflo's memory already
exists for this — it just isn't being used.

```
voice ─┐
whatsapp ─┼─→ ruflo memory ←─ web chat
agents ─┘        (namespaces: daily, projects, people, decisions)
```

**Test for "done":** tell it something by voice, ask about it on WhatsApp an
hour later, and it knows.

### 2. Projects, not just chats

Work should hang off named projects with real state — goal, status, next action,
open questions. `Blu Tech Learn`, `NepaWatch`, `content`, `job-search`.

Every agent result files itself under a project instead of scrolling past.

### 3. A rhythm

| Cadence | Job |
|---|---|
| Daily 07:30 | `wa-daily` brief → WhatsApp |
| Daily 21:00 | capture what changed, update project state |
| Weekly | supervisor reviews each project against its goal |

Without this the system only ever works when you remember to open it.

### 4. Agents that compound

Currently each agent starts cold, works alone, and its output dies in a log.
They should:
- read project memory before starting
- write findings back as artifacts
- be able to hand off to each other

### 5. Outbound

Everything is read-only or local. No posting, no publishing, no sending without
you initiating. The gap: social posting needs per-platform API tokens.

---

## Priority order

Ranked by value per unit of effort, given everything is already installed.

**1. Wire ruflo memory into all four surfaces.** Highest impact by far — it's the
difference between four amnesiac assistants and one that knows you. Nothing to
install.

**2. Install the scheduled jobs.** One command. Turns the system from reactive to
operating on its own.

**3. Add projects.** A simple `projects/<name>/state.md` that every surface reads
and updates. Gives agent work somewhere to accumulate.

**4. Make the supervisor close the loop.** Right now it plans and spawns. It
should also *review* — compare progress to the goal and decide what's next.

**5. Wire codebase-memory-mcp.** Free capability sitting on disk; makes anything
touching your repos far cheaper in tokens.

**6. Use OpenMontage.** 13 video pipelines unused while you do content. One real
run through `talking-head` or `clip-factory` would prove it.

**7. Cloud + Tailscale.** So WhatsApp reaches the Mac from outside your network,
and GitHub/research work continues when the Mac sleeps.

**8. Social posting.** Blocked on credentials, not code.

---

## What I'd deliberately not build

- **iPhone control.** Apple blocks touch injection. The WhatsApp bot already
  covers the real need.
- **Driving other AI apps' UIs.** Brittle and against their terms. Use APIs.
- **A second model gateway.** Three tiers is already one more than most setups
  need. Adding a fourth adds failure modes, not capability.

---

## The honest summary

The plumbing is good. The system can see, hear, speak, edit video, send mail,
drive a browser, run agents and fail over between three model providers without
losing context.

What it lacks is a reason to wake up in the morning. Memory and rhythm are the
two things that turn it from a toolbox into something that actually runs your
workflow — and both are configuration, not new code.
