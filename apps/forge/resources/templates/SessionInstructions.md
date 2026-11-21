## Progress tracking with {{program}}

This repository tracks its work with the `{{program}}` CLI. The tracker lives in the git-ignored `{{dataFolder}}/`
folder of the project's folder, the repository root or the one folder of the repository the tracker governs, and is
shared by every worktree of it. A Hephaestus, started with `{{program}} start`,
drives every ticket through its build, review and merge; no session drives the board by hand.

- Run `{{program}} status --json` at the start of a session to find out what is in flight: its `jobs`, the
  `decisions` waiting for User and the open `incidents`. Its `hephaestus` block says whether Hephaestus is up.
  Hephaestus's own state adds `mergeQueue` and `usage`.
- When User asks to file, report or track a ticket, bug or research question, load the `{{productOwnerSkill}}`
  skill. Only when User asks this session to run the board, load `{{orchestrateSkill}}`; it loads
  `{{productOwnerSkill}}` itself. Filing or editing a ticket does not make a session the orchestrator.
- A ticket is filed as a draft and builds only once `{{program}} ticket ready` readies it, which needs a numbered
  `## Acceptance` and a `## Brief` holding a non-blank line: the Brief is its builder's brief.
- A worker's finding is a low ticket that waits for the ticket it was found on, in the group of that ticket. When
  ticket review is off, it is committed at once. When ticket review is on, it waits for User in ready-for-review.
- Work User finished and landed outside Hephaestus is recorded with `{{program}} ticket deliver <id> --by-hand`,
  refused while a Hephaestus is live; no other lifecycle move is made by hand.
- `{{dataFolder}}/reference.md` holds a ticket's fields, the moves and the exit codes; `{{program}} help` holds
  every command.
- Record milestones with `{{program}} log "<what happened>"`; `--at -5m` backfills a stamp nobody registered at the
  time.
- Never edit a file under `{{dataFolder}}`. Change a ticket's title or body with `{{program}} ticket edit`, and each
  other field with its own `ticket` verb; the board refuses what it does not allow.
