#!/usr/bin/env bash
# Session handoff — carries state across a provider switch.
#
# When Claude hits its usage limit, the next session starts on a different
# provider. Conversation history IS preserved (Claude Code stores sessions
# locally as .jsonl and `--continue` replays them), but the new model is
# weaker and benefits from an explicit brief. This writes that brief.
#
#   handoff-save     capture current state to HANDOFF.md
#   handoff-show     print it
#
# The SessionStart hook injects HANDOFF.md automatically, so a fallback
# session opens already knowing what was in flight.

WA_DIR="${WA_DIR:-$HOME/Workflow Automation}"
HANDOFF_FILE="$WA_DIR/HANDOFF.md"

# Projects to report git state for. Add paths here as work spreads out.
TRACKED_PROJECTS=(
  "$WA_DIR"
  "$HOME/Projects/sifta"
)

handoff-save() {
  local now
  now="$(date '+%Y-%m-%d %H:%M:%S %Z')"

  {
    echo "# Session Handoff"
    echo
    echo "_Written $now. A previous session generated this before handing off_"
    echo "_to a fallback provider. Treat it as the brief for what was in flight._"
    echo

    echo "## Active provider chain"
    echo
    echo "| Tier | Command | When |"
    echo "|---|---|---|"
    echo "| 1 | \`claude\` | Anthropic subscription — default |"
    echo "| 2 | \`claude-free\` | free models, \$0 — routine work |"
    echo "| 3 | \`claude-ar\` | AgentRouter opus-5 — heavy reasoning ONLY |"
    echo
    echo "**Cost rule: stay on tier 2 unless the task genuinely needs deep"
    echo "reasoning. Tier 3 spends real money from a finite \$225 balance.**"
    echo

    echo "## Git state"
    echo
    local p
    for p in "${TRACKED_PROJECTS[@]}"; do
      [ -d "$p/.git" ] || continue
      echo "### $(basename "$p")"
      echo '```'
      git -C "$p" status --short --branch 2>/dev/null | head -25
      echo
      echo "recent commits:"
      git -C "$p" log --oneline -5 2>/dev/null
      echo '```'
      echo
    done

    if [ ${#TRACKED_PROJECTS[@]} -eq 0 ]; then
      echo "_no tracked git projects_"
      echo
    fi

    echo "## Uncommitted work at handoff"
    echo
    local dirty=0
    for p in "${TRACKED_PROJECTS[@]}"; do
      [ -d "$p/.git" ] || continue
      if [ -n "$(git -C "$p" status --porcelain 2>/dev/null)" ]; then
        echo "- ⚠️  \`$(basename "$p")\` has uncommitted changes"
        dirty=1
      fi
    done
    [ "$dirty" -eq 0 ] && echo "_working trees clean_"
    echo

    echo "## Notes carried forward"
    echo
    if [ -f "$WA_DIR/NOTES.md" ]; then
      cat "$WA_DIR/NOTES.md"
    else
      echo "_none — write free-form context to NOTES.md to carry it across sessions_"
    fi
    echo

    echo "## Ruflo memory"
    echo
    echo '```'
    ( cd "$WA_DIR" && ruflo memory list --limit 15 2>/dev/null | head -30 ) \
      || echo "(ruflo memory unavailable)"
    echo '```'
  } > "$HANDOFF_FILE"

  echo "handoff saved -> $HANDOFF_FILE"
}

handoff-show() {
  [ -f "$HANDOFF_FILE" ] && cat "$HANDOFF_FILE" || echo "no handoff yet"
}

# Allow running as a script (used by hooks), not just as sourced functions.
case "${1:-}" in
  save) handoff-save ;;
  show) handoff-show ;;
esac
