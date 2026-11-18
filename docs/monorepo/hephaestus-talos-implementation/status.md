# Run status: Hephaestus, Talos and Gaia

The orchestrator's memory of the run (see `orchestrator.md`). Integration branch: `hephaestus-talos`, cut from `main` at
`e9b5d057` on 2026-11-18. States: `waiting`, `running`, `landed`, `blocked`, `owner`.

## Gates

| Gate | State | Note |
| --- | --- | --- |
| G0 | passed | Owner said go on 2026-11-18; branch `hephaestus-talos` |
| G1 | owner | WP0.3: the owner records a session that ends on a network outage |
| G2 | owner | Round 1 answered 2026-11-18 (11 items, below); the rest reworked into abstract questions |
| G3 | waiting | WP1.2 |
| G4 | waiting | End of WP2.13 |
| G5 | waiting | Before WP6.4 |
| G6 | waiting | Before and after stage 9 |
| G7 | waiting | End of the run |

## Packages

| Group | Package | State | Commit | Note |
| --- | --- | --- | --- | --- |
| 0-A | Stale-spec fix | landed | 5b68d0ad | Owner's word: CrashMatrix.integration :914 holds its snapshot by an open setup record; JobResumption.integration :204 expects the last-worker rule |
| 0-A | WP0.1 | landed | 9038016f | Design in line with the traces. Left stale, outside its scope: `hephaestus-talos.html:435` and the design's section 11 stage-3 row still call the stop/Baton record missing |
| 0-A | WP0.2 | landed | (no commit) | Green baseline at `5b68d0ad` (main `e9b5d057` plus the stale-spec fix): 9 files, 235 pass, 0 fail. 12 resume-by-itself cases listed, incl. the 4 the stage file missed. Evidence: main checkout `.claude/.evidence/hephaestus-talos/stage-0/recovery-baseline.txt` |
| 0-A | WP0.3 | owner | | Gate G1: the owner records it |
| 0-B | WP0.4 | waiting | | |
| 0-C | WP0.5 | waiting | | |
| 0-D | WP1.1 | waiting | | |
| 0-E | WP1.2 | waiting | | |
| 0-F | Refresh the plan | landed | | Ran before 0-A on the owner's word; stage files now checked against `0a648b2b`. Runs again only if WP1.2 lands another branch |
| 0-G | WP1.3 | waiting | | |
| 2-A | WP2.1 | waiting | | |
| 2-A | WP2.2 | waiting | | |
| 2-A | WP2.3 | waiting | | |
| 2-B | WP2.4 | waiting | | |
| 2-C | WP2.5 | waiting | | |
| 2-C | WP2.6 | waiting | | |
| 2-C | WP2.11 | waiting | | |
| 2-D | WP2.7 | waiting | | |
| 2-E | WP2.8 | waiting | | |
| 2-F | WP2.9 | waiting | | |
| 2-F | WP2.10 | waiting | | |
| 2-G | WP2.12 | waiting | | |
| 2-H | WP2.13 | waiting | | |
| 2-I | WP2.14 | waiting | | |
| 2-J | WP2.15 | waiting | | |
| 2-K | WP2.16 | waiting | | |
| 2-L | WP2.17 | waiting | | |
| 2-M | WP2.18 | waiting | | |
| 3-A | WP3.1 | waiting | | |
| 3-A | WP3.4 | waiting | | |
| 3-A | WP3.5 | waiting | | |
| 3-B | WP3.2 | waiting | | |
| 3-B | WP3.6 | waiting | | |
| 3-C | WP3.3 | waiting | | |
| 3-C | WP3.7 | waiting | | |
| 3-D | WP3.8 | waiting | | |
| 3-E | WP3.9 | waiting | | |
| 3-F | WP3.10 | waiting | | |
| 3-G | WP3.11 | waiting | | |
| 3-G | WP3.13 | waiting | | |
| 3-H | WP3.12 | waiting | | |
| 3-I | WP3.14 | waiting | | |
| 4-A | WP4.1 | waiting | | |
| 4-B | WP4.2 | waiting | | |
| 4-C | WP4.3 | waiting | | |
| 4-D | WP4.4 | waiting | | |
| 4-E | WP4.5 | waiting | | |
| 4-E | WP4.6 | waiting | | |
| 4-E | WP4.7 | waiting | | |
| 4-F | WP4.8 | waiting | | |
| 4-F | WP4.9 | waiting | | |
| 5-A | WP5.1 | waiting | | |
| 5-B | WP5.2 | waiting | | |
| 5-C | WP5.3 | waiting | | |
| 5-D | WP5.4 | waiting | | |
| 5-D | WP5.5 | waiting | | |
| 5-D | WP5.6 | waiting | | |
| 5-E | WP5.7 | waiting | | |
| 5-F | WP5.8 | waiting | | |
| 5-G | WP5.9 | waiting | | |
| 5-G | WP5.10 | waiting | | |
| 5-H | WP5.11 | waiting | | |
| 5-H | WP5.12 | waiting | | |
| 6-A | WP6.1 | waiting | | |
| 6-B | WP6.2 | waiting | | |
| 6-B | WP7.2 | waiting | | |
| 6-C | WP6.3 | waiting | | |
| 6-C | WP6.4 | waiting | | |
| 6-D | WP6.5 | waiting | | |
| 6-E | WP6.6 | waiting | | |
| 6-F | WP6.7 | waiting | | |
| 6-G | WP6.8 | waiting | | |
| 6-H | WP6.9 | waiting | | |
| 6-I | WP6.10 | waiting | | |
| 6-I | WP6.11 | waiting | | |
| 6-I | WP6.12 | waiting | | |
| 6-I | WP6.18 | waiting | | |
| 6-I | WP6.19 | waiting | | |
| 6-I | WP7.1 | waiting | | |
| 6-J | WP6.13 | waiting | | |
| 6-J | WP6.14 | waiting | | |
| 6-J | WP6.15 | waiting | | |
| 6-J | WP6.16 | waiting | | |
| 6-J | WP6.17 | waiting | | |
| 6-J | WP6.20 | waiting | | |
| 6-K | WP6.21 | waiting | | |
| 6-L | WP6.22 | waiting | | |
| 6-M | WP6.23 | waiting | | |
| 8-A | WP8.1 | waiting | | |
| 8-A | WP8.3 | waiting | | |
| 8-B | WP8.2 | waiting | | |
| 8-C | WP8.4 | waiting | | |
| 8-C | WP8.5 | waiting | | |
| 8-D | WP8.6 | waiting | | |
| 8-E | WP8.7 | waiting | | |
| 8-F | WP8.8 | waiting | | |
| 8-G | WP8.9 | waiting | | |
| 8-H | WP8.10 | waiting | | |
| 8-I | WP8.11 | waiting | | |
| 8-I | WP8.12 | waiting | | |
| 9-A | WP9.1 | waiting | | |
| 9-A | WP9.2 | waiting | | |
| 9-A | WP9.3 | waiting | | |
| 9-A | WP9.4 | waiting | | |
| 9-A | WP9.5 | waiting | | |

