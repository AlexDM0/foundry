# The forge monorepo merge

The one checklist for moving forge and Gaia into forge's repository: every step in order, who does it and where it stands, and the
decisions still open. The reasoning behind the layout, Part B (forge in a part of a repository) and the release rules is the monorepo
design, `docs/monorepo/design.md`; where the two differ, this checklist holds.

Status as of 2026-11-21: landed. P0 to P8 are done and on `main`. No forge tracks this repository: the owner decided so on
2026-11-21, and the steps that set a tracker up in `apps/forge` and `apps/gaia`, with the root's gate scripts, are removed from this
checklist. The installed forge runs from a second clone, `~/.forge-program`. Merge bases:
forge `main` `db64ed0a`, Gaia `main` `1418f76`. Claude does every lane, in its own worktree `.claude/worktrees/<lane>` on branch
`monorepo/<lane>`, merged into `monorepo/integration` in the order its phase lists. Forge's `main` moves only in P7, by fast-forward,
after the owner's go. Nothing is pushed. Each phase ends with a gate in the integration worktree: a clean
`bun install --frozen-lockfile`, `bun run verify`, one `bun run verify -- --force`, the phase's own checks and a clean `git status`.
The gate records are in the main checkout's `.claude/.evidence/monorepo-migration/gates/`, which is ignored.

## What Gaia brought

| Path | What it is | Its README |
| --- | --- | --- |
| `apps/gaia/` | Gaia's whole app: `src/`, `page/`, `resources/`, `docs/`, its `bunfig.toml`, tsconfigs, lint config and `CLAUDE.md` | `apps/gaia/README.md` |
| a contributions package, merged in P3 | The eight components Gaia built that belong in the design system (`TextField`, `Checkbox`, `Figure`, `PageHead`, `FailedAction`, `PendingStep`, `ThemeCycleButton`, `DataTable`, with `ThemeChoice` and `ThemeCycleUtil`), now in `packages/design-system` | `packages/design-system/README.md` |
| `packages/brand/` | Forge's mark as a React component, its tokens in both themes, and the geometry a host's mark may draw alike; it names no Gaia | its `README.md` |
| `packages/forge-contracts/` | Forge's contract with any client: the Overseer's documents as types, forge's system versions, its compatibility registry with the raise-the-minimum report and guard, and the embed mode; it names no Gaia | its `README.md`; what Gaia asks of forge is `apps/gaia/docs/forge-requirements.md` |
| `packages/system-versions/` | The version model any server and client share and the compatibility registry's logic, naming no server | its `README.md` |
| `migration/`, implemented in P3 and deleted | Fourteen numbered patches against the design-system package for what Gaia needs of its components, each now built into the package | git history |

## Checklist

### P0. Settle and quiesce (Claude) — done

- [x] Baselines green in both repositories: forge 8,227 specs and 1,154 DOM specs, Gaia's verify.
- [x] Forge quiesced: no Overseer, no login item, no live job.
- [x] Worktrees `plugin-enable-command-62e489` and `gaia-read` removed; 72 merged branches deleted. Kept:
      `claude/project-thread-dw1bcu` (its five commits become part of monitor 3 in P4.0) and the worktree
      `graphite-orange-handoff-ebd9dc`, which the installed Gaia.app still builds its page from, until P7 step 11.
- [x] `.turbo/` in the main checkout's `.git/info/exclude`; `monorepo/integration` cut from `main`.

### P1. Restructure forge (Claude) — done, gate green

- [x] P1A: `apps/forge`, `packages/design-system`, `packages/flint`; the root workspace, Turborepo 2.11.10, the root scripts
      `typecheck`, `lint`, `verify` and `verify:<app>`.
- [x] L5 setup and runtime (`BunStep`, `CodeVersion` hashing the packages and the root `bun.lock`), L2 root guards, L3 lint per
      workspace, L4 a DOM spec runner per package, L7 forge's docs, L8 the Claude Code probes in a subfolder session.
- [x] L1 import graph: the graph reads the declared packages; the include-list contracts live in
      `packages/*/ProjectIncludeList.spec.ts`, and an import that leaves forge's program by a path or names a workspace package it does
      not declare has planted cases (lane `p2-import-graph-finish`).
