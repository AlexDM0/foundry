#!/usr/bin/env bash
# Starts this checkout's Overseer on the seeded demo board with the fake agent adapter, lets it launch jobs that keep
# working, records an intake, writes to the Assistant and the product owner as User, then shoots each view of the Bridge
# it serves and stops it again.
set -euo pipefail

# Usage: bridge-demo.sh <work folder seed-demo.sh filled> <shots folder>
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_CHECKOUT="$(cd "$HERE/.." && pwd)"
WORK="$(cd "${1:?usage: bridge-demo.sh <work folder> <shots folder>}" && pwd -P)"
SHOTS="${2:?usage: bridge-demo.sh <work folder> <shots folder>}"
REPOSITORY="$WORK/example-storefront"
SETTLE_SECONDS=20
LANDING_WAIT_SECONDS=60
DELIVERY_WAIT_SECONDS=90
NUDGE_INTERVAL_SECONDS=15
# Past OVERSEER_SWEEP_SECONDS, and well inside the 120 seconds of the gate seed-demo.sh sets.
SWEEP_PUBLISH_SECONDS=35
# What demo-activity.js writes for a builder: three turns of its usage.
TOKENS_PER_RUNNING_ROW=69660
export TZ="Europe/Amsterdam"
unset AGENT_PROGRESS_ROOT FORGE_ROOT
# The same scratch home seed-demo.sh used: no live board, real registry or real Watcher socket is reached.
# Chrome keeps the user's home: under a fresh one, headless Chrome stalled before its first screenshot.
USER_HOME="$HOME"
export HOME="$WORK/home"
# Every session the Overseer launches is the scripted fake agent, never a vendor's CLI, and it keeps working rather than ending
# unreported, which the Overseer would count as a crash and answer with an outage that pauses the board.
export AGENT_PROGRESS_FAKE_AGENT=1 FORGE_FAKE_AGENT=1
export AGENT_PROGRESS_FAKE_AGENT_KEEPS_WORKING=1 FORGE_FAKE_AGENT_KEEPS_WORKING=1
[[ -d "$HOME" && -d "$REPOSITORY" ]] || { echo "Run seed-demo.sh $WORK first" >&2; exit 1; }

cd "$REPOSITORY"
cli() { bun "$TOOL_CHECKOUT/agent-progress.ts" "$@"; }

