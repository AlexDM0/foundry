/**
 * The whole command reference, which `cli/HelpText.spec.ts` holds against `COMMAND_NAMES` and the skills under `skills/`.
 * The layout is load-bearing: an entry begins at column 2 and every continuation line is indented past it.
 */
import type { ShellLineGrammar }  from '../src/lib/shell-line/ShellLine.ts';
import { PRODUCT_NAMES }          from '../src/shared/constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE } from '../src/shared/constants/RootOverrideVariable.ts';
import { LINE_GRAMMAR_WORDING }   from './LineGrammarWording.ts';

/** `lineGrammar` is the shell line port's, so `gate add` names the grammar a line runs in on this machine. */
export function helpText(lineGrammar: ShellLineGrammar): string {
  return `${PRODUCT_NAMES.PROGRAM} — tasks, tickets and a Gantt dashboard for one repository

Usage: ${PRODUCT_NAMES.PROGRAM} <command> [options]

The tracker lives in \`${PRODUCT_NAMES.DATA_FOLDER}/\` at the repository root and is shared by every worktree of
it. Every mutating command takes the lock and writes the progress file atomically; the live
Hephaestus serves the board over its API. \`<when>\` is an ISO 8601 timestamp, \`now\`,
or an offset from now: \`-5m\`, \`-2h\`, \`-1d\`, \`+30m\`. \`<n>\` on --tokens is a whole number or a
decimal with a \`k\`/\`m\`/\`b\` suffix: \`12000\`, \`12k\`, \`12.3k\`, \`1.2m\`, \`1.20b\`.

\`--help\` works after a command word as well as on its own, and \`-h\` on its own or straight after
the command word; a \`-h\` further on is refused at exit 1, since it may be text (put text behind a
bare \`--\`). An option taking a value, given twice, is refused at exit 1.
${ROOT_OVERRIDE_VARIABLE} names the repository to use instead of walking up from the current directory. --json, accepted by every
command but hook and help, prints one JSON document on standard output
in place of the human output. The answers of start, stop, init, update, version, machine
and login-item carry \`answerVersion\` 2, and under --json their refusal is the document
{answerVersion, refusal, text} at exit 1: the refusal's code and the sentence printed on
standard error.

\`status\`, \`ticket add\`, every ticket or task move (\`task add --start\` among them), \`ticket
depends\`, \`priority\`, \`agent\`, \`hold\` and \`unhold\` end their
output with one line read from the board after the change: \`Next: 1 of 2 slots free; ready: #003, #005\`, \`Next: no slot
free (2 agents in flight); ready: #003\` or \`Next: 2 of 2 slots free; nothing ready\` — at most five
ready ids, then \`and N more\`; a held ready ticket is left out and named apart, \`; held: #002\` —
followed, while Hephaestus is paused, by \`; hephaestus paused: wait for the user's go\`. --json output
never carries it.

  init                        Create the tracker here: \`${PRODUCT_NAMES.DATA_FOLDER}/\` with an empty progress
      [--project <name>]      file and log and a \`tickets/\` folder, and \`.gitignore\` entries for it
      [--root <path>]         and for \`${PRODUCT_NAMES.WORKTREES_FOLDER}/\`, before any worktree can exist. Beside the
      [--namespace <name>]    tracker go \`session-instructions.md\` (written first, its presence marking
      [--no-hooks] [--json]   the install), \`reference.md\` (the ticket format, the moves and the exit
                              codes) and \`assistant-brief.md\`, the role prompt Hephaestus fills for
                              its Assistant; \`hook session-start\` goes into the agent's
                              session-start entry, in the settings the agent adapter writes, and three
                              skills into the folder the agent loads instruction bundles from:
                              ${PRODUCT_NAMES.PRODUCT_OWNER_SKILL}, which a session asked to file a
                              ticket loads, ${PRODUCT_NAMES.ORCHESTRATE_SKILL}, for the session
                              running the board, which loads ${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} for
                              intake, and ${PRODUCT_NAMES.PIPELINE_SETUP_SKILL}, which the pipeline agent runs as its first
                              line. It never writes the agent's instruction file. Refused when an
                              ancestor already holds a tracker, when a tracker the repository's
                              tracker list names sits above or below the directory, when --root is not
                              an existing directory, and inside a bare repository, which has no
                              working tree to track. Re-running only refreshes what \`update\`
                              refreshes, and \`update\` is the command to reach for there. --project
                              names the project shown on the page, and --no-hooks touches no settings
                              file. Without --root it tracks the root of the repository's main
                              checkout and, run from elsewhere, says it chose that; --root tracks that
                              directory instead. A tracker in a folder of its repository needs
                              --namespace, which sets its branch namespace as \`namespace\` does and
                              is refused when another tracker of the repository lists it or a branch
                              leaves it no room; such a tracker, and any with a namespace, is written
                              into the repository's tracker list in the git directory, so a later
                              \`init\` above or below it is refused. --json prints
                              {answerVersion, outcome, trackerId, project, root}, the outcome
                              \`created\` or, for a tracker that was there, \`refreshed\`.

  update [--no-hooks] [--json]
                              Refresh what the tool wrote into a repository it already tracks: the
                              three files beside the tracker, guidance shipped with the tool rather
                              than files a project edits, the session-start entry, the three skills and
                              the worktrees folder's \`.gitignore\` entry. The tracker itself is left
                              alone: a tracker an earlier ${PRODUCT_NAMES.PROGRAM} wrote in a format this one no
                              longer reads is refused at exit 2 by every command that reads it,
                              saying to run \`update\` with a release that still reads it. It creates
                              no tracker, so it takes no --project and no --root, and it is refused
                              with exit 1 where there is none — \`${PRODUCT_NAMES.PROGRAM} init\` makes one.
                              Each line says whether that file changed, so a session that read the
                              instructions at its start learns that its copy is now stale.
                              --json prints {answerVersion, outcome, installVersion, batonPass,
                              batonPassStep}, batonPass \`done\`, \`not-needed\` or \`not-taken\`; a
                              failed Baton pass is the refusal baton-pass-failed, whose answer
                              adds batonPass \`failed\` and batonPassStep.
                              Every command but init, update, help, status, version, stop,
                              talos-restart, machine and login-item refuses, with exit 1, while the
                              files installed here are of another install version than this
                              ${PRODUCT_NAMES.PROGRAM} (the hooks run regardless);
                              update rewrites them, and it and \`init\` refuse files a newer
                              ${PRODUCT_NAMES.PROGRAM} installed.

  status [--json] [--full]    First Hephaestus: the Baton, the URL, the runtime state, paused or
                              not, and the code version on disk against the live Hephaestus's, with
                              presence: down, it says when it stays down after a crash and names
                              the crash log; live, the last start's kind, the heartbeat, the
                              supervision and the abandoned passes. Then the board:
                              the project, the counts, the rows that are not delivered or
                              abandoned, and the last five log entries newest first. --json prints the
                              same working view for an agent: the unsettled rows and tickets, the
                              last 10 log entries and counts of what was left out. --full lists
                              everything, and with --json prints the whole progress file plus
                              every ticket's frontmatter. Both --json documents carry
                              \`concurrency\`: the limit, the agents in flight, the free slots and
                              the ids of the ready tickets — committed, every dependency settled —
                              high priority first, then normal, then low, each in the order they
                              were readied, then lowest id first. Priority only orders them: it
                              never keeps a ticket from being ready. Beside it, \`readyTickets\` lists the same
                              tickets in the same order as {id, priority, model, effort}, the
                              defaults resolved, plus an optional group and held: true on a held
                              one, so a reader derives none of them itself.
                              Both carry \`epics\`, every epic with its roll-up as \`epic list
                              --json\` prints it, and each ticket's \`epics\`, empty when it has none,
                              and \`hephaestus\`, Hephaestus's facts with {presence}. Read-only, no lock.
      [--tickets-only]        --tickets-only leaves out the free-standing task rows, those that are
                              no ticket's own row and no review bar; tickets and the log stay.
                              The token total is also given per owner, grouped case-insensitively
                              on the trimmed owner under its most common spelling, rows without an
                              owner apart; --json carries it as \`tokensByOwner\`, and then
                              \`ticketCountByStatus\`, every ticket counted per status.
                              With Hephaestus down after a crash, one line on standard error
                              says to read crash-log and to start it again; the JSON is unchanged.

  task add "<name>"           Add a Gantt row. --start marks it in-progress at --at (default
      [--owner <who>]         now), --ticket links it to a ticket that has no row of its own, --note
      [--note <text>]         is the detail shown beside the bar, and --tokens records what the work
      [--ticket <id>]         cost. --force moves --ticket's link off the row that holds it.
      [--review-of <id>]      --review-of marks the row as a review pass of that ticket: the page
      [--start]               draws it directly above the ticket's own row, latest round first. A
      [--tokens <n>]          ticket that does not exist is refused at exit 1.
      [--at <when>] [--force]

  task start|pause|finish|approve|rereview|deliver <id> [--owner <who>] [--note <text>]
      [--tokens <n>] [--at <when>] [--force]
                              Move one row and stamp it: \`start\` sets its start and resumes a
                              paused row, \`pause\` records that the work is waiting without closing
                              the bar, \`finish\` and \`approve\` set its end, \`rereview\` sends a row
                              whose review found too much into its next review pass — round 2, then
                              3 — without reopening the bar, and \`deliver\` records that the work
                              reached its destination. A stamp already recorded is kept, so --at
                              backfills a row nobody registered at the time. A row a ticket owns is
                              refused, except a pause and its resume, naming the \`ticket\` verb that
                              moves both; --force moves only the row.

  task update <id>            Change a row without moving its clock: --name, --owner, --note,
      [--name <text>]         --tokens, or --status for a correction the transitions cannot
      [--owner <who>]         express. At least one of them is required, and --status on a row a
      [--note <text>]         ticket owns is refused unless --force, except a pause and its resume.
      [--status <status>]
      [--tokens <n>] [--force]

  task remove <id>            Delete a row. A ticket pointing at it is unlinked rather than
                              deleted. The id is never given to another row.

  log "<text>" [--at <when>]  Append one line to the log. --at backfills it.

  hook session-start          Print \`session-instructions.md\` for the session the agent is
                              starting: \`init\` and \`update\` wire it as the agent's session-start
                              entry, in the settings the agent adapter writes, which a job's
                              sessions never load. It prints nothing under a job or where no
                              tracker governs (the root of a repository whose trackers sit in
                              folders of it), skips the install version check, and exits 0 whatever
                              happens, printing nothing on failure.

  hook bash-domains           Keep a job's network inside its ticket's \`network\` line: the
      --allow <domains>       network guard a Hephaestus renders into a job's launch, run before each
                              shell command and web fetch. It denies, through the line it prints on
                              standard output, a shell command that asks for a domain, or a web
                              fetch whose URL host names a domain, outside the comma-separated list
                              (\`*.example.com\` admits its subdomains). Any other call passes
                              silently and is granted nothing; a tool it does not know is denied.
                              It skips the install-version check, runs under a job, and exits 0
                              whatever happens, answering deny on any failure.

  hook stage-edits            Keep the file edits of a job of an entity inside its stage's
      --allow <folder>        folders: the edit guard a Hephaestus renders into the launch of such a
                              job. It denies, through the line it prints on standard output, a
                              file edit whose path lies outside every \`--allow\` folder (one per
                              flag), a path made after the job started included. Any other call is
                              denied; a path inside passes silently and is granted nothing. It skips
                              the install-version check, runs under a job, and exits 0 whatever
                              happens, answering deny on any failure.

  usage [--since <when>]      What this project's subagents cost, read out of the transcripts the
      [--transcripts <folder>]
      [--json]                agent wrote for them, a workflow's agents included: one row per
                              agent, oldest
                              first, with its start, its API calls, its end context, its input and
                              output, its browser calls, the characters the harness injected into
                              it and the first line of its brief; then the cohort summary — median
                              calls and end context, mean input and output, and the mean of each
                              figure below. Three of the columns are there to catch a brief being
                              breached: "over 200k" is the share of an agent's input that was sent
                              at a context past 200,000 tokens, "bash edits" counts the edits it
                              made through a shell command instead of the editing tools, and
                              "checks" counts the full test, type-check and lint runs it made per
                              edit instead of per batch. --since splits the cohort on an
                              instant and summarises both sides, which is how a change in the way
                              agents are briefed is measured. --transcripts reads a folder other
                              than the one this repository's path resolves to. It writes nothing,
                              takes no lock and regenerates no page, and a repository with no
                              transcripts is one sentence at exit 0.

  review-stats [--json]       What the recorded reviews catch, miss and cost: every ticket with a
                              review-recorded line, summed over all of them and split by ticket
                              type, by the builder's change size (insertions plus deletions its
                              first recorded pass measured: up to 50, 200, 750, or above) and by
                              its resolved model and effort. Per group: tickets, passes, rounds per
                              ticket, verdicts, findings by class and severity, serious findings
                              (would-ship-a-bug or acceptance-fails) per ticket, review and builder
                              tokens per ticket, review tokens per serious finding, escaped bugs
                              (bugs whose introducedBy names the ticket) per delivered ticket split
                              by whether its last pass had a serious finding, tickets filed from
                              its reviews (foundInReview), the share of claims contradicting the
                              Handoff, and fix and rebase lines per ticket; docs/cli.md defines
                              each. Tickets with no recorded review are counted on one line. It
                              takes no lock and writes and renders nothing, as \`status\` does.

  ticket add "<title>"        File a ticket: a markdown file under \`${PRODUCT_NAMES.DATA_FOLDER}/tickets/\` with
      --type ticket|bug|research
      [--priority low|normal|high]
      [--size XS|S|M|L|XL|XXL]
      [--model <m>]
      [--effort <e>]
      [--group <name>]        its own frontmatter, as a draft ticket with no Gantt row until
                              \`ticket ready\` readies it. The body comes from
      [--depends-on <ids>]    the template, from --body, or from --body-file (\`-\` reads standard
      [--epic <keys>]         input); an empty body falls back to the template, and afterwards the
      [--network <domains>]
      [--entity <key>]
      [--introduced-by <id>]  body is preserved byte for byte, so an agent may edit everything
      [--found-in-review <id>]
      [--body <markdown>]     below the frontmatter freely. --depends-on files it already waiting
      [--body-file <path|->]  on other tickets (\`3,4\`), as \`ticket depends\` does; --epic files it
      [--at <when>]           in existing epics (\`checkout-redesign,loyalty-programme\`, the first
                              its primary one), as \`ticket epic\` does. --introduced-by names the
                              delivered ticket whose change introduced a bug, as
                              \`ticket introduced-by\` does; --found-in-review names the ticket
                              whose review found this one, a ticket that must exist. --network
                              sets its network line, as \`ticket network\` does. --entity files it
                              in an entity the pipeline names, as \`ticket entity\` does, logging
                              no reason. A worker's
                              relayed low finding waits on the worker's ticket and joins its
                              group, and is submitted at once, as \`ticket submit\` does. --priority
                              defaults to normal and only orders the ready tickets, low last.
                              --model (haiku, sonnet, opus, fable)
                              and --effort (low, medium, high, xhigh, max) name what the agents
                              building and reviewing it run on; left off, they are opus and
                              medium. --size, in capitals, is the expected change in code lines
                              (XS ≤ 20, S ≤ 100, M ≤ 300, L ≤ 750, XL ≤ 1500, XXL beyond); left
                              off, the ticket has no size. Anything else is refused at exit 1, and
                              so are --body and --body-file together.

  ticket list [--status <s>]  The tickets with their status, priority, type and row id, and the
                              model and effort after the title where the ticket names them. --status
      [--priority <p>]        and --priority narrow the listing. --json carries no bodies; use
      [--json]                \`ticket show\` for one ticket's prose.

  ticket show <id> [--json]   One ticket: its frontmatter, its priority, its model and effort
                              where it names them, and its body. A ticket changes only through
                              its verbs: \`ticket edit\` for its title and body.

  ticket edit <id>            Rename a ticket with --title, replace its body with --body or
      [--title "<title>"]     --body-file (\`-\` reads standard input), or with --append add to its
      [--append]              end, putting one line ending before the text when the body does not
      [--body <markdown>]     end in one; a title and a body change go in one write. The text is
      [--body-file <path|->]  written in the line ending the body already uses. A new title
      [--at <when>] [--json]  rewrites the title line, the ticket's own row name and a body
                              heading still reading as generated, never the file name or a review
                              row, and is logged; a body change is not. Every other frontmatter
                              byte is kept and \`updated\` is not stamped. Nothing to change writes
                              nothing and exits 0; an empty replacement or title, none of --title,
                              --body and --body-file, or both body options are refused at exit 1.
                              Only a draft or a ticket ready for review is edited: a committed
                              ticket's content is fixed, so from committed onward the edit is
                              refused at exit 1 and nothing is written; \`ticket unready\` puts a
                              committed ticket back into draft.

  ticket agent <id> [--model <m>] [--effort <e>] [--at <when>]
                              Change the model or the effort a ticket's agents run on, or both,
                              with one log line. Refused at exit 1 on a delivered or abandoned
                              ticket, with neither option, with a value outside the lists under
                              \`ticket add\`, and when nothing would change.

  ticket hold <id> [--reason <text>] [--at <when>]
                              Pause a ticket between steps without stopping the run:
                              Hephaestus starts no builder or reviewer for it while it is held, and
                              a claim refuses it. One log line; \`status --json\` lists it in
                              \`heldTicketIds\`. An agent already running is never interrupted, so
                              a hold set after a builder's final status read is too late for the
                              reviewer it starts. Refused at exit 1 on a delivered or abandoned
                              ticket and on one already held.

  ticket unhold <id> [--at <when>]
                              Lift the hold, with one log line: the step it held starts at
                              Hephaestus's next pass. On a ticket in progress whose row is paused, a
                              last line says to resume it with \`task start <row>\`, since
                              Hephaestus never takes a paused row over. Refused at exit 1 on a
                              delivered or abandoned ticket and on one not held.

  ticket release-of <id> [--clear] [--at <when>]
                              Mark a ticket as its group's release ticket: the group's release is
                              that ticket plus every ticket of the group it depends on, directly or
                              not. Stored as \`releasesGroup: true\`; --clear removes it. One log
                              line. Refused at exit 1 on a ticket with no group, when the group
                              already has a release ticket, on a delivered or abandoned ticket,
                              and with --clear on a ticket that is not marked.

  ticket priority <id> low|normal|high [--at <when>]
                              Change a ticket's priority, with one log line. Lowering to low is
                              refused unless the ticket is a draft ticket or committed, and keeps
                              its row: priority only orders the ready tickets. A draft ticket has
                              none at any priority; raising a low ticket that has no row gives it
                              one at once. A low ticket with no row gets
                              its row when its build starts, and keeps
                              it; abandoning a low ticket that has none creates none.

  ticket size <id> XS|S|M|L|XL|XXL [--at <when>]
                              Change a ticket's size, in any status, with one log line. Refused at
                              exit 1 on a value outside the list under \`ticket add\` and when
                              nothing would change.

  ticket network <id> <domain>... | --clear [--at <when>] [--json]
                              Set the public domains a ticket's agents may reach, comma or space
                              separated and stored lower case as \`network\`; --clear removes the
                              line. One log line. Refused at exit 1, writing nothing, unless the
                              ticket is a draft ticket or committed, on a loopback name, a .local
                              name or a loopback or private IP address (network-domain-not-public),
                              and when nothing would change.

  ticket entity <id> <key> --reason <text> [--at <when>] [--json]
                              Where the pipeline names entities, name the entity that builds a
                              ticket, and why: the key is stored as \`entity\`, the reason only in
                              the log line, which also names who assigned it. The product owner
                              runs it under its job, on its own draft ticket or on any ticket
                              ready for review or committed.
                              Refused at exit 1, writing nothing, on a key the pipeline does not
                              name (every key when it names no entity), unless the ticket is
                              a draft ticket, ready for review or committed, with a blank reason,
                              and when nothing would change.

  ticket group <id> <name> [--at <when>] [--json]
                              Put a ticket that has no group into one, a started ticket too: its
                              next landing goes to the group's branch, and the group's release
                              takes it to the main line. One log line. Refused at exit 1, writing
                              nothing, on a ticket already in a group, on a delivered or abandoned
                              ticket, and on a name \`ticket add --group\` refuses.

  ticket ready <id> [<id>...] [--at <when>] [--json]
                              Ready draft tickets to build, all or nothing: each becomes committed
                              with a committed row at any priority, one log line each. Refused at
                              exit 1 with nothing written when a ticket named is not a draft
                              ticket, or is incomplete: \`acceptance-unnumbered\` with no numbered
                              Acceptance item, \`brief-missing\` with no \`## Brief\` holding a
                              non-blank line, each ticket named. \`ticket add\` files every ticket
                              as a draft ticket, with no row; only \`ticket unready\` returns a
                              committed one there.
                              It also readies a ticket in ready-for-review; only User does that.
                              Where the pipeline names entities, a ticket with no entity is refused
                              (\`ticket-without-entity\`), each ticket named, and so is a ticket whose
                              Brief names work outside its entity (\`work-outside-entity\`), each
                              ticket and path named.
  ticket unready <id> [--at <when>] [--json]
                              Put a committed ticket back into draft to edit it there: its row and
                              its kept content go, everything else stays, one log line
                              (ticket-unreadied). It is committed again as any draft is, by
                              \`ticket ready\` or a filer's \`ticket submit\`. Refused at exit 1
                              with nothing written on a ticket that is not committed, and while
                              a job of the ticket is on the board: stop the job first.
  ticket submit <id> [<id>...] [--at <when>] [--json]
                              The filer's close of its draft tickets. With ticket review off, each
                              complete draft becomes committed with its row (ticket-committed); with
                              it on, each becomes ready-for-review with no row
                              (ticket-submitted-for-review) and waits for User's ticket ready.
                              An incomplete draft stays a draft and is named with its gaps.
                              Refused at exit 1 when a ticket named is not a draft ticket, and,
                              with ticket review off where the pipeline names entities, when a
                              complete draft has no entity (\`ticket-without-entity\`). Where the
                              pipeline names entities, a complete draft whose Brief names work
                              outside its entity is refused (\`work-outside-entity\`), review on or off.
  ticket park <id> [--incident <I>] -- <reason> [--at <when>] [--json]
                              Hold the ticket parked:<incident kind> (parked:user with none) and
                              open a parked decision to User; under a question incident it stops
                              the waiting job (outcome stopped) and carries the agent's questions.

  ticket abandon|reopen <id> [--branch <b>] [--commit <sha>]
      [--reason <text>] [--tokens <n>] [--at <when>]
                              Move a ticket and its Gantt row together, stamping both: abandon
                              from anything not already delivered or abandoned, reopen from
                              anything but a draft ticket or committed. Hephaestus makes every other
                              lifecycle move. A draft ticket moves only through \`ticket ready\` or
                              \`abandon\`.
                              Moving a ticket to the status it already has is refused and logs
                              nothing — \`ticket rereview\` below is the one exception. Every
                              move out of in-review finishes and delivers the ticket's in-progress
                              review bar, with one log line each. A move to in-progress warns on
                              standard error, and still moves it, when the ticket is held.
                              \`abandon\` requires --reason; \`reopen\` clears the stamps and returns
                              the row to committed. --branch and --commit record where the work
                              landed, and --tokens what it cost; --tokens on a ticket with no
                              row (a low one never started) is refused at exit 1.

  ticket deliver <id> --by-hand [--branch <b>] [--commit <sha>] [--at <when>]
                              Record as delivered a ticket finished and landed outside
                              Hephaestus, from any status but draft, in one hold: it merges, lands
                              and spawns nothing, and logs \`ticket-delivered\` with byHand true.
                              Refused at exit 1 while a Hephaestus's Baton is live
                              (hephaestus-owns-the-lifecycle) and while a job of the ticket is live
                              (ticket-has-live-job).

  ticket rereview <id> --start-review [--owner <who>] [--note <text>] [--at <when>]
                              The next review round and the reviewer's in-progress bar
                              (\`Review <N> #<id> — <title>\`, its \`reviewOf\` the ticket, N the
                              \`## Review\` sections plus one) in one lock hold, closing any bar of
                              the round before. A bundle's bar carries its claim's agent key while
                              other rows of the bundle still run.
                              --owner and --note name the bar, and are refused without the flag.

  ticket rereview <id>        Send a ticket already in review round again, for a fresh reviewer: the
      [--at <when>]           ticket stays in-review and only its \`updated\` moves, while its row
                              goes one review round up, from 2, and the log says which round it is.
                              It is the one verb that may be run on the status the ticket already
                              has, and it is refused from every other status. It takes no --tokens:
                              the row's figure is the builder's, and a review pass has its own row.

  ticket status <id> <status>
                              The same move, naming the target status directly: committed,
                              in-progress, in-review, reviewed, delivered or abandoned. It takes
                              the same options and is the documented way to make a move the verbs above refuse.

  ticket link <ticketId> <taskId> [--force]
                              Point a ticket at an existing row instead of the one it filed.
                              Refused when that row already belongs to another ticket, unless
                              --force, which unlinks it there first.

  ticket depends <id> [<id>...] | --add <ids> | --remove <ids> [--json]
                              Set the tickets this one waits on. Bare ids replace its list, and no
                              ids clears it; the output names every id that dropped, and says
                              which of those are still open, since the ticket may now start before
                              them. --add 3,4 appends to the list (an id already there is kept),
                              --remove 3,4 takes ids out; either beside bare ids is refused as
                              ambiguous, and so are the two together. --json carries the ticket
                              with \`added\` and \`dropped\`. Refused for a ticket that does not exist
                              and for a list that would make tickets wait on each other in a
                              circle. Until every one of them is reviewed or delivered, the
                              ticket's row, table entry and card read "waiting on #003", \`ticket list\`
                              says so too, and a move to in-progress warns on standard error but
                              still moves it.

  ticket epic <id> [<key>...] | --add <keys> | --remove <keys> [--at <when>] [--json]
                              Set the epics a ticket belongs to, the first its primary epic. Bare
                              keys replace its list, and no keys clears it; --add appends (a key
                              already there keeps its place), --remove takes keys out, and the two
                              are refused beside bare keys or together, as for \`ticket depends\`.
                              An epic that does not exist is refused at exit 1 with nothing
                              written. One log line; \`updated\` is not stamped. --json carries the
                              ticket with \`added\` and \`dropped\`. Epics never affect dispatch,
                              claiming, concurrency or release: that is \`--group\`.

  ticket introduced-by <id> [<cause id>] [--at <when>] [--json]
                              Name the delivered ticket whose change introduced a bug, stored as
                              its \`introducedBy\`; no cause, or an empty one, clears it. Refused at
                              exit 1 with nothing written when the ticket is not a bug, or the
                              cause does not exist, is the ticket itself or is not delivered. One
                              log line; \`updated\` is not stamped.

  epic add <key> "<title>"    Add an epic, a larger feature tickets are grouped under:
      [--body <markdown>]     \`${PRODUCT_NAMES.DATA_FOLDER}/epics/<key>.md\` holding its key, title and colour
      [--body-file <path|->]  slot, then the description from --body or --body-file (\`-\` reads
      [--at <when>] [--json]  standard input), kept byte for byte. The key is lower-case letters
                              and digits in words joined by single hyphens (\`checkout-redesign\`);
                              a malformed key or one already taken is refused at exit 1 with
                              nothing written, and so are --body and --body-file together. The
                              slot, 1 to 6, is the one the fewest epics use, the lowest on a tie,
                              and is never reassigned.
  epic edit <key>             Change an epic's title, or replace its description, or with
      [--title "<title>"]     --append add to its end. Nothing to change writes nothing and exits 0;
      [--append]              an empty replacement or title, none of --title, --body and
                              --body-file, or both body options, are refused at exit 1.
      [--body <markdown>]
      [--body-file <path|->]
      [--at <when>] [--json]
  epic list [--json]          Every epic with its roll-up: its ticket ids, a count per ticket
                              status, the tokens of each ticket's own row and review rows, and its
                              span from the first start to the last end (open while a row runs,
                              null before any starts). An epic has no status of its own.
  epic show <key> [--json]    One epic: its roll-up and its description.
  epic remove <key> [--at <when>] [--json]
                              Delete an epic's file. Refused at exit 1 while any ticket names it.

  draft open "<title>"        Open a filing draft, the working record a filing session builds tickets
      --owner <who>           from: \`${PRODUCT_NAMES.DATA_FOLDER}/filing-cabinet/D<n>.json\` holding its title,
      [--request <text>]      the request from --request or --request-file (\`-\` reads standard
      [--request-file <path|->]
      [--json]                input) kept byte for byte, and the claim held by <who>. Prints the
                              new id, \`D1\`, \`D2\`, …, never reused; --json prints the draft.
  draft claim D<n> --owner <who> [--force] [--json]
                              Take a draft's claim. Refused at exit 1 with nothing written while
                              another owner holds it, unless --force, which logs the takeover; how
                              long ago it was claimed is never judged. Only this command checks
                              the claim.
  draft release D<n> [--json] Drop a draft's claim, as a session ending with work left does.
  draft note D<n> "<text>" [--assumption] [--json]
                              Add a research fact, its paths written in the text, or with
                              --assumption an assumption, as the next note N1, N2, ….
  draft ask D<n> "<question>" --context <text> --option <text> --option <text> [--option …]
      --recommended <letters> [--multiple] [--under Q<k>] [--json]
                              Add the next question Q1, Q2, …, its two to four options lettered
                              a to d in the order given. --multiple makes it multi-select, whose
                              --recommended may name several letters (a,c); --under makes it a
                              follow-up of Q<k>. A wrong option count, a letter outside the
                              options or a missing Q<k> is refused at exit 1.
  draft answer D<n> Q<k> "<answer>" [--json]
                              Record an answer, overwriting any earlier one: option letters (a or
                              a,c, several only on a multi-select question) or else free text. The
                              log keeps every answer. Needs no claim.
  draft drop D<n> N<k>|Q<k> [--json]
                              Remove a note or a question made moot, a question with its follow-ups.
                              Numbers are never reused.
  draft close D<n> --tickets <ids> [--json]
                              End a draft once its tickets are filed: removes its file and logs the
                              ticket ids it became. A ticket that does not exist, or any question
                              still open, is refused at exit 1 with nothing written.
  draft abandon D<n> --reason <text> [--json]
                              Remove a draft, logging the reason; without --reason it is refused
                              at exit 1.
  draft show D<n> [--json]    One draft: its title, claim, state, request, notes and question
                              tree. The state is waiting while a question is open, else
                              researching while claimed and resumable once released. --json prints
                              the whole stored draft, so a rebooted session resumes from it alone.
  draft list [--json]         Every open draft; a malformed draft file is reported on standard
                              error and skipped.

  concurrency [<n>] [--json]  Print the concurrency limit: how many agents may be in flight at once.
                              A slot is a build or review job, in any state; merge, merge-agent,
                              refresh, session and pipeline agent jobs take none, and no row takes one.
                              With <n>, store a new one for every worktree, a whole number from 1
                              to 10: any other is refused at exit 1 with nothing written, and one
                              above 10 an older tracker stored reads as 10. A tracker that never
                              set one reads 2; a limit below the agents already in flight is
                              accepted and simply leaves no free slot. \`status --json\` carries it
                              beside \`agentsInFlight\`, the free slots and the ready tickets.

  machine limit [<n>] [--json]
                              Print the machine agent limit: how many build and review jobs may run
                              at once across every board on this machine, at most its CPU count,
                              which it is when none was set. With <n>, store a new one in the
                              monitor folder, read by every Hephaestus at its next launch; one above
                              the CPU count is refused machine-agent-limit-above-cpus at exit 1
                              with nothing written, and lowering it stops no job in flight. --json
                              prints {answerVersion, limit, ceiling, agentsInFlight}, or after a set
                              {answerVersion, outcome, limit, ceiling}.

  gate list [--json]          The board's gate pipeline, stored in <data>/pipeline.json beside
                              progress.json and never tracked. Read-only, no lock. --json prints
                              {pipelineIsSet, contentHash, phaseHashes, prepare, gates}, and
                              version, phases, review, airlock, constitution, agents, approvals and
                              reach when stored; with no pipeline pipelineIsSet is false, both hashes
                              null and both lists empty. A malformed or older file is refused at
                              exit 1.

  gate prepare <name> [--in <folder>] [--json] -- <command>
                              Set the prepare step <name>, run before a gate in a fresh worktree;
                              a step of the same name is replaced where it stands. --in runs it in
                              a folder, as a gate's --in names one. One log line.
  gate add <name> [--fix "<command>"] [--in <folder>] [--defined-by <pattern>]
           [--network <domain>] [--writes <path>] [--forge-only] [--phases <phase>,…]
           [--json] -- <command>
                              Add the gate <name>, run last, or replace one of the same name where
                              it stands; --defined-by, --network and --writes repeat. --phases
                              (build, review, merge) sets the phases it runs in: a new gate runs in
                              every phase without it, a replaced one keeps its phases.
                              --in runs it in a folder of the project in the worktree, or of the
                              repository when the folder starts with /; --defined-by
                              names the files that define it (git pathspec-style patterns), which
                              a job may change only when its ticket body names them; --writes a
                              folder it may write besides the worktree and temp. One log line.
                              On this machine a line is written in ${LINE_GRAMMAR_WORDING[lineGrammar]}.
  gate order build|review|merge <name>… [--json]
                              Set the run order of the gates the phase runs: name each once.
  gate none [--json]          Store an empty gate list on purpose: the board counts it as set, so
                              no checks-not-set decision opens, and a landing runs no gate.
  gate remove <name> [--json] Remove the gate <name>; an unknown one is refused at exit 1.
                              Every write takes the lock, is accepted with tickets in flight, and
                              refuses a malformed or older pipeline.json at exit 1 rather than
                              overwrite it. Each row records its gate phase and that phase's hash
                              at its next gate run. --json prints {pipeline, contentHash,
                              phaseHashes}.
  gate approval tickets|merge on|off [--json]
                              Switch ticket review, stored as approvals.tickets. On, as with no
                              key, a filer's closed draft waits in ready-for-review for User's
                              ticket ready; off, it becomes committed at once. One log line.
                              Refused at exit 1 while no pipeline is stored: set the gates first.
                              Merge approval, approvals.merge, is off without the key; on, a
                              reviewed ticket waits for merge until User's merge accept.
  gate assistant on|off [--json]
                              Switch the board's Assistant, stored as assistant, off without
                              the key. On, a pass boots one; off, a live one finishes its turn
                              and ends, and every open incident takes its default. One log line.
                              Refused at exit 1 while no pipeline is stored: set the gates first.
  gate reach <path>…|none [--json]
                              Set the repository paths besides the project that a ticket may
                              change, stored as reach: each starts with /, as /bun.lock or
                              /packages/shared; none clears them. One log line. Refused at exit 1
                              while no pipeline is stored: set the gates first.

  range --from <when>         The stored default axis of the chart; a bound may also be \`start\`, the
                              earliest visible row. A relative bound is stored as
        --to <when>           written, so \`--from -2h\` keeps meaning "the last two hours" on every
        [--tick <15m|1h|1d>]  refresh. A pair that is not in order is refused at exit 1 when both
                              are timestamps or both are relative to now; a pair naming \`start\`
                              or mixing the two is not judged. One log line per stored range.
                              The page's own range menu overrides this per browser.
  range --auto                Reset the axis to the automatic span; it takes no --from, --to or
                              --tick, and any of them beside it is refused at exit 1.

  namespace [<name>] [--json] Print the board's branch namespace. With <name>, store it as
                              branchNamespace: the board's ticket branches become
                              ${PRODUCT_NAMES.PROGRAM}/<name>/ticket-<id> and its group branches
                              ${PRODUCT_NAMES.PROGRAM}/<name>/group-<group>, so boards that share a repository
                              never name the same branch. Lower-case letters, digits and inner
                              dashes. Refused at exit 1 with nothing written while a Hephaestus
                              serves the board, a job that works on a branch is on it (the
                              Assistant and the product owner work on none), a branch is left
                              under its current names, a branch blocks the new names, or the
                              namespace holds another board's branches or another tracker of the
                              repository lists it. The board's entry in the repository's tracker
                              list follows the name. One log line. --json prints
                              {branchNamespace}, null for bare names.

  crash-log [<number>] [--json]
                              Print the crash log of that number, or the newest: the component,
                              the start's classification and its evidence, the error, the jobs,
                              then the log tail. Reads files only, with Hephaestus up or down.
                              Refused no-crash-log at exit 1 when there is none.

  version [--json]            Print the code version on disk and the install version:
                              {answerVersion, codeVersion, installVersion, contracts,
                              talosProtocolVersion, monitorFolder}, \`contracts\` Hephaestus
                              API's contracts this program serves, as \`GET /api/identity\`
                              names them, and the Talos protocol version it starts. Read-only.

  start [--repository <path>] [--port <n>] [--started-by user|login-item] [--json]
                              Start the board's one Hephaestus detached; with one live, start
                              nothing. It returns only once Hephaestus's API answers. --json
                              prints {answerVersion, started, url, generation, trackerId,
                              codeVersion, installVersion, contracts}. Hephaestus serves on
                              127.0.0.1 and logs to \`hephaestus.log\`: it creates the Baton
                              \`hephaestus/baton-<n>.json\` and writes the API token to the owner-only
                              folder under the monitor folder in the user's home. The port derives
                              from the tracker id, moving upward past one in use; --port binds the
                              one given, 0 any free one. --repository starts Hephaestus of that
                              repository, not of the working directory. --started-by names who
                              started it, user when absent: after a crash only a start by the user
                              serves, and any other is refused forge-off-after-crash at exit 1.
  start --foreground [--repository <path>] [--port <n>] [--started-by user|login-item]
                              The serving process itself, which the detached start and the Linux
                              login item run: it logs to standard error too, prints its URL and
                              serves until stopped. A live Hephaestus refuses it
                              (hephaestus-already-running, with its URL) at exit 1, as does a starter
                              that lost the race (hephaestus-contended); a Hephaestus whose Baton a
                              newer one overtook stops baton-taken at exit 2.
  start --successor-of <generation> [--port <n>]
                              The successor's side of \`restart\`'s Baton pass, which only the
                              live Hephaestus starts.

  stop [--now] [--json]       Stop the live Hephaestus through its API, else end the process its
                              Baton names, by force where the platform cannot ask, and record the
                              stop after a forced end; Talos and its children are never touched.
                              --now also stops line children, through the API only. --json prints
                              {answerVersion, outcome}, with \`ending\` when Hephaestus ended
                              before it finished its stop.

  restart [--now] [--json]    Hand the board to the code on disk: a successor proves it, then takes
                              over and regroups around Talos; no agent is touched. A failed
                              Baton pass leaves the old Hephaestus driving with a warning and exits 1
                              (baton-pass-failed).

  talos-restart [--json]      Ask the live Hephaestus to restart Talos cleanly: each agent stops at
                              the end of its turn, the right Talos starts, and the paused agents
                              resume by themselves. {outcome}: done, nothing-to-do (no Talos took
                              it) or not-taken (no live Hephaestus took it). Refused under a job.

  pause [--json]              Store \`hephaestusState\` \`paused\`: no new jobs while paused. Works
                              with Hephaestus up or down.

  unpause [--json]            Undo a pause: store \`hephaestusState\` \`running\`. \`resume\` is
                              another verb, which resumes interrupted work.

  login-item add|remove|status [--repository <path>] [--json]
                              The item that starts this board's Hephaestus when the user logs in, as
                              \`setup --login-item\` writes it, under the label
                              \`${PRODUCT_NAMES.LOGIN_ITEM_LABEL}.<trackerId>\`, so every board has its own.
                              --json prints {answerVersion, outcome, state, label, location,
                              repository}: state \`present\` or \`absent\` after the step, outcome
                              null for status. Refused login-item-unavailable where no item could
                              run, and login-item-not-changed where the system refused the change.

  merges [--json]             The merge queue: each held slot {target, jobId, ticketIds, phase,
                              targetTip, branchTip}, then each queued ticket {ticketId, target,
                              priority, queuedAt} by priority, then queue order. Read-only,
                              no lock.
  merge accept <id> [--json]  With merge approval on: accept a ticket waiting for merge, so its
                              Airlock may land it (mergeAccepted). git merge-tree predicts its
                              merge into its target's tip in the hold; refused at exit 1
                              merge-accept-would-conflict or merge-accept-prediction-failed
                              unless clean, merge-approval-off, or merge-accept-of-a-ticket-
                              not-waiting. One log line.
  merge update <id> [--json]  With merge approval on: merge the ticket's target into its worktree,
                              with no Airlock. Clean, its gates run again on the next pass; a
                              conflict is aborted and takes its review done away, so its
                              reviewer takes it back (merge-updated). Refused at exit 1
                              merge-approval-off, merge-update-of-a-ticket-not-waiting or
                              merge-update-failed.

  worktree repair <id> --step <step> [--incident <I>] [--json]
                              Repair the ticket's worktree in the hold (worktree-repaired), the
                              step one of prune, reinstall, recreate, unlock: git worktree prune;
                              reinstall on the next launch; recreate from the branch
                              after saving its changes to <data>/jobs/<J>/recreate-<n>.patch
                              (worktree-has-uncommitted-work when they cannot be saved); remove a
                              stale index.lock. recreate and unlock are refused worktree-in-use
                              while a job is on the ticket.
  gate retry <J> [--incident <I>] [--json]
                              Settle J's gate-cannot-run or sandbox-unavailable incident, so the
                              merged tree is gated again or the ticket's next attempt launches;
                              nothing to do without one.
                              Without --incident, worktree repair and gate retry take the one open
                              incident that allows them, or apply as a plain control.

  decisions [--json]          The open decisions for User, in opening order: each {id, kind,
                              ticketIds, jobId, askedBy, requestId, questions, context, openedAt},
                              its options lettered a, b, c as decide takes them. Read-only, no lock.

  decide <decision> <letters>... | -- <text> [--json]
                              Answer an open decision, with Hephaestus up or down: one choice of
                              option letters per question (b; ac for a multi-select), or free text
                              after -- for a one-question decision (decision-has-several-questions
                              otherwise). The first answer wins (decision-already-answered); it is
                              stored as {question: answer}, logged decision-answered, and
                              Hephaestus delivers it to the asking session.
  question options <J> -- <json> [--json]
                              Notes for the options of the question job <J> asks next, as JSON
                              {question, options: [{label, touches, tradeOff, acceptanceEffect}]}:
                              the paths an option changes, what User gets and loses, and its
                              effect on the Acceptance. Kept on the job; the decision the question
                              opens takes them by question text and label, and a later note for
                              the same question replaces it (question-options-malformed for a
                              note that is not well formed). Under the asking job it names no job.
  need declare <J> "<title>" --entity <key> --body <text> | --body-file <path> [--json]
                              A build job's need for another entity: a title, and a body with a
                              numbered ## Acceptance that holds the intended use and a ## Brief.
                              Kept on the board for Hephaestus to file as that entity's ticket;
                              the same entity and title again replaces the body. Refused
                              need-outside-an-entity-build (not a build job of an entity),
                              need-entity-unknown, need-of-own-entity, need-incomplete and
                              need-limit-reached. Under the declaring job it names no job.

  incidents [--json]          The open incidents for the Assistant, in opening order,
                              each with its facts, the moves its kind allows and its default.
                              Read-only, no lock.
  incident answer <I> -- <text> [--json]
                              Answer a system-question or malformed-ticket: its waiting session
                              takes the answer, and a malformed ticket's also goes under the
                              ticket's ## Questions (incident-handled, incident-answered).
  incident note <I> -- <text> [--json]
                              Record a finding (incident-noted); the incident stays open.
  incident escalate <I> [--json]
                              Put the agent's own questions to User unchanged, as an
                              agent-question decision (incident-escalated).
                              Every move naming an incident, here or with --incident, is refused
                              unless the incident is open and its kind allows the move; it marks
                              the incident handled in the same hold (incident-handled).

  jobs [--json]               The live jobs, one line each (id, kind and role, state, tickets,
                              attempt, child instance, a stop asked), then Hephaestus, paused or not,
                              agents against the limit, open decisions and incidents, and each
                              incident that took its default since Hephaestus started, a warning.
                              Read-only.
  job show <J> [--json]       The job's record, or what the log holds of a finished one.
  job attach <J> [--json]     Replay every child instance's event log, then follow the newest while
                              the job is on the board (--json replays only). Both read-only.
  job message <J> [--incident <I>] -- <text> [--json]
                              A chat turn Hephaestus writes to the session (job-messaged); a closed
                              product owner is reopened, resuming its session (job-reopened), and
                              any other finished job is refused job-finished. Under an
                              incident, refused job-awaits-user-answer for a job waiting on User or
                              whose ticket has an open agent-question, and job-is-product-owner.
  job fresh <J> [--incident <I>] [--json]
  job wind-down|stop <J> [--json]
                              Logged job-stop-requested with the mode. stop and wind-down hold the
                              ticket "stopped by User (J<n>)" or "wound down by User (J<n>)" in the
                              same hold, with Hephaestus up or down; a stopped product owner is
                              finished and its open decisions withdrawn. fresh stops the job so the
                              next attempt starts on its worktree (job-has-no-ticket otherwise).
  job stop --all [--wind-down] [--json]
                              pause, then stop or wind down every build, review and
                              product-owner job.

  resume <J>|<T> [--json]     Resume interrupted work: User's instruction for the job, or for the
                              ticket's interrupted job and its interrupted: hold, which is lifted
                              with no fresh attempt (ticket-interrupted-hold-lifted). Recorded with
                              Hephaestus up or down; the next pass resumes the job under every
                              hold a resume obeys, and an instruction gives the job its automatic
                              restarts back. Refused job-not-interrupted, ticket-not-interrupted.
  resume --all [--json]       Resume every job that waits for an instruction and lift every
                              interrupted: hold. Nothing waiting is nothing to do, exit 0.
  resume --network-outage [--json]
                              Resume every job that ended on a network outage. Nothing waiting is
                              nothing to do, exit 0.

  intake -- <text> [--json]   Record a product-owner job (no ticket, no build slot) Hephaestus
                              launches in <worktrees>/sessions/<J>/ with /${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} <text>;
                              several may run at once, and job message chats with one.
  intake close <J> [--set <id,id>]... [--json]
                              Close its input (job-not-intake for another kind of job) and submit
                              the drafts its intake filed, as ticket submit does, refused as it is
                              (\`ticket-without-entity\`, \`work-outside-entity\`); Hephaestus
                              ends the job once its session ends. --set is stored on the job and
                              decides nothing. Under the product owner's own job it names no job.
  intake title <J> -- <title> [--json]
                              Logged intake-titled: a short title for the intake, kept on the job;
                              a later title replaces it (job-not-intake for another kind of job).
                              Under the product owner's own job it names no job.

  advise [--json]             Open an advise record on the stored pipeline and record its pipeline
                              agent job (no ticket, no build slot), which Hephaestus launches as
                              a session on a main-line snapshot: it reads the repository and the
                              gate history, never writes it, and proposes edits of the record's
                              draft. Nothing starts one by itself; job stop closes it and job
                              message opens it again.

  pipeline setup [--billing subscription|api] [--max-budget-usd <n>] [--replace-unreadable] [--json]
  pipeline update [--json]
  pipeline billing <S> subscription|api [--max-budget-usd <n>] [--json]
  pipeline continue <S> <step> [--json]
  pipeline answer <S> <Q> <letters>... | -- <text> [--json]
  pipeline constitution <S> --revision <n> [--file <path>|-] [--sources <source>,…|none] [--json]
  pipeline edit <S> --revision <n> --set <field>=<JSON value>... [--json]
  pipeline undo <S> <E> [--json]
  pipeline discard <S> [--json]
  pipeline check <S> [--json]
  pipeline start-over <S> [--json]
  pipeline resume <S> [--json]
  pipeline apply <S> --revision <n> [--resume] [--json]
  pipeline apply-cancel <S> [--json]
                              The pipeline setup record, <data>/pipeline-setup.json, one open at a
                              time (setup-in-progress): setup opens a first one and starts its
                              pipeline agent (--replace-unreadable lets its Apply write over an
                              unreadable pipeline.json), update one on the stored pipeline.
                              continue completes the current step (billing, research,
                              constitution, design); answer answers a setup question;
                              constitution stores the whole text from a file or standard input and
                              the SOURCES ticks (contributing, research, installed-default); edit
                              sets draft fields in one move, --set repeating (gate:<name>,
                              phase-order:<phase>, prepare:<name>, prepare-order, role:<role>,
                              review, airlock, approval:<approval>, constitution), each to a JSON
                              value, null removing one, and the draft must stay a valid
                              pipeline.json; undo writes an edit's base value back; discard drops
                              every proposed change; check has Hephaestus run the gates the
                              draft changes or adds two times in a fresh worktree of main, with
                              no writes folder granted, and send the result to the agent;
                              start-over removes the record and stops its agent; resume opens the
                              agent again, and when main moved it moves the snapshot to main's
                              tip and sends research to a recheck. A stale --revision is refused
                              at exit 1. An answer, constitution, edit, undo, discard, check or
                              continue also messages the pipeline agent, and opens it
                              again when a stop closed it. apply stores the draft as pipeline.json
                              once main holds its constitution as CONSTITUTION.md (--resume also
                              resumes the board), and closes the record; until then the request
                              waits for the constitution commit, and apply-cancel clears it.
  pipeline profile <gate> build|review|merge [<S>] [--json]
  pipeline profile-stop <P> [--json]
                              Profile one gate in one phase, once, from setup <S>'s draft or with
                              no <S> the stored pipeline: Hephaestus runs the prepare steps and
                              the gate in a fresh worktree of main, with no writes folder granted,
                              and records the time in <data>/gate-profiles.json. It only informs:
                              no green, no gate-ran. gate-profile-running while that gate and
                              phase have a run not ended. profile-stop ends the run, no result.

  await [--json] [--after <n>]
                              Wait until the log holds a decision-opened or incident-escalated
                              record past position <n> (the log's length when absent), then print
                              them with their positions, and the position to wait after next.

  clear [--all] [--yes]       Throw away every task row and the log and restart the clock, keeping
                              the tickets: each surviving ticket is given a fresh row seeded from
                              its own frontmatter, except a low one with no row. Row ids are not reused. --all deletes the
                              tickets, every epic and every stored picture too and restarts the ticket ids at 001. --yes skips the
                              confirmation, and is required when standard input is not a terminal.

  help                        This command reference.
`;
}