## Where the code differed from a stage file

The refresh (0-F) corrected all seven stage files against `0a648b2b`. Changes later packages depend on:

- WP0.2 baselines three more resume specs (`JobResumption.entities`, `.adapt`, `.airlockOwner`); WP0.3/WP0.4 name the recorded Claude Code version (now 2.1.327) and add `retry_wait_ms`.
- WP1.2 is smaller: the edits are committed and `entities/integration` landed; it removes the branch and its worktree.
- WP2.2 moves to `FakeAgentAdapter.ts` behind `FAKE_AGENT_NETWORK_OUTAGE`; WP2.5's `ChildRecord` gains `workingDirectory` and a `ClientEntry` type; forge's system version raise is 1.19.
- WP4.2 moves 548 importers (1,332 import lines), not 438.
- Stages 0, 4 and 6 disagree on where the refusal wording lives (`OperationRefusal.ts`, `OperationRefusalWordingUtil.ts` and kin); the owner settles it at G2.

## The two red recovery specs (WP0.2)

Both were already red at `3e6cb660`; the default suite skips `*.integration.spec.ts`, so no gate ran them.

- `CrashMatrix.integration.spec.ts:914`: red since `73417603` (pipeline agent as a session). `removeUnheldSnapshots`
  (`PipelineAgentSessions.ts:294-312`, called from `DrivePass.ts:1457`) removes the spec's planted, unheld
  `pipeline-agent/J9`, as `docs/cli.md:1602-1607` requires; the spec's fixture predates that. Fix in the spec: plant
  a held snapshot (named after an open setup record), keeping the only coverage of `Regrouping.ts:59`'s exemption.
