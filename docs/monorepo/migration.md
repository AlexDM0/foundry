# The forge monorepo merge

The one checklist for moving forge and Gaia into forge's repository: every step in order, who does it and where it stands, and the
decisions still open. The reasoning behind the layout, Part B (forge in a part of a repository) and the release rules is the monorepo
design, `docs/monorepo/design.md`; where the two differ, this checklist holds.

Status as of 2026-11-15, on branch `monorepo/integration` at `e50aaacb` (P2A merged). Merge bases: forge `main` `db64ed0a`, Gaia
`main` `1418f76`. Claude does every lane, in its own worktree `.claude/worktrees/<lane>` on branch `monorepo/<lane>`, merged into
`monorepo/integration` in the order its phase lists. Forge's `main` moves only in P7, by fast-forward, after the owner's go. Nothing is
pushed. Each phase ends with a gate in the integration worktree: a clean `bun install --frozen-lockfile`, `bun run verify`, one
`bun run verify -- --force`, the phase's own checks and a clean `git status`. The gate records are in the main checkout's
`.claude/.evidence/monorepo-migration/gates/`, which is ignored.

## What Gaia brought

| Path | What it is | Its README |
| --- | --- | --- |
| `apps/gaia/` | Gaia's whole app: `src/`, `page/`, `resources/`, `docs/`, its `bunfig.toml`, tsconfigs, lint config and `CLAUDE.md` | `apps/gaia/README.md` |
| `packages/design-system-contributions/` | The eight components Gaia built that belong in the design system (`TextField`, `Checkbox`, `Figure`, `PageHead`, `FailedAction`, `PendingStep`, `ThemeCycleButton`, `DataTable`, with `ThemeChoice` and `ThemeCycleUtil`), under the design-system package's constitution | its `README.md` and `CONSTITUTION.md` |
| `packages/brand/` | Forge's mark as a React component, its tokens in both themes, and the geometry a host's mark may draw alike; it names no Gaia | its `README.md` |
| `packages/forge-contracts/` | Forge's contract with any client: the Overseer's documents as types, forge's system versions, its compatibility registry with the raise-the-minimum report and guard, and the embed mode; it names no Gaia | its `README.md`; what Gaia asks of forge is `apps/gaia/docs/forge-requirements.md` |
| `packages/system-versions/` | The version model any server and client share and the compatibility registry's logic, naming no server | its `README.md` |
| `migration/design-system-patches/` | Fourteen numbered patches against the design-system package for what Gaia needs of its components, and `CheckPatches.ts` | its `README.md` |

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
      `typecheck`, `lint`, `verify`, `verify:<app>`, `gate:<app>` and `cache:audit`.
- [x] L5 setup and runtime (`BunStep`, `CodeVersion` hashing the packages and the root `bun.lock`), L2 root guards, L3 lint per
      workspace, L4 a DOM spec runner per package, L7 forge's docs, L8 the Claude Code probes in a subfolder session.
- [ ] L1 import graph: the graph reads the declared packages, but the package include-list contracts have not moved into
      `packages/*/ProjectIncludeList.spec.ts`, and "a package imports nothing from `apps/`" and "an app imports only the packages it
      declares" have no planted cases yet (lane `p2-import-graph-finish`).
- [x] L6 network guard: dropped. The installed forge runs from a second clone instead (owner decision of 2026-11-15).
- [x] The popover spec's timeout under concurrency: each failed poll of its `waitFor` printed a happy-dom node, walking the whole
      document (0.75 s alone, 5 s in the Bridge's tree), past the poll's 1 s bound under load. The DOM preloads of forge and the design
      system print a node as its opening tag.
- Open: forge's DOM run still hangs beside the other tasks (4 of 6 forced runs without the ordering edge), so `test:dom` keeps waiting
      for its package's `test`. Each hang is in a `Bun.spawnSync` of the per-file leak check (`TestRunReport.ts`, rerun per file under
      `--isolate`), right after its `lsof`: the git child has exited and is a zombie, Bun spins at 100 % CPU, and a `timeout` on the
      spawn does not end it. Ruled out: the specs (a planted run of trivial files with the same preloads, `lsof` and happy-dom, 16 runs
      under CPU and process-churn load, never hung), node printing, timers and ports. Next: an asynchronous spawn in the leak check, or
      no process check per DOM file, then drop the edge.

