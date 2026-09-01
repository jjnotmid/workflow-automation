#!/usr/bin/env bash
# One-time setup — installs the pieces that need your explicit approval.
#
# These were blocked during automated setup because they install software
# system-wide. Run this once:
#
#     bash ~/"Workflow Automation/setup.sh"
#
# Everything else is already configured and working.

set -uo pipefail
WA="$HOME/Workflow Automation"
BREW=/usr/local/bin/brew

ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
skip() { printf '\033[33m–\033[0m %s\n' "$*"; }
step() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }

step "1/4  cliclick — mouse & keyboard control"
if command -v cliclick >/dev/null || [ -x /usr/local/bin/cliclick ]; then
  ok "cliclick already installed"
else
  "$BREW" install cliclick && ok "cliclick installed" || skip "cliclick failed"
fi

step "2/4  Python venv + Agent-Reach (social media read access)"
if [ ! -d "$WA/.venv" ]; then
  python3 -m venv "$WA/.venv" && ok "venv created"
else
  ok "venv exists"
fi
"$WA/.venv/bin/pip" install --quiet --upgrade pip
if "$WA/.venv/bin/pip" install --quiet "$WA/vendor/Agent-Reach"; then
  ok "Agent-Reach installed"
else
  skip "Agent-Reach install failed — check $WA/vendor/Agent-Reach"
fi

step "3/4  OpenMontage dependencies (video production)"
if [ -f "$WA/vendor/OpenMontage/requirements.txt" ]; then
  if "$WA/.venv/bin/pip" install --quiet -r "$WA/vendor/OpenMontage/requirements.txt"; then
    ok "OpenMontage deps installed"
  else
    skip "some OpenMontage deps failed — core ffmpeg workflows still work"
  fi
fi

step "4/4  whisper — transcription for auto-captions"
if "$WA/.venv/bin/pip" install --quiet openai-whisper; then
  ok "whisper installed (first run downloads the model)"
else
  skip "whisper failed — captions still work if you supply an .srt"
fi

step "5/5  Trust this workspace"
cat <<'EOF'
Run `claude` once inside ~/"Workflow Automation" and accept the trust dialog.
Until you do, the permission allowlist in .claude/settings.json is ignored and
you'll get prompted for routine commands.
EOF

step "macOS permissions — YOU MUST DO THIS MANUALLY"
cat <<'EOF'
System Settings → Privacy & Security, grant your Terminal app:

  • Screen Recording   — so screenshots work
  • Accessibility      — so clicks and keystrokes work
  • Automation → Mail  — so email sending works

Without these, wa-screen and wa-email will fail silently or be denied.
EOF

step "Done"
cat <<'EOF'
Verify everything:      wa-doctor
Start a session:        claude-auto
EOF
