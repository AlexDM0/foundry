#!/usr/bin/env bash
# setup.sh: the macOS and Linux bootstrap. It makes sure Bun exists, offering Bun's official installer, then hands every argument to
# setup.ts, which does the setup steps the same way on every operating system. setup.ps1 is the Windows bootstrap.
#
# Usage: ./setup.sh [--instruct-only]
#        ./setup.sh --login-item <repository> [--label <label>] [--instruct-only]
#   --instruct-only  changes nothing: every offer declines and every write is reported as "would".
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTRUCT_ONLY=0
for argument in "$@"; do
  if [[ "$argument" == "--instruct-only" ]]; then INSTRUCT_ONLY=1; fi
done

export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  printf "  bun not found\n"
  answer=""
  [[ "$INSTRUCT_ONLY" == "1" ]] || read -r -p "  Install Bun now via the official installer (curl -fsSL https://bun.sh/install | bash)? [y/N] " answer || true
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    printf "  Bun is required. Install it from https://bun.sh and re-run ./setup.sh\n" >&2
    exit 1
  fi
  curl -fsSL https://bun.sh/install | bash
  command -v bun >/dev/null 2>&1 || { printf "  bun still not found after install: open a new terminal and re-run ./setup.sh\n" >&2; exit 1; }
fi

# The tool's own bunfig and no .env, so a repository the user runs this from never loads its preload or variables into setup.
exec bun --no-env-file "--config=$HERE/bunfig.toml" "$HERE/setup.ts" "$@"