### P2. Import Gaia (Claude) — under way

- [x] P2A: Gaia's `main` merged with `--allow-unrelated-histories` (`e50aaacb`), its 279 commits and signatures intact; Gaia's workspaces
      take turbo's task names. One forced verify had two red specs: Gaia's `SingleReactPlugin` negative case (G-a removes the plugin) and
      the design-system popover flake (the P2 gate's).
- [ ] G-a `p2-gaia-workspace`: Gaia declares `design-system` at `workspace:^`; the link-era workarounds go (`DesignSystemPeerPreload`,
      `preserveSymlinks`, `SingleReactPlugin`); a spec that every workspace package Gaia imports is declared.
- [ ] G-b `p2-gaia-leak-check`: Gaia's leak check judges only `apps/gaia`.
- [x] G-c `p2-docs`: the root `CLAUDE.md` and `README.md`; `apps/gaia/CLAUDE.md` rules 1, 2, 9 and 11 for one repository; this design
      and this checklist under `docs/monorepo/`.
- [ ] Gate P2: three cold `bun run verify -- --force` runs in a row, green each time (lower `--concurrency` if one flakes); the turbo
      isolation smoke (an `apps/gaia` edit changes only Gaia's hashes, a `packages/design-system` edit forge's and Gaia's, a
      `packages/forge-contracts` edit only Gaia's); `bun run versions:raise-minimum` still works from `apps/gaia`.

### P3. The design-system merge (Claude) — not started

- [ ] P3A: DS-A moves the contributions' parts into `packages/design-system`; DS-B tokens and state dots.
- [ ] P3B: DS-C button, DS-D callout and confirm, DS-E1 counts and heads, DS-E2 meters and tags. Each patch is implemented in the
      package with the patch as its specification; only patch 01 applies with `git am`.
- [ ] P3C: DS-F the package's README, constitution and exports (publishable at `0.2.0`); DS-G Gaia's call sites switch to
      `design-system/<Export>`.
- [ ] P3D: delete `packages/design-system-contributions`, `migration/` and `migration/*` from the workspaces.
- [ ] Gate P3: Storybook builds; the visual pass; no `design-system-contributions` left outside git history.

### P4. Forge 1.0: contracts, brand, V1 to V6, V8, V9 (Claude) — not started; may run beside P3

- [ ] P4.0: monitor 3 (with `flintBrain: null`) from `claude/project-thread-dw1bcu`; forge depends on `forge-contracts`,
      `system-versions` and `brand`.
- [ ] P4A: V-server (`/api/versions`, `/api/v<n>/` paths), V-frame (frame hosts), V-bridge (the embed channel and forge's mark from
      `brand`). Both `?embedded=gaia` and `?embedded=dashboard`, and the dashboard's frame record, are dropped.
- [ ] P4B: a guard that forge's sources and docs name no client; forge 1.0 (`/api/versions` answers `1.0`), its commit recorded here;
      Gaia's recordings retaken from forge at `db64ed0a` and at 1.0, the `versions-ahead` and `versions-newer` situations through a
      test-only override of forge's `/api/versions` answer.
- [ ] Gate P4: `bun run versions:raise-minimum 1.0` dry runs in `packages/forge-contracts` and `apps/gaia`.

### P5. Part B: several trackers in one repository (Claude) — not started

- [ ] P5A: the project location (the five names), the pipeline format with the namespace (one serial lane), the landing journal, the
      two-tracker fixture, loopback in gate sandboxes.
- [ ] P5B: Airlocks, Customs, the launch, the instruction files, `init` and the prompts' wording.
- [ ] `p5-gate-cache-report`: the opt-in cached indicator for gate runs in the Bridge's pipeline view.
- [ ] P5C: integration specs and a rehearsal of P7 in a scratch clone (never a copy of a linked worktree).
- [ ] B15 (`repositoryRoot` and `projectPrefix` in the registry and the monitor snapshot) waits for P8.

### P6. Docs close-out and the owner's review (Claude, then the owner) — not started

- [ ] DOC-root, DOC-forge, DOC-gaia: the root docs, both apps' `CLAUDE.md` and docs for what P3 to P5 changed.
- [ ] The owner reviews `git log --oneline main..monorepo/integration` and the gate records, and gives the go for P7.

### P7. Land and operate (the owner's go) — not started

Only the owner runs `init`, `update` or `clear` on a live tracker, and Claude runs no forge verb in this repository: the steps marked
"owner" are a command list Claude hands over, unless the owner's go names each one for Claude.

- [ ] Quiesce again (Claude).
- [ ] Fast-forward `main` to `monorepo/integration`; install; verify (Claude).
- [ ] The installed forge: a second clone outside the monorepo, its `setup.sh`, updated by pulling (owner).
- [ ] Forge's tracker to `apps/forge/.forge`, namespace `forge`, `forge update`; remove what the root tracker installed at the root
      (owner).
- [ ] Gates for forge's tracker: prepare `bun install --frozen-lockfile` at `in: /`; `gate add verify --writes <repository>/.turbo/cache
      --defined-by /turbo.json --defined-by /package.json --defined-by /bun.lock -- bun run gate:forge`; the Overseer-only merge gate
      `cache:audit`; reach `/packages/*` that forge owns, `/package.json`, `/bun.lock`, `/turbo.json` (owner).
- [ ] Gaia's tracker: `forge init` in `apps/gaia`, namespace `gaia`, reach `/packages/design-system`, `/packages/system-versions` and
      the root workspace files; the same gates with `gate:gaia` (owner).
- [ ] Login items for both trackers, from the installed clone (owner).
- [ ] `gaia install-app` from `apps/gaia` (owner).
- [ ] Smoke: both Overseers start through Gaia, both Bridges serve, one trivial ticket per tracker lands, and the other tracker's gate
      replays the untouched app from the cache (Claude).
- [ ] Gaia's old checkout stays read-only; its handoffs, evidence and `docs/gaia-strategy.html` are copied into the monorepo's ignored
      folders; then the worktree `graphite-orange-handoff-ebd9dc` goes (Claude).
- [ ] Whether to carry the Claude Code memory of Gaia's project into forge's (owner).

### P8. Forge 1.1 and the last recordings (forge's tracker, after landing) — not started

- [ ] Flint's brain (G1 to G3, V7, control 2) as forge 1.1, built by forge's own tracker on the new layout.
- [ ] Gaia re-records `overseer-fetch-supported-forge` and drops what `forge-contracts` holds only for older forges.
- [ ] B15 as forge 1.2.

## Decisions

Decided by the owner on 2026-11-15:

1. One turbo cache folder for the repository, turbo's default; the cache is monorepo infrastructure and changes no forge or Gaia code.
2. Who writes the cache: every gate with `--writes`, audited by the Overseer-only `cache:audit` merge gate.
3. The installed forge runs from a second clone outside the monorepo; forge's network guard is unchanged.
4. Loopback is allowed in gate sandboxes, as a forge change.
5. Flint's brain comes after landing; `?embedded=gaia` and `?embedded=dashboard` are dropped.
6. A cached indicator for gates in the Bridge's pipeline view, stack-neutral and opt-in.
7. The phase gates do not run forge's `verify:integration`.

Defaults Claude takes unless the owner says otherwise: the design-system package publishable at `0.2.0` with `workspace:^`; monitor 3
carries `flintBrain: null` from forge 1.0; Gaia's tracker reaches `packages/design-system` and `packages/system-versions` only; Gaia's
old checkout stays untouched.

Still open:

1. Restart after Update forge, for an older forge, needs a program route forge does not have.
2. Forge's rules say a change that invalidates a rule updates it, but Customs keeps forge's agents out of `.claude/rules/`: either those
   changes are the owner's, or the rules move to a path agents may change.
3. `CodeVersion` hashes the whole root `bun.lock`, so a dependency Gaia adds shows forge's Overseer newer code: hash only forge's part,
   or word the notice.

## Forge requirements, apart from the merge

`apps/gaia/docs/forge-requirements.md` asks forge for the version model, naming no client. None is on forge `main` at `db64ed0a`: it
serves no `/api/versions`, and its Bridge still enters the embed mode on `?embedded=gaia`. Until P4 lands V1 to V3, Gaia reads every
forge as older and offers Update forge.
