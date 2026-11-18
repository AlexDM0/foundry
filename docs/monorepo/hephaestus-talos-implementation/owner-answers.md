# Owner answers and the approach they set

The owner's answers of 2026-11-18, and what the run decided from them. This file is the source for the design's new
decisions and for every stage file; where a stage file disagrees with it, this file is right.

## Ground rules

- The owner answers how the system behaves. The run decides the migration: where code lives, version numbers, stored
  formats, recordings, rule files and branches. A stage file's "Needs the owner" holds only a question about
  behaviour a user would notice, posed in the system's concepts, or an act only the owner can do.
- The run may change anything in this monorepo, the rule files a person owned before included. No approval gate for a
  rule file remains (gate G5 and the rule-file half of gate G6 go).
- Nothing stays compatible: no older board, stored format, verb, link form or client is read or kept.
- The coding conventions (`~/coding-conventions-new.md`) hold. Code that belongs to an app stays in that app. Code is
  hoisted to `packages/` only when two apps really consume it, and is generalized first.

## The monorepo

```
apps/forge/   Hephaestus, Talos, the CLI, the read and command API; the whole tracker model, the readings, the wording
apps/gaia/    the one interface: server (src/) and page (page/)
              page/lib/design-system, page/lib/flint, page/lib/brand: libraries, each behind its interface file
              page/board/: the board's views, moved from forge's Bridge
packages/forge-contracts/   the wire: the documents forge serves and the commands Gaia sends
packages/system-versions/   version comparison, for both apps and the contract
```

- forge and Gaia share only `forge-contracts` (and `system-versions`). Neither app imports the other.
- No `tracker-model` package and no `board-readings` package. The model, its spec helpers, the readings
  (`src/shared/monitor`) and the refusal wording stay in `apps/forge`.
- The contract's types stand on their own: they import nothing from forge's model. Forge maps its model into the
  contract's documents in its own adapters, typed, and maps the contract's commands into its model.
- Forge serves finished facts in the board document instead of the views recomputing them with forge's code:
  attention entries with a typed target, worded notices and warnings, today's figures, open decisions in answering
  order, the moves and controls each ticket and job offers, resolved priority, stop holds, repeat-review facts,
  effective pipelines per entity, limits and defaults.
- Gaia maps each forge document into its own model at its boundary (`src/adapters/forge-api`), as its rules already
  say, and serves its page its own contract. The page imports no forge code and no `forge-contracts` type.
- `design-system`, `flint` and `brand` leave `packages/` once the Bridge is deleted, when Gaia is their only consumer.
  Each becomes a top-level folder of Gaia's page `lib/`, with no `package.json`, kept independent of the others and of
  Gaia's features, with its own specs and description. Code outside a library imports only that library's interface
  file; inside a library a file imports exactly what it needs, with no barrels. A guard holds this.

## Answers about behaviour

1. **After an agent ends on a network outage** (a provider overload after the retries are spent included): the job
   waits and is never counted as a failure or a crash. Gaia alerts the user. One control in Gaia resumes every job that
   ended this way, across all forges; it is always clickable, and a job that ends on an outage again waits again.
2. **An install line** is stopped after 15 minutes of real time and ends as a bounded gate does. Every line's run time
   is recorded, in the measure the bound uses (a sleep does not count), and shown in the pipeline overview.
3. **The gate's 15-minute bound** does not count a sleep.
4. **A hung Hephaestus counts as gone.** After a minute without progress Talos stops the board's agents at the end of
   their turn; they wait for the user's resume, and Gaia shows that the forge stopped supervising them.
5. **A crash suspected before a reboot keeps the forge off,** as after a crash: Gaia alerts with the crash log, and
   nothing runs until the user starts the forge.
6. **A user's resume gives an agent its two automatic restarts back.**
7. **The words.** `resume` restarts interrupted work (one job, one ticket, everything, or everything that ended on a
   network outage). Undoing a pause is `unpause`.
8. **No `hephaestus` verb, and no `oversee` verb.** `forge start` starts Hephaestus; the other lifecycle verbs sit
   beside it at the top level (`stop`, `restart`, `status`, `pause`, `unpause`). The run settles the exact set in
   stage 9; the name Hephaestus is the component's, not a word the user types.
9. **No forge command opens the board.** The user opens Gaia and picks the forge. `forge open` and the `progress.html`
   stub go, and forge's help and its agents' instructions stop naming a board page.
10. **The forge keeps an unfinished entities draft** in pipeline setup. It survives a reload, the pipeline agent sees
    it, and Continue and Apply are refused while any refusal stands. So no shared pipeline-editing package exists.
11. **A refusal reads as the forge's own sentence,** the one the command line prints. Forge serves each refusal as its
    reason code, its structured fields and its sentence; Gaia shows the sentence.
12. **Every in-flight ticket is dropped.** Both trackers stop and stay stopped until the boards are set up anew.

## The run's calls a user would notice

- An unexpected error in a pass is a crash on its first occurrence (design decision 14).
- The Assistant is a switch per board, off by default; switching it off stops a running Assistant at the end of its
  turn, and an incident it has not settled takes its default with the reason recorded and shown.
- Flint shows only inside a forge's board in Gaia, one per forge, with no brain.
- Hand-editing of ticket files ends; editing a ticket's description is a command.
- A question's recommendation stays visible: forge maps the vendor's mark into a field of the decision document.

## What only the owner can do

- G1: record the session that ends on a network outage (recordings A and B of WP0.3), and later the fake agent's
  outage scenario, since no session may start a vendor session.
- G3: stop both live trackers and remove their login items.
- G4: ask for `bun run verify:integration`.
- G6: the steps on the owner's machine around stage 9.
- G7: whether and how the integration branch reaches `main`.
