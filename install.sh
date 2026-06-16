#!/usr/bin/env bash
#
# Install the Launch Team agent group into an OpenClaw gateway.
# Registers all five agents as OpenClaw workspaces in one shot.
#
# Usage:
#   ./install.sh              # register the agents with the openclaw CLI
#   DRY_RUN=1 ./install.sh    # print the commands without running them
#
# Docs:    https://docs.openclaw.ai/cli/agents
# License: CC BY 4.0 — attribution to Giovanni Brees required (see NOTICE).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR="launchteam"
# Registered in workflow order; the orchestrator first.
AGENTS=(launchteam launchmarketing launchcreative launchads launchperformance)

run() {
  echo "+ $*"
  if [ "${DRY_RUN:-0}" != "1" ]; then
    "$@"
  fi
}

if [ "${DRY_RUN:-0}" != "1" ] && ! command -v openclaw >/dev/null 2>&1; then
  cat <<'EOF'
openclaw CLI not found.

Install OpenClaw first (https://docs.openclaw.ai/), then re-run this script.
To preview the exact commands without installing anything, run:

  DRY_RUN=1 ./install.sh
EOF
  exit 1
fi

echo "Installing the Launch Team agent group from: $ROOT"
echo

for a in "${AGENTS[@]}"; do
  ws="$ROOT/agents/$a"
  if [ ! -f "$ws/SOUL.md" ]; then
    echo "! skipping $a — no SOUL.md found at $ws" >&2
    continue
  fi
  run openclaw agents add "$a" --workspace "$ws"
done

cat <<EOF

Done — five agents registered. Next steps:

  1. Bind only the orchestrator ('$ORCHESTRATOR') to a user-facing channel so it
     can delegate to the four specialists as sub-agents. Check your version's
     binding syntax: https://docs.openclaw.ai/concepts/multi-agent

  2. Merge the example gateway config (model, sub-agent limits, approval gating):
       $ROOT/openclaw.config.example.json
     Ensure sub-agent spawning is enabled (maxSpawnDepth >= 2) so '$ORCHESTRATOR'
     can spawn launchmarketing, launchcreative, launchads, and launchperformance.

  3. Start the gateway:
       openclaw gateway start

IMPORTANT — human approval
  These agents reason about ad spend and live campaigns. Enforce
  shared/human-approval-policy.md in your TOOLING layer, not just the prompts:
  gate spend / launch / publish / send behind a human confirmation, and default
  new campaigns to PAUSED. A prompt can be jailbroken; a tool that refuses to
  spend without confirmation cannot.
EOF
