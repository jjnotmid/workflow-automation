#!/usr/bin/env zsh
# AI router launchers — source this from ~/.zshrc
#
# Claude Code binds its model provider at PROCESS START. It cannot hot-swap
# providers mid-session, so "fallback" means: your Anthropic session ends,
# you relaunch with one of these commands. Same project, same files, new brain.

ROUTER_DIR="${0:A:h}"
[ -f "$ROUTER_DIR/credentials.env" ] && source "$ROUTER_DIR/credentials.env"

# --- AgentRouter: paid-by-your-$225, Anthropic-native, best quality ---
# Models: claude-opus-5, claude-opus-4-8, gpt-5.6-sol
claude-ar() {
  if [ -z "$AGENTROUTER_API_KEY" ]; then
    echo "AGENTROUTER_API_KEY not set — check router/credentials.env" >&2
    return 1
  fi
  ANTHROPIC_BASE_URL="$AGENTROUTER_BASE_URL" \
  ANTHROPIC_AUTH_TOKEN="$AGENTROUTER_API_KEY" \
  ANTHROPIC_API_KEY="$AGENTROUTER_API_KEY" \
  ANTHROPIC_MODEL="${CLAUDE_AR_MODEL:-claude-opus-5}" \
  ANTHROPIC_SMALL_FAST_MODEL="claude-opus-4-8" \
  claude "$@"
}

# Cheaper tier on the same key — use for bulk/mechanical work.
claude-ar-cheap() { CLAUDE_AR_MODEL="claude-opus-4-8" claude-ar "$@"; }

# --- OpenRouter: FREE MODELS ONLY. Zero spend, guaranteed by the :free guard. ---
# Probes the free list and returns the first model that is not rate-limited.
or-pick-free() {
  local m code
  for m in ${=OPENROUTER_FREE_MODELS}; do
    [[ "$m" == *":free" ]] || continue   # hard guard: never a paid model
    code=$(curl -s -o /dev/null -w "%{http_code}" "$OPENROUTER_BASE_URL/messages" \
      -H "content-type: application/json" \
      -H "x-api-key: $OPENROUTER_API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -d "{\"model\":\"$m\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}" \
      --max-time 25)
    if [ "$code" = "200" ]; then echo "$m"; return 0; fi
  done
  return 1
}

claude-or() {
  if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "OPENROUTER_API_KEY is empty — add it to router/credentials.env" >&2
    return 1
  fi
  local model="$CLAUDE_OR_MODEL"
  if [ -z "$model" ]; then
    echo "Probing free models…" >&2
    model=$(or-pick-free) || {
      echo "All free models are rate-limited right now. Use 'claude-ar' instead." >&2
      return 1
    }
    echo "Using free model: $model" >&2
  fi
  if [[ "$model" != *":free" ]]; then
    echo "REFUSED: '$model' is not a :free model. OpenRouter is free-tier only." >&2
    return 1
  fi
  ANTHROPIC_BASE_URL="$OPENROUTER_BASE_URL" \
  ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY" \
  ANTHROPIC_API_KEY="$OPENROUTER_API_KEY" \
  ANTHROPIC_MODEL="$model" \
  ANTHROPIC_SMALL_FAST_MODEL="$model" \
  claude "$@"
}

# --- Free proxy control ---------------------------------------------------
# Claude Code rejects non-Claude model names, so the proxy accepts a Claude
# name and swaps in a real :free model, failing over on rate limits.
FREE_PROXY_PORT="${FREE_PROXY_PORT:-8787}"

free-proxy-start() {
  if curl -sf "http://127.0.0.1:$FREE_PROXY_PORT/health" -o /dev/null --max-time 5; then
    echo "free proxy already running on :$FREE_PROXY_PORT"
    return 0
  fi
  ( cd "$ROUTER_DIR" && nohup python3 free_proxy.py --port "$FREE_PROXY_PORT" \
      > /tmp/free_proxy.log 2>&1 & )
  sleep 2
  curl -sf "http://127.0.0.1:$FREE_PROXY_PORT/health" -o /dev/null --max-time 5 \
    && echo "free proxy up on :$FREE_PROXY_PORT" \
    || { echo "failed to start — see /tmp/free_proxy.log" >&2; return 1; }
}

free-proxy-stop() { pkill -f "free_proxy.py" && echo "free proxy stopped"; }
free-proxy-log()  { tail -f /tmp/free_proxy.log; }

# THE free-tier launcher. Zero spend, auto-failover across free models.
claude-free() {
  free-proxy-start || return 1
  ANTHROPIC_BASE_URL="http://127.0.0.1:$FREE_PROXY_PORT" \
  ANTHROPIC_AUTH_TOKEN="free-proxy" \
  ANTHROPIC_API_KEY="free-proxy" \
  ANTHROPIC_MODEL="claude-sonnet-4-5-20250929" \
  ANTHROPIC_SMALL_FAST_MODEL="claude-3-5-haiku-20241022" \
  claude "$@"
}

# List every free model OpenRouter currently offers.
or-free-models() {
  curl -s "$OPENROUTER_BASE_URL/models" -H "Authorization: Bearer $OPENROUTER_API_KEY" --max-time 40 \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
f=[m for m in d if str(m.get('pricing',{}).get('prompt')) in ('0','0.0')
   and str(m.get('pricing',{}).get('completion')) in ('0','0.0')]
f.sort(key=lambda m:-(m.get('context_length') or 0))
for m in f: print(f\"{m['id']:<58} ctx={m.get('context_length')}\")
print(f'\n{len(f)} free models')"
}

# --- Health check: which routers are actually reachable right now ---
router-status() {
  echo "AgentRouter:"
  local ar
  ar=$(curl -s -o /dev/null -w "%{http_code}" "$AGENTROUTER_BASE_URL/v1/models" \
    -H "Authorization: Bearer $AGENTROUTER_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "user-agent: claude-cli/2.0.1 (external, cli)" \
    -H "x-stainless-lang: js" -H "x-stainless-runtime: node" --max-time 20)
  [ "$ar" = "200" ] && echo "  ✅ reachable ($ar)" || echo "  ❌ HTTP $ar"

  echo "OpenRouter:"
  if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "  ⚪ no key configured"
  else
    local or
    or=$(curl -s -o /dev/null -w "%{http_code}" "$OPENROUTER_BASE_URL/models" \
      -H "Authorization: Bearer $OPENROUTER_API_KEY" --max-time 20)
    [ "$or" = "200" ] && echo "  ✅ reachable ($or)" || echo "  ❌ HTTP $or"
  fi

  echo "Free proxy:"
  if curl -sf "http://127.0.0.1:${FREE_PROXY_PORT:-8787}/health" -o /dev/null --max-time 5; then
    echo "  ✅ running on :${FREE_PROXY_PORT:-8787}"
  else
    echo "  ⚪ stopped (starts automatically with 'claude-free')"
  fi
}

# --- Credit balance on AgentRouter ---
router-credits() {
  curl -s "$AGENTROUTER_BASE_URL/v1/dashboard/billing/subscription" \
    -H "Authorization: Bearer $AGENTROUTER_API_KEY" \
    -H "user-agent: claude-cli/2.0.1 (external, cli)" --max-time 20
  echo
}

# --- Capability scripts on PATH -------------------------------------------
export WA_DIR="$HOME/Workflow Automation"
export PATH="$WA_DIR/bin:$PATH"

# Supervised session with automatic provider failover. Use this by default.
alias claude-auto="$WA_DIR/router/claude-auto"
