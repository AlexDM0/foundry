#!/usr/bin/env bash
# Starts this checkout's Overseer on the seeded demo board with the fake agent adapter, lets it launch jobs that keep
# working, records an intake, then shoots each view of the Bridge it serves and stops it again.
set -euo pipefail

# Usage: bridge-demo.sh <work folder seed-demo.sh filled> <shots folder>
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_CHECKOUT="$(cd "$HERE/.." && pwd)"
WORK="$(cd "${1:?usage: bridge-demo.sh <work folder> <shots folder>}" && pwd -P)"
SHOTS="${2:?usage: bridge-demo.sh <work folder> <shots folder>}"
REPOSITORY="$WORK/example-storefront"
SETTLE_SECONDS=20
LANDING_WAIT_SECONDS=60
# Past OVERSEER_SWEEP_SECONDS, and well inside the 120 seconds of the gate seed-demo.sh sets.
SWEEP_PUBLISH_SECONDS=35
# What demo-activity.js writes for a builder: three turns of its usage.
TOKENS_PER_RUNNING_ROW=69660
export TZ="Europe/Amsterdam"
unset AGENT_PROGRESS_ROOT AGENT_PROGRESS_V2_ROOT
# The same scratch home seed-demo.sh used: no live board, real registry or real Watcher socket is reached.
# Chrome keeps the user's home: under a fresh one, headless Chrome stalled before its first screenshot.
USER_HOME="$HOME"
export HOME="$WORK/home"
# Every session the Overseer launches is the scripted fake agent, never a vendor's CLI, and it keeps working rather than ending
# unreported, which the Overseer would count as a crash and answer with an outage that pauses the board.
export AGENT_PROGRESS_FAKE_AGENT=1 AGENT_PROGRESS_V2_FAKE_AGENT=1
export AGENT_PROGRESS_FAKE_AGENT_KEEPS_WORKING=1 AGENT_PROGRESS_V2_FAKE_AGENT_KEEPS_WORKING=1
[[ -d "$HOME" && -d "$REPOSITORY" ]] || { echo "Run seed-demo.sh $WORK first" >&2; exit 1; }

cd "$REPOSITORY"
cli() { bun "$TOOL_CHECKOUT/agent-progress.ts" "$@"; }

BRIDGE_URL="$(cli oversee --port 0 --detach --json | sed -n 's/.*"url": *"\([^"]*\)".*/\1/p')"
[[ -n "$BRIDGE_URL" ]] || { echo "The Overseer printed no URL" >&2; exit 1; }
# Watchers outlive the Overseer by design, so the demo's own Watchers and fake sessions are ended by their scratch path.
trap 'cli oversee stop --now > /dev/null 2>&1 || true; pkill -f "$REPOSITORY/.agent-progress-v2" || true' EXIT
cli oversee resume > /dev/null
# The first start puts the seeded low tickets in ready-for-review; readying them lets them build.
cli ticket ready 13 14 > /dev/null
cli intake -- "Customers want a wish list on product pages" > /dev/null
sleep "$SETTLE_SECONDS"
# Seeded with no review phase. Stored for a moment, it sends #007 to a fresh reviewer; the landing below goes without it.
PIPELINE="$REPOSITORY/.agent-progress-v2/pipeline.json"
cp "$PIPELINE" "$WORK/pipeline-without-review.json"
bun -e 'const path = process.argv[1]; const pipeline = await Bun.file(path).json(); await Bun.write(path, JSON.stringify({ ...pipeline, review: { name: "code-review" } }, null, 2) + "\n");' "$PIPELINE"
cli ticket status 7 in-review --at -2h > /dev/null
cli ticket park 5 -- "Which carrier gives the delivery estimate? The ticket does not say." > /dev/null
sleep "$SETTLE_SECONDS"
bun "$HERE/demo-activity.js" "$REPOSITORY/.agent-progress-v2"
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
NARROW_PANEL_WIDTH=640
WIDE_PANEL_WIDTH=1000
PANEL_CLIP=',"clipSelector":"main.bridge-panel"'
# The transcript opens with the session's first frame, raw; the shots start at the agent's first line.
PANEL_FROM_FIRST_ANSWER=',"clipSelector":"main.bridge-panel","actionScript":"document.querySelector(\".bridge-transcript-entry[data-role=user]\").style.display = \"none\""'
TICKET_BODY_SHOWN=',"clipSelector":".bridge-detail","actionScript":"const frame = document.querySelector(\"iframe.bridge-ticket-body\"); const tall = () => { if (frame.style.height !== \"470px\") frame.style.height = \"470px\"; }; new MutationObserver(tall).observe(frame, { attributes: true }); tall();"'
WAVES_WITHOUT_HEADER=',"actionScript":"document.querySelector(\".bridge-header\").style.display = \"none\"","clipBottomSelector":".bridge-dependency-legend","clipBottomPadding":0'
{
  printf '[\n'
  shot bridge-tickets tickets/012 light "$NARROW_PANEL_WIDTH" 1500 "$TICKET_BODY_SHOWN"; printf ',\n'
  shot bridge-agents agents light "$WIDE_PANEL_WIDTH" 340 "$PANEL_CLIP"; printf ',\n'
  shot bridge-questions questions light "$NARROW_PANEL_WIDTH" 520 "$PANEL_CLIP"; printf ',\n'
  shot bridge-assistant assistant light "$WIDE_PANEL_WIDTH" 440 "$PANEL_FROM_FIRST_ANSWER"; printf ',\n'
  shot bridge-intake intake light "$NARROW_PANEL_WIDTH" 520 "$PANEL_FROM_FIRST_ANSWER"; printf '\n]\n'
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
  grep -q '"job-launched".*"ticketIds":\["010"\]' "$REPOSITORY/.agent-progress-v2/log.jsonl" && break
  sleep 1
done
sleep "$SWEEP_PUBLISH_SECONDS"
{
  printf '[\n'
  shot bridge-merge-queue kanban/merge-queue light "$NARROW_PANEL_WIDTH" 240 "$PANEL_CLIP"; printf ',\n'
  shot bridge-kanban kanban light 1640 924; printf ',\n'
  shot bridge-kanban-dark kanban dark 1640 924; printf ',\n'
  shot bridge-progress progress light 1240 900 "$WAVES_WITHOUT_HEADER"; printf '\n]\n'
} > "$SHOTS/bridge-jobs-landing.json"
HOME="$USER_HOME" bun "$HERE/shoot.js" "$SHOTS/bridge-jobs-landing.json"
# What the shots' header should say: running, its agents working.
cli oversee status > "$SHOTS/run-status.txt"
