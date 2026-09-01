#!/usr/bin/env bash
# SessionStart hook: inject the handoff brief into a new session's context.
#
# This is what makes a provider switch seamless. When claude-auto fails over,
# the incoming (weaker) model starts already knowing what was in flight, what's
# uncommitted, and which cost tier it's on.
#
# Emits Claude Code's hook JSON with hookSpecificOutput.additionalContext.

WA_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Workflow Automation}"
HANDOFF="$WA_DIR/HANDOFF.md"

[ -f "$HANDOFF" ] || exit 0

# Skip a stale brief — anything older than 12h is more confusing than useful.
if [ -n "$(find "$HANDOFF" -mmin +720 2>/dev/null)" ]; then
  exit 0
fi

python3 - "$HANDOFF" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        body = f.read()[:12000]
except OSError:
    sys.exit(0)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": (
            "A previous session handed off to this one (likely after hitting a "
            "usage limit and switching providers). Below is the state at handoff. "
            "Use it to continue seamlessly — do not re-derive what it already "
            "establishes, and do not restart finished work.\n\n" + body
        ),
    }
}))
PY
