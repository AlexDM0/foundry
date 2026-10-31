# What could not be settled

Triage of `handbacks.json` key `unverifiable` (255 items), closed against commit 70ce56de. Numbers are indexes into that
list. Everything not named here was verified, removed from its document, or was a process note: a link pending (all
resolve now), a check a writer skipped (rerun in this pass), or a line count.

## Still rests on something this pass could not reach

These stay in the documents. Each is stated there as read, as a limit, or with its source. None is presented as run.

| Item | Where | Why it is open | What would settle it |
| --- | --- | --- | --- |
| 64 | `overseer-claude-probe.md`, "A scratch run outside the probe record"; `confinement.md`; matrix row "Write shared git config" | One session, hand-written settings, version and command line not recorded. Session columns other than the builder are inferred. Why Bash was refused at `<common>/config` is unknown: no `denyWrite` names it, so it may be vendor behaviour | A real launch rendered by `ClaudeCodeAdapter`, one per role, with the version recorded |
| 60 | Same | `<common>/hooks` was never tried, only `<common>/config` and the root `.githooks` | Same run |
| 62, 249 | `gap-launch-file-deny-one-level` | Whether a confined session can connect to a Watcher socket. The entry says it was not exercised | A live session under a rendered profile |
| 108 | `overseer-claude-probe.md`, Transcript layout | "A workflow agent's `.meta.json` holds no `toolUseId`" comes from 906 files under `~/.claude/projects`, outside this pass's reach | Rerun over that folder, or a committed fixture |
| 107, 114 | `overseer-claude-probe.md`, contract tables and P7 | The `none` marks come from a grep of the drivers, not every log, and the logs sit in the main checkout's `.claude/.evidence/runner-claude-probe/`, which this pass may not read. P7's second group was re-observed in this session instead: the Bash shell led group 37407 under a `claude` in group 88794 (Claude Code 2.1.309) | Read those logs |
| 112 | `overseer-claude-probe.md`, Session id | A version 8 id rests only on live sessions, as the document says | A probe |
| 33, 117, 120, 235 | `on-disk-atlas.md`, `running-a-board.md`, `overseer-api.md`, `backlog.md` | agent-dashboard is outside this repository: that it reads `projects.json`, calls `/api/summary` without a token and uses `?embedded=dashboard` rests on comments, specs and route guards here | Read agent-dashboard |
| 101 | `porting.md`, design-section table | The section numbers for mandatory review and gate cache come from a table of contents; the design file is in the main checkout | Open those sections |
| 245, 71 | `gap-waiver-answer-has-no-effect`, runbook, `questions-and-incidents.md` | The grant side (`ticket edit --force`, answer, `job fresh`) is read, not run. The refuse side was probed | A scripted waiver on a scratch board |
| 245 | `gap-malformed-ticket-answer-v6` and neighbours | `incident-escalate` on a `malformed-ticket` is read, not run | Scratch board |
| 250, 252 | `gap-merge-gate-blocks-pass` | The `pgrep` and `kill` recipe was tried against a detached shell, not a hung gate. Under a Linux sandbox wrapper the matched process may differ | A hung gate |
| 243, 180 | `gap-refused-relayed-command-partial` | Mechanism confirmed; no relayed command was found that changes the board and then refuses. The entry says so | None needed unless such a command appears |
| 73 | `questions-and-incidents.md` | The code drops a second request while a job waits. Whether Claude Code can issue one needs parallel tool calls in a live session | A probe |
| 218, 219 | `contributing.md` | Whether the edit hook fires in a job session, and whether `.githooks/pre-commit` passes in a job worktree with no `node_modules`. No real session ran | A real job session |
| 205 | `getting-started.md` | Non-macOS behaviour is read, never run | A Linux run |
| 230, 231, 233 | `cutover-smoke.md` | The smoke was not run: it spends real sessions, and the document makes no claim about its status at 70ce56de. The older logs end in failures | One real run |
| 12, 13, 16, 17, 18 | `ticket-journey.html` | Two scenarios and three default paths were played on the Board and Playbook only. The page says so | Scripted Assistant turns |
| 52, 53, 54 | `failure-lab.html` | Gate or install Watcher kills, reboots mid-gate and the power-cut tail are read. The page says so | Fault injection |
| 244 | `gap-intake-stream-connection-cap` | Six connections is Chromium's HTTP/1.1 behaviour, not exercised against this Bridge | A live Bridge with seven sessions |
| 121 | `overseer-api.md`, `caller-reach-matrix` | Browser facts are not tested in a browser; the footnote says so | Headless Chrome against a live Overseer |
| 86, 87, 89, 56, 57 | Interactive pages | `navigator.clipboard` success, `auto` theme in light, real focus loss, a screen reader and real Tab presses never ran in headless Chrome | A hand pass |
| 228, 229 | `decisions.md` | Some alternatives and the "no gate cache of our own" reasoning are reasoned from code, not recorded anywhere | Owner read |
| 236, 237 | `backlog.md` | Step 7 of the conventions refactor has `docs/migration-plan.md` as its only record, and no code can prove it | Owner read |

## Found while checking, not in any document as a defect

| Item | Finding | State |
| --- | --- | --- |
| New | A refresh gate runs on a detached `HEAD`. Under a profile of that shape `git reset --hard HEAD~1` exited 0 and moved `HEAD`, and `Airlocks` reads the landed commit from `MergeRun.headOf`. `confinement.md` records the reset; what a landing then does is read, not run | Candidate for `known-gaps.md` once run |
| 157 | A re-spawn of an unclaimed instance rewrites the launch file with a fresh secret, so a Watcher that read the earlier file refuses `secret` while `sendFrames` returns true and a marker hides a lost first message. Needs an Overseer restart inside the claim window | Read, not reproduced, not stated in `watchers.md` |
| 164 | `WatcherFleet.watcherIsLive` in `runMergeIn` may never be true, since a merge job has no Watcher | Unsettled, not claimed |
| 59 | After a repeat ends a job `replaced` or `job-lost`, the failure lab's Keeps running row still lists the Watcher. It holds for the linger window, then the Watcher exits | Left as it stands |

## For the coordinator or the owner to decide

- **Item 5:** the four-line header blockquote renders as one run-on paragraph. Hard breaks are a one-line change per
  document, across all of them.
- **Items 2, 3, 207:** README clones over https and `getting-started.md` over ssh. `origin` holds
  `group-code-lifecycle` (`git ls-remote`), so item 2 and the fetch row no longer stand; the row now fetches from
  `origin`. Which URL to print is the owner's call.
- **Items 4, 7:** `.readme-graphics/regenerate.sh` depends on timing. Look at the images after any rerun.
- **Item 96:** the heading "The test pyramid" and `test-pyramid.svg` stay because the plan fixes them; the figure is no
  longer a pyramid.
- **Items 24, 26, 35, 45, 50, 69, 94, 109, 155, 161, 163, 184, 187, 199, 223, 242 and the review finding on
  `control-and-hatch.md`:** line counts over the aim of about 350. Nothing was cut in this pass. `contract-guard` is kept.
- **Item 216:** the plan does not list `docs/figures/runbook/unhold-outcomes.svg` or `overseer-down.svg`, and it still
  names no fixed runbook anchors; the two interactive pages derive theirs from the heading text.
- **Item 8, 214:** older `/tmp/ap-readme.*` folders remain, and other worktrees' Overseers may be running. Neither came
  from this pass.
