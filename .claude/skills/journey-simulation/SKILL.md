---
name: "Journey Simulation"
description: |
  Find the bugs a user would find, before they do. Drives a project through the journeys real people take with the unreliable parts stubbed, so "only works when the model cooperates" fails a test instead of becoming a complaint. Use when asked to QA, test end to end, simulate users, audit a bot or agent, or find out why something feels broken.
---

# Journey Simulation

## When to reach for this

Any of these, without being asked twice:

- "QA this", "test it end to end", "run through the whole thing"
- "simulate users", "act like a real person using it"
- "why does it keep doing X", "the AI is bad at Y", "it feels broken"
- before a demo, a pitch, or a release
- after a refactor that touched routing, intent handling or dispatch

It applies to anything that takes an input and decides what to do with it:
chat bots, agents, CLIs, API routers, webhook handlers, form wizards. It does
**not** replace browser testing for a rendered UI. Use the `browser` skill or
`wa-screen` for that.

## The method

The whole idea is one move: **stub the thing the system falls back on, with a
marker you can recognise, and treat reaching it as a failure.**

Most systems have a fallback. An LLM that "handles the rest". A catch-all
route. A generic error page. A default branch. In normal testing that fallback
absorbs every gap silently, so the gaps never show up. Replace it with a
string like `[[FELL-THROUGH]]` and every gap becomes visible at once.

Two failure classes come out of this, and the second is worse:

| Class | What it means | Why it hurts |
|---|---|---|
| **Fell through** | Reached the stub. No real handler exists. | Works only when the model guesses right, over a bad connection, in the user's own words. |
| **Wrong handler** | A real handler ran, but the wrong one. | The user gets a confident, wrong answer and acts on it. |

In the Kudi pass this method found 14 reproducible bugs in one afternoon. The
worst was wrong-handler: "I need help with a failed transfer" was answered
with "How much you wan send?", so someone reporting lost money was asked to
send more of it. No amount of staring at the code had caught that.

## Wiring it up

```bash
wa-simulate init [dir]     # copies the harness, adds `npm run simulate`
wa-simulate status [dir]   # what it detected
wa-simulate run [dir]      # run everything
```

Then fill in three things in `journeys.ts`, all marked `WIRE`:

1. **Stub the unreliable dependency** so it returns `FALLBACK`. Only the stub
   is fake. The store, the router and the business logic stay real, or the
   results mean nothing.
2. **`setup(id)`** builds one isolated world per session: a seeded user with
   an account, a balance, a login already done. Every session gets a unique
   id, so a hundred journeys run in one process without poisoning each other.
3. **`drive(ctx, input)`** pushes one input through the real system and
   returns everything it emitted, in order.

Then write journeys and sweeps:

```ts
sim.journey("send money end to end", [
  { say: "send 5k to 0123456789 GTBank", expect: /PIN/ },
  { say: "1234", expect: /Successful/, notExpect: /error/i },
]);

await sim.sweep({
  balance: ["how much do i have", "what is my balance", "elo ni owo mi"],
  aboutTransfers: {
    inputs: ["what is my limit", "my last transfer", "a transfer failed"],
    mustNot: /How much you wan send/i,   // the wrong-handler detector
  },
});
```

`mustNot` is where the expensive bugs are. Always set it to whatever the
*neighbouring* feature would say.

## What to sweep, every time

Work through this list. It is not generic advice, it is the set that actually
produced findings:

- **The commonest question, phrased eight ways.** Including how someone says
  it out loud, which is not how they type it. "How much do I have in my
  account" is different from "balance" and was the bug that got blamed on
  transcription.
- **Every menu item and every documented example.** If the help text says
  `buy 500 airtime for 08031234567`, run exactly that. Kudi's own example
  number was not a real prefix, so following the instructions failed.
- **Other languages**, if the product claims them. Balance worked in two of
  the five Kudi advertised.
- **Questions *about* a feature, not requests for it.** "What does it cost",
  "what is my limit", "show my history", "it failed". These get swallowed by
  the feature's own handler constantly.
- **Adjacent words that collide.** "credit card" was read as a money transfer
  because "credit" was a transfer verb.
- **Complaints and support.** "I was debited but it did not go through",
  "talk to a human".
- **Adversarial.** Injection, empty input, 5000 characters, a bare PIN with no
  context, the same action twice.
- **State over time.** Idle then return, cancel mid-flow, change topic
  halfway, press the same menu number twice.

## Reporting what you find

Classify by what it costs the user, not by how hard it was to fix:

- **Critical** — a core promise the product makes and does not keep.
- **High** — a wrong answer, which is worse than no answer, because the user
  acts on it.
- **Medium** — a gap someone finds within five minutes of trying it.

For each finding give: the transcript (what was typed, what came back), the
root cause in one sentence, and the fix. A transcript is worth more than any
description, so lead with it.

Then produce two things:

1. **The ledger** of findings, most severe first.
2. **A manual test script** the user runs themselves, in order, with the
   expected result for each step. Simulation cannot tell you how a voice note
   feels when it arrives or whether a real bank transfer lands. Say which
   steps exist because simulation cannot cover them.

Publish both as an artifact when the audience is anyone but yourself.

## Be honest about the limits

Say plainly what was not covered rather than implying a clean bill of health:
real network calls, third-party sandboxes, concurrency and load, rendered UI,
anything behind credentials you do not have, and copy in a language nobody on
the team speaks. In the Kudi report those went in a "still open, and honestly
assessed" section with an owner against each, and that section was the most
useful part of the document.

## Files

- `~/Workflow Automation/workflows/journey-sim/harness.ts` — the library, no
  test framework imported, runs under vitest, jest, node --test or plain node.
- `~/Workflow Automation/workflows/journey-sim/journeys.template.ts` — the
  starter that `init` copies in.
- `~/Workflow Automation/bin/wa-simulate` — the CLI.
- Reference implementation: `KudiAI/src/lib/channel/__tests__/journeys.test.ts`,
  75 journeys against a real WhatsApp money bot.
