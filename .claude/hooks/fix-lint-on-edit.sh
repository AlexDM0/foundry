#!/usr/bin/env bash
# Claude Code PostToolUse hook: runs `eslint --fix` on the TypeScript file an Edit or Write just changed, under the nearest
# `eslint.config.js` above that file (each workspace has its own, the root none) and with the ESLint of the checkout holding it, so a
# worktree's own configs and dependencies apply. It never blocks the tool call: what --fix cannot settle is left for `bun run lint`.
set -uo pipefail

edited_file_path="$(jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[[ "$edited_file_path" == *.ts && -f "$edited_file_path" ]] || exit 0

checkout_directory="$(git -C "$(dirname "$edited_file_path")" rev-parse --show-toplevel 2>/dev/null)" || exit 0
eslint_binary="$checkout_directory/node_modules/.bin/eslint"
[[ -x "$eslint_binary" ]] || exit 0

configuration_directory="$(cd "$(dirname "$edited_file_path")" && pwd -P)"
checkout_directory="$(cd "$checkout_directory" && pwd -P)"
while [[ ! -f "$configuration_directory/eslint.config.js" ]]; do
  [[ "$configuration_directory" == "$checkout_directory" || "$configuration_directory" == "/" ]] && exit 0
  configuration_directory="$(dirname "$configuration_directory")"
done

( cd "$configuration_directory" && "$eslint_binary" --fix "$edited_file_path" >/dev/null 2>&1 )
exit 0