- [x] L6 network guard: dropped. The installed forge runs from a second clone instead (owner decision of 2026-11-15).
- [x] The popover spec's timeout under concurrency: each failed poll of its `waitFor` printed a happy-dom node, walking the whole
      document (0.75 s alone, 5 s in the Bridge's tree), past the poll's 1 s bound under load. The DOM preloads of forge and the design
      system print a node as its opening tag.
- [x] Forge's DOM run hanging: Bun 1.4.2's isolated run, with its output on a pipe as under turbo, at times misses the exit of a
      leak check's git child (`git worktree list` at a file's preload, in one probe) and spins for good; the more output and load, the
      more often (under eight busy loops, 4 of 10 runs into a pipe hung, 0 of 6 into a file). `RunDomSpecs.ts` writes the run to a
      file and prints it at the end: 0 of 8 hung under the same load. The ordering edge stays until a gate measures the cold run
      without it.

### P2. Import Gaia (Claude) — done, gate green

- [x] P2A: Gaia's `main` merged with `--allow-unrelated-histories` (`e50aaacb`), its 279 commits and signatures intact; Gaia's workspaces
      take turbo's task names. One forced verify had two red specs: Gaia's `SingleReactPlugin` negative case (G-a removes the plugin) and
      the design-system popover flake (the P2 gate's).
- [x] G-a `p2-gaia-workspace`: Gaia declares `design-system` at `workspace:^`; the link-era workarounds go (`DesignSystemPeerPreload`,
      `preserveSymlinks`, `SingleReactPlugin`); a spec that every workspace package Gaia imports is declared.
- [x] G-b `p2-gaia-leak-check`: Gaia's leak check judges only `apps/gaia`.
- [x] G-c `p2-docs`: the root `CLAUDE.md` and `README.md`; `apps/gaia/CLAUDE.md` rules 1, 2, 9 and 11 for one repository; this design
      and this checklist under `docs/monorepo/`.
- [x] Gate P2: three cold `bun run verify -- --force` runs in a row, green each time (lower `--concurrency` if one flakes); the turbo
      isolation smoke (an `apps/gaia` edit changes only Gaia's hashes, a `packages/design-system` edit forge's and Gaia's, a
      `packages/forge-contracts` edit only Gaia's); `bun run versions:raise-minimum` still works from `apps/gaia`.

### P3. The design-system merge (Claude) — done, gate green

- [x] P3A: DS-A moves the contributions' parts into `packages/design-system`; DS-B tokens and state dots.
- [x] P3B: DS-C button, DS-D callout and confirm, DS-E1 counts and heads, DS-E2 meters and tags. Each patch is implemented in the
      package with the patch as its specification; only patch 01 applies with `git am`.
- [x] P3C: DS-F the package's README, constitution and exports (publishable at `0.2.0`); DS-G Gaia's call sites switch to
      `design-system/<Export>`.
- [x] P3D: the contributions package, `migration/` and `migration/*` in the root workspaces deleted.
- [x] Gate P3, run with Gate P4: three cold `bun run verify -- --force` runs in a row green; Storybook builds (363 entries); DS-G's
      visual pass is recorded, 68 shots in light and dark, with one difference open in the package (the confirm strip's small muted
      type reaches its choices); `grep -rn design-system-contributions` finds nothing in the tree.

### P4. Forge 1.0: contracts, brand, V1 to V6, V8, V9 (Claude) — done, gate green

- [x] P4.0: monitor 3 (with `flintBrain: null`) from `claude/project-thread-dw1bcu`; forge depends on `forge-contracts`,
      `system-versions` and `brand`.
- [x] P4A: V-server (`/api/versions`, `/api/v<n>/` paths), V-frame (frame hosts), V-bridge (the embed channel and forge's mark from
      `brand`). Both `?embedded=gaia` and `?embedded=dashboard`, and the dashboard's frame record, are dropped.
- [x] P4B (`p4-close`): `apps/forge/src/ClientNames.spec.ts` holds that no shipped source or doc of forge names Gaia, its word
      `fleet`, agent-dashboard or `?embedded=dashboard`; the docs speak of a monitor or a host. Gaia's `overseer-fetch-versions` is recorded
      from real forges under scratch homes: `versions-older` from this tree's forge as itself, `versions-ahead` and `versions-newer`
      through its test setting `FORGE_VERSIONS_ANSWER` (`1.3/1.0`, `2.1/2.0`), `versions-absent` from forge at `db64ed0a` in a detached
      worktree, since removed. `overseer-fetch-supported-forge` stays authored and awaits only G1 to G3.
- [x] **Forge 1.0 is `9ec2b85a`** (no tag, nothing pushed): `GET /api/versions` answers `1.0` with minimum `0.0`; it serves identity 1,
      summary 1, monitor 3 (with `flintBrain: null`), control 1 and embed 1, each registry endpoint at `/api/v<n>/` beside its unversioned
      path, the monitor stream's handshake and `systemVersion`, the frame-host records and `?embedded=frame` only.
- [x] Re-recording `overseer-fetch-versions` from forge 1.1 moved to P8.
- [x] Gate P4: `bun run versions:raise-minimum 1.0` dry runs in `packages/forge-contracts` and `apps/gaia`; a scratch forge from
      this tree and Gaia's server under one scratch `HOME` with `GAIA_PORT=0`: the forge answers `/api/versions` 1.0 and
      `/api/v2/monitor` at monitor 3, and Gaia, built for 1.1, reads it `older` (`current` when the forge's test setting answers 1.1);
      Gaia's server record lands in the scratch home's `frame-ancestors/`; no shipped file of forge or its packages names a client.

### P5. Part B: several trackers in one repository (Claude) — gated green

- [x] P5A: the project location (the five names), the pipeline format with the namespace (one serial lane), the landing journal, the
      two-tracker fixture, loopback in gate sandboxes.
- [x] P5B: Airlocks, Customs, the launch, the instruction files, `init` and the prompts' wording.
- [x] `p5-gate-cache-report`: the opt-in cached indicator for gate runs in the Bridge's pipeline view.
- [x] P5C: integration specs and a rehearsal of P7 in a scratch clone (never a copy of a linked worktree).
- [x] B15 (`repositoryRoot` and `projectPrefix` in the registry and the monitor snapshot) moved to P8.
- [x] Gate P5: the common gate, three forced verifies, the root tracker's golden replay and the rehearsal's notes.
- [x] The rehearsal's two open findings, processes listed with `ps` in a gate and the pipeline agent's turn-end check, moved to the
      backlog below.

### P6. Docs close-out and the owner's review (Claude, then the owner) — done

- [x] DOC-root: the root `CLAUDE.md` names each app's rules, each package's README and the one constitution,
      turbo as how everything verifies, and where worktrees and evidence live; the root
      `README.md`; this checklist and the design brought to the P5 gate, with the release rules kept. No `.claude/rules/gaia.md`: a
      session started in `apps/gaia` loads `apps/gaia/CLAUDE.md` itself (probe P20), and whether a path-scoped rule loads in a
      subfolder session is still unprobed.
- [x] DOC-forge: `apps/forge/CLAUDE.md` and forge's docs for what P3 to P5 changed.
- [x] DOC-gaia: `apps/gaia/CLAUDE.md`, `docs/contracts.md`, `docs/backlog.md` and `docs/forge-requirements.md` for what P3 to P5
      changed.
- [x] Gate P6: the common gate; the root tracker's golden replay unchanged.
- [x] Fixes before the go, gated green with three forced verifies in a row: the suites list processes with `pgrep`, so they run
      under a gate's Seatbelt; the pipeline agent's turn-end check is scoped like Customs; `pipeline.json` stays at version 2 unless it
      holds a prepare folder, a gate folder from the root or a reach, and both versions read; a gate profile keeps a prepare step's
      folder; each gate's cache report is kept in every phase; forge's docs index links the packages' READMEs; `namespace` passes over
      the Assistant and the product owner, which work on no branch.
- [x] P7 rehearsed end to end on a scratch clone with a copy of the live tracker: both trackers landed a ticket through gates that run
      `test` and `test:dom`, and a planted false pass was refused at the merge.
- [x] The owner reviews `git log --oneline main..monorepo/integration` and the gate records, and gives the go for P7.
      Evidence: P7 landed.

### P7. Land and operate (the owner's go) — done

Claude runs no forge verb in this repository: the steps marked "owner" are a command list Claude hands over, unless the owner's go
names each one for Claude.

- [x] Quiesce again (Claude).
- [x] Fast-forward `main` to `monorepo/integration`; install; verify (Claude).
- [x] The installed forge: a second clone outside the monorepo, its `setup.sh`, updated by pulling (owner). Evidence:
      `~/.forge-program` at `28a319c8`.
- [x] `gaia install-app` from `apps/gaia` (owner). Evidence: `~/Applications/Gaia.app` exists.
- [x] Gaia's old checkout stays read-only; its handoffs, evidence and `docs/gaia-strategy.html` are copied into the monorepo's ignored
      folders; then the worktree `graphite-orange-handoff-ebd9dc` goes (Claude). Evidence: `git worktree list`
      shows no `graphite-orange-handoff-ebd9dc`, and the main checkout's `.claude/.evidence/gaia/` holds `gaia-strategy.html`
      and Gaia's handoff folders.
- [x] Whether to carry the Claude Code memory of Gaia's project into forge's (owner). Evidence: forge's Claude Code project
      memory holds Gaia's notes (`gaia-contract-versioning.md`, `gaia-flint-decision.md`, `gaia-forge-requirements.md`).

### P8. Forge 1.1 and the last recordings — done, on `main` (Claude)

- [x] Flint's brain (G1 to G4, V7) as forge 1.1; the identity's `contracts.control` stays 1, as clients built for 1.0 compare it for
      equality, and system version 1.1 announces the brain's two commands.
- [x] Gaia re-records `overseer-fetch-supported-forge` and drops what `forge-contracts` holds only for older forges (the package at
      1.0.0).
- [x] Gaia re-records `overseer-fetch-versions` from forge 1.1.
- [x] Gate P8: the common gate with three forced verifies in a row; Gaia's check lists no forge recording authored and its
      supported-forge step reads 1.1 without a warning; `bun run versions:raise-minimum 1.0` dry runs in `packages/forge-contracts` and
      `apps/gaia`; the root tracker's frozen git calls unchanged and no client named in forge; a scratch forge from this tree and Gaia's
      server under one scratch `HOME` with `GAIA_PORT=0`: the forge answers `/api/versions` 1.1, Gaia reads it `current`, the monitor
      carries the brain, and Gaia's relayed start and stop run and end it on the fake agent, `startedBy` `api`.
- [x] No rollback to forge 1.0 past a brain run: 1.1's `flint-brain-ended` log record is one a 1.0 forge cannot read, so a board
      whose brain has run reads its log only on 1.1 or newer (forge's runbook, Updating).
- [-] B15 as forge 1.2, waiting for the owner's monorepo design. Closed without a tick, superseded: see Decisions.

## Backlog

What a phase left undone, with the reason it waits: nothing. The P5 rehearsal's two findings, the suites under a gate's Seatbelt and
the pipeline agent's turn-end check, are fixed before the go.

## Decisions

Decided by the owner on 2026-11-15:

1. One turbo cache folder for the repository, turbo's default; the cache is monorepo infrastructure and changes no forge or Gaia code.
2. Who writes the cache: the root's turbo runs only, since no forge gate runs in this repository (2026-11-21).
3. The installed forge runs from a second clone outside the monorepo; forge's network guard is unchanged.
4. Loopback is allowed in gate sandboxes, as a forge change.
5. Flint's brain comes after landing; `?embedded=gaia` and `?embedded=dashboard` are dropped.
6. A cached indicator for gates in the Bridge's pipeline view, stack-neutral and opt-in.
7. The phase gates do not run forge's `verify:integration`.

Defaults Claude takes unless the owner says otherwise: the design-system package publishable at `0.2.0` with `workspace:^`; monitor 3
carries `flintBrain: null` from forge 1.0; Gaia's
old checkout stays untouched.

Decided by the run on 2026-11-18:

1. B15, `repositoryRoot` and `projectPrefix` in the registry and the monitor snapshot: superseded, since Gaia identifies a project by
   its forge (`docs/monorepo/hephaestus-talos.md`, section 8).
2. Restart after Update forge, for an older forge, needs a program route forge does not have: closed, since Gaia supports exactly one
   forge version (`apps/gaia/CLAUDE.md:36-38`) and nothing is kept (`hephaestus-talos.md`, decision 32).
3. Forge's rules say a change that invalidates a rule updates it, but Customs keeps forge's agents out of `.claude/rules/`: moot since
   2026-11-21, as no forge tracks this repository.
4. `CodeVersion` hashes the whole root `bun.lock`: built, it hashes only the program's part of the lockfile (`CodeVersion.ts:3`), held
   by `CodeVersion.spec.ts`.
5. Install version 29 asks every board to run `forge update` once: closed, since the boards are set up anew (`hephaestus-talos.md`,
   decisions 32 and 46).

Still open: nothing.

## Forge requirements, apart from the merge

`apps/gaia/docs/forge-requirements.md` asks forge for the version model, naming no client. Forge 1.0 (`9ec2b85a`, on
`monorepo/integration`) meets V1 to V6, V8 and V9. Forge 1.1, Flint's brain, meets V7 and G1 to G4 on `p8/integration`, gated in P8,
where Gaia supports 1.1 (`SUPPORTED_FORGE_VERSION`). Forge `main` at `db64ed0a` serves no `/api/versions`, so this tree's Gaia reads a
forge of that code as older and offers Update forge until P7 lands it.