- `JobResumption.integration.spec.ts:204-209`: red since `e883aebd` (Airlock work goes to the ticket's last worker).
  The spec still asserts the retired role-based rule; a builder Airlock agent after an ended review cannot occur
  (`Airlocks.ts:453-456`). Fix in the spec: replace the builder half with a last-worker case, retitle the test and
  its header comment (`:5-6`).

No product change and no `bun run record` is needed for either.

## Owner answers, round 1 (2026-11-18)

- S0-1.1 (network outage): Gaia alerts the user; the user resumes, and one click resumes every job that ended on a network failure, across forges.
- S0-1.2 (install line time bound): yes, 15 minutes; also record each line's duration so it can be optimised, shown in the pipeline overview.
- S0-1.5, S0-1.8, S0-1.9, S0-1.10, S0-1.11, S2.3, S2.4: the recommended default.
- S0-1.6 (live trackers): drop every in-flight ticket.
- S0-1.7 (clock-rule edits): committed (`e9b5d057`); the owner hands those rule edits to the run from here on.
- Guidance: code that belongs to an app stays in that app; only code shared across apps is hoisted to a package, by the
  coding conventions' hoisting rules. Remaining decisions are to be posed abstractly, in the concepts the plan introduces.

## Owner questions the refresh raised (for gate G2; also on `owner-decisions.html` as R.1 to R.14)

1. Where forge's refusal wording that the Bridge now reaches lives (`src/shared/OperationRefusal.ts`, three `src/shared/@types` files, `OperationRefusalWordingUtil.ts`, `StatusWordingUtil.ts`, `TicketPhraseUtil.ts`, `ExecutableRefusalCause`, `ExecutableResolver.ts`). Proposed default: `packages/board-readings`, moved in stage 4.
2. Six shared constants the Bridge reaches (`ProductNames`, `RootOverrideVariable`, `DispatchProtocol`, `OverseerLimits`, `OverseerApiContracts`, `TimestampSlices`) have no stage-4 home. Proposed default: `packages/board-readings`.
3. Gaia's `SUPPORTED_FORGE_VERSION` is 1.1 while forge is 1.18: catch up before stage 6, or stay until then?
4. `forge-contracts` is still package version 1.0.0: may WP4.4 raise it to 1.1.0 as written, or align it with the system minors first?
5. Does the vocabulary-package option (owner item 1) stay open now that it would have to take `BoardRefusal.ts` and eight utils?
6. Stage 3, item 9: may resume lift an `interrupted:merge` hold without a fresh attempt, keeping the failed-pass counts? Default: `Board.liftInterruptedHold`, counts kept.
7. Stage 5: does `reads.readPipeline()` answer the stored pipeline (default) or the reading `writeTracker` opens the Board on?
8. Stage 2: who records the fake agent's network-outage scenario, and when? Only stage 2's verification step 7 waits on it.
9. Stage 2: does Flint's `watcher-spark` attendant keep its name in stage 2?
10. Stage 2: may Talos's child record keep the launch's `workingDirectory`, or should the Overseer keep that in a job-folder file?
11. Stage 8: should `gate assistant` refuse with `assistant-without-pipeline` when no pipeline is stored, as `gate approval` does?
12. Stage 9, item 14: `pipeline.json` is read in versions 2, 3 and 4; does "one format, number 5, read and written alone" still hold?
13. Stage 9, item 17: does it also cover the constitution preview (the board's and each entity's become Markdown Gaia renders)?
14. Stage 8, item 10: `.readme-graphics/render-readme.js` imports `marked`; keeping that folder blocks WP8.8 from dropping `marked`.