BRIDGE_URL="$(cli oversee --port 0 --detach --json | sed -n 's/.*"url": *"\([^"]*\)".*/\1/p')"
[[ -n "$BRIDGE_URL" ]] || { echo "The Overseer printed no URL" >&2; exit 1; }
# Watchers outlive the Overseer by design, so the demo's own Watchers and fake sessions are ended by their scratch path.
trap 'cli oversee stop --now > /dev/null 2>&1 || true; pkill -f "$REPOSITORY/.forge" || true' EXIT
cli oversee resume > /dev/null
# The first start puts the seeded low tickets in ready-for-review; readying them lets them build.
cli ticket ready 13 14 > /dev/null
cli intake -- "Customers want a wish list on product pages" > /dev/null
sleep "$SETTLE_SECONDS"
# Seeded with no review phase. Stored for a moment, it sends #007 to a fresh reviewer; the landing below goes without it.
PIPELINE="$REPOSITORY/.forge/pipeline.json"
cp "$PIPELINE" "$WORK/pipeline-without-review.json"
bun -e 'const path = process.argv[1]; const pipeline = await Bun.file(path).json(); await Bun.write(path, JSON.stringify({ ...pipeline, review: { name: "code-review" } }, null, 2) + "\n");' "$PIPELINE"
cli ticket status 7 in-review --at -2h > /dev/null
cli ticket park 5 -- "Which carrier gives the delivery estimate? The ticket does not say." > /dev/null
sleep "$SETTLE_SECONDS"
job_launched() { grep '"job-launched"' "$REPOSITORY/.forge/log.jsonl" | grep "$1" | sed -n 's/.*"jobId":"\([^"]*\)".*/\1/p' | head -1; }
ASSISTANT_JOB="$(job_launched '"kind":"assistant"')"
INTAKE_JOB="$(job_launched '"kind":"product-owner"')"
ASKING_BUILDER_JOB="$(job_launched '"ticketIds":\["008"\]')"
[[ -n "$ASSISTANT_JOB" && -n "$INTAKE_JOB" && -n "$ASKING_BUILDER_JOB" ]] || { echo "The Overseer launched no Assistant, product owner or builder of #008" >&2; exit 1; }
cli intake title "$INTAKE_JOB" -- "Wish list on product pages" > /dev/null
# What the builder of #008 notes for the options of the question demo-activity.js has it ask.
cli question options "$ASKING_BUILDER_JOB" -- '{"question": "How long should a password reset link stay valid?", "options": [{"label": "15 minutes", "touches": ["src/auth/ResetLinks.ts"], "tradeOff": "Safer; a slow mail can expire first.", "acceptanceEffect": "Holds A2 as written."}, {"label": "One hour", "touches": ["src/auth/ResetLinks.ts", "docs/security.md"], "tradeOff": "Kinder to slow mail; a stolen link works longer.", "acceptanceEffect": "A2 changes to one hour."}]}' > /dev/null
# User's messages first: the Assistant, mid-turn since its boot, queues its message; the product owner's Watcher writes its
# message into the event log, and the session activity follows it there.
cli job message "$ASSISTANT_JOB" -- "Is anything waiting on me?" > /dev/null
bun "$HERE/send-picture.js" "$REPOSITORY/.forge" "$INTAKE_JOB" "$HERE/demo-pictures/wish-list-sketch.png" "Like this sketch: a heart on every product card."
for ((i = 0; i < DELIVERY_WAIT_SECONDS; i += 1)); do
  grep -q '"origin":"client".*heart on every product card' "$REPOSITORY/.forge/jobs/$INTAKE_JOB/events-1.ndjson" && break
  # A Pass that settled while the message was written skips the wake it raised, so a log line gives the next one a change.
  if ((i % NUDGE_INTERVAL_SECONDS == NUDGE_INTERVAL_SECONDS - 1)); then cli log "Waiting for $INTAKE_JOB to take User's message" > /dev/null; fi
  sleep 1
done
grep -q '"origin":"client".*heart on every product card' "$REPOSITORY/.forge/jobs/$INTAKE_JOB/events-1.ndjson" || { echo "$INTAKE_JOB never took User's message" >&2; exit 1; }
bun "$HERE/demo-activity.js" "$REPOSITORY/.forge"
# A job's tokens reach its row only when it ends, so the running rows take the header's statistic from here.
for row_id in $(cli status --json | bun -e 'const status = await Bun.stdin.json(); console.log(status.tasks.filter((task) => task.status === "in-progress" && task.end === null).map((task) => task.id).join(" "));'); do
  cli task update "$row_id" --tokens "$TOKENS_PER_RUNNING_ROW" > /dev/null
done
sleep 5

mkdir -p "$SHOTS"
SHOTS="$(cd "$SHOTS" && pwd -P)"
# Each view's own query string makes every shot a fresh document, so the load event fires after a hash change too.
# width, height and the extra job keys vary per view: a view shot clips to its panel, so a README cell shows content.
# The half-width README cells take the narrow shots, so their text stays readable in place.
shot() {
  local name="$1" route="$2" scheme="$3" width="$4" height="$5" extra="${6:-}"
  printf '{"url":"%s?shot=%s#%s","width":%s,"height":%s,"colorScheme":"%s","waitMilliseconds":1500,"output":"%s/%s.png"%s}' \
    "$BRIDGE_URL" "$name" "$route" "$width" "$height" "$scheme" "$SHOTS" "$name" "$extra"
}
# Each shoot.js run is a fresh Chrome, so its first job trades a one-time code for the session cookie every data route needs.
session_job() {
  local name="$1"
  printf '{"url":"%s#session=%s","width":640,"height":400,"waitMilliseconds":1500,"output":"%s/%s.png"}' \
    "$BRIDGE_URL" "$(bun "$HERE/session-code.js" "$REPOSITORY/.forge")" "$SHOTS" "$name"
}
NARROW_PANEL_WIDTH=640
# The Assistant's chat beside its incident rail and Intake's session list beside its chat need the room of a full row,
# and the Agents tables a little more.
FULL_ROW_WIDTH=1280
AGENTS_TABLE_WIDTH=1440
# The Questions view beside the question panel, which is 800 pixels wide.
QUESTION_PANEL_SHOT_WIDTH=1640
# Each shot list runs in a fresh browser, where the question panel opens at the demo's open decisions. Only the Questions
# shot shows it, opened again from its first card: every other shot folds it to its tab, and the fold is kept in the
# browser.
FOLD_QUESTION_PANEL='const fold = [...document.querySelectorAll(\"button\")].find((button) => button.textContent === \"Fold to the tab\"); if (fold) fold.click();'
PANEL_CLIP=',"clipSelector":"main.bridge-panel","actionScript":"'"$FOLD_QUESTION_PANEL"'"'
QUESTION_PANEL_OPENED=',"actionScript":"const open = [...document.querySelectorAll(\"button\")].find((button) => button.textContent === \"Open beside the board\"); if (open) open.click();"'
# The transcript streams in after the page loads, so a chat shot waits for its first agent turn and the pictures in it.
# The Assistant's chat opens with the line the Overseer started the session with; the shot starts at its first turn.
CHAT_FROM_FIRST_TURN=',"clipSelector":"main.bridge-panel","actionScript":"(async () => { '"$FOLD_QUESTION_PANEL"' const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)); for (let i = 0; i < 100 && !document.querySelector(\".bridge-chat-turn[data-speaker=agent]\"); i += 1) await pause(200); await Promise.all([...document.images].map((image) => image.complete ? null : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; }))); for (const boot of document.querySelectorAll(\".bridge-chat-system\")) { boot.style.display = \"none\"; break; } await pause(400); })()"'
TICKET_BODY_SHOWN=',"clipSelector":".bridge-side-panel","actionScript":"const frame = document.querySelector(\"iframe.bridge-ticket-body\"); const tall = () => { if (frame.style.height !== \"470px\") frame.style.height = \"470px\"; }; new MutationObserver(tall).observe(frame, { attributes: true }); tall();"'
FOLDED=',"actionScript":"'"$FOLD_QUESTION_PANEL"'"'
PROGRESS_WITHOUT_HEADER=',"clipSelector":"main.bridge-panel","actionScript":"'"$FOLD_QUESTION_PANEL"' document.querySelector(\".bridge-header\").style.display = \"none\""'
{
  printf '[\n'
  session_job session-jobs-running; printf ',\n'
  shot bridge-assistant assistant light "$FULL_ROW_WIDTH" 640 "$CHAT_FROM_FIRST_TURN"; printf ',\n'
  shot bridge-intake "intake/$INTAKE_JOB" light "$FULL_ROW_WIDTH" 760 "$CHAT_FROM_FIRST_TURN"; printf ',\n'
  shot bridge-questions questions light "$QUESTION_PANEL_SHOT_WIDTH" 900 "$QUESTION_PANEL_OPENED"; printf ',\n'
  shot bridge-tickets tickets/ticket/012/description light "$NARROW_PANEL_WIDTH" 1000 "$TICKET_BODY_SHOWN"; printf ',\n'
  shot bridge-agents agents light "$AGENTS_TABLE_WIDTH" 760 "$PANEL_CLIP"; printf '\n]\n'
} > "$SHOTS/bridge-jobs-running.json"
HOME="$USER_HOME" bun "$HERE/shoot.js" "$SHOTS/bridge-jobs-running.json"

# Then the landing. Without the review phase, a built ticket queues for its Airlock; paused, all three queue in one Pass.
cp "$WORK/pipeline-without-review.json" "$PIPELINE"
cli oversee pause > /dev/null
cli ticket status 2 in-review --at -3h > /dev/null
cli ticket status 10 in-review --at -2h > /dev/null
cli ticket status 16 in-review --at -1h > /dev/null
cli oversee resume > /dev/null
# A Pass that settled on the resume without acting on it skips later wakes, so a log line changes what it compares.
# #002 lands; #010's long gate then holds the Overseer's Pass, so only the next sweep publishes the state the shots show.
sleep 3
cli log "Waiting on the Airlock" > /dev/null
for ((i = 0; i < LANDING_WAIT_SECONDS; i += 1)); do
  grep -q '"job-launched".*"ticketIds":\["010"\]' "$REPOSITORY/.forge/log.jsonl" && break
  sleep 1
done
sleep "$SWEEP_PUBLISH_SECONDS"
{
  printf '[\n'
  session_job session-jobs-landing; printf ',\n'
  shot bridge-merge-queue kanban/merge-queue light "$NARROW_PANEL_WIDTH" 240 "$PANEL_CLIP"; printf ',\n'
  shot bridge-kanban kanban light 1640 924 "$FOLDED"; printf ',\n'
  shot bridge-kanban-dark kanban dark 1640 924 "$FOLDED"; printf ',\n'
  shot bridge-progress progress light 1240 900 "$PROGRESS_WITHOUT_HEADER"; printf '\n]\n'
} > "$SHOTS/bridge-jobs-landing.json"
HOME="$USER_HOME" bun "$HERE/shoot.js" "$SHOTS/bridge-jobs-landing.json"
# What the shots' header should say: running, its agents working.
cli oversee status > "$SHOTS/run-status.txt"
