# Model Router — fallback when Claude hits its limit

Three tiers. All verified working end to end.

| Command | Provider | Model | Cost |
|---|---|---|---|
| `claude` | Anthropic | your plan | your subscription |
| `claude-ar` | AgentRouter | `claude-opus-5` | your $225 balance |
| `claude-ar-cheap` | AgentRouter | `claude-opus-4-8` | your $225 balance |
| `claude-free` | OpenRouter (via proxy) | rotates across 7 free models | **$0** |

## The one thing to understand

**Claude Code binds its model provider when the process starts.** It cannot
hot-swap mid-session. So "fallback" means: your Anthropic session hits the
limit → you `exit` → you relaunch with `claude-ar` or `claude-free` in the same
folder. Same files, same project, different brain. Nothing is lost.

There is no way around this — it's how the client works, not a config gap.

## Recommended order

1. `claude` until you hit the limit
2. `claude-free` for routine work — costs nothing
3. `claude-ar` when you need real reasoning power — spends your $225

## Why `claude-free` needs a proxy

Claude Code validates the model name client-side and rejects anything that
isn't a recognized Claude id. OpenRouter's free models are named
`nvidia/nemotron-3-super-120b-a12b:free`, which Claude Code refuses outright —
even though the underlying API handles them perfectly (verified: tool-calling
and streaming both work).

`free_proxy.py` sits in between. Claude Code sends a normal Claude model name;
the proxy swaps in a real free model before forwarding. When a free pool
returns 429 — which happens constantly, they're shared across all OpenRouter
users — it transparently fails over to the next model in the list.

**Spend guarantee:** the proxy filters its model list to ids ending in `:free`
at load time, and `claude-or` refuses any model without that suffix. There is
no code path that can bill the account.

## Commands

```bash
router-status        # which tiers are reachable right now
router-credits       # AgentRouter balance
or-free-models       # every free model OpenRouter currently offers
or-pick-free         # first free model that isn't rate-limited

free-proxy-start     # start proxy (claude-free does this automatically)
free-proxy-stop
free-proxy-log       # tail the failover log — shows which model served each turn
```

## Files

- `credentials.env` — API keys. chmod 600, gitignored.
- `router.sh` — shell functions, sourced from `~/.zshrc`.
- `free_proxy.py` — the failover proxy. Stdlib only, no pip installs.

## Known rough edges

- Free models are genuinely weak compared to Opus. Fine for mechanical edits,
  file shuffling, and quick questions. Not for architecture or hard debugging.
- Free pools rate-limit hard. The proxy retries across 7 models, but during
  peak hours all 7 can be busy at once. `claude-ar` is the reliable fallback.
- Launching via a router disables claude.ai connectors (Gmail, Drive, Notion)
  because a custom auth token takes precedence over your claude.ai login. Those
  MCP tools only work in a plain `claude` session.
