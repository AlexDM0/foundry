# Platform probes

Small Bun scripts, each answering one named unknown about an operating system or the Claude host. Each prints exactly
one JSON line. The scripts use no code from `src/` or `cli/`.

**A run gates no ticket.** No Acceptance item and no dependency rests on a result; the results are for the day the tool
first runs on that platform.

## The one command

```sh
bun .platform-probes/run-all.js --claude-program "$(command -v claude)"
```

On Windows, give the full path of `claude.exe`. The command exits 0 and prints one line per script.

Without `--claude-program`, the operating-system probes and `host-npm-global-resolution` run, and every session probe
prints `applicable: false`, so no session is spent. With it, the `claude-p*` and `host-*` scripts and
`os-sandbox-exec-nested` run scripted `claude -p` sessions on model `haiku`, through whatever login the machine has;
`host-npm-global-resolution` only asks the program its version. There is no interactive session. `claude-p10` and
`claude-p19` reach only a local stand-in, and `claude-p18` sends no request; these three need no login and spend no
quota. `claude-p22` spends one Haiku turn of Flint's brain. A whole run takes up to about an hour of sessions.

| Option | Meaning |
| --- | --- |
| `--claude-program <path>` | The Claude program the host probes run. |
| `--gpgconf-program <path>` | The gpgconf `claude-p14` asks for the GnuPG sockets; default the one on `PATH`. The spec passes a scratch stub, since no spec may reach the host GnuPG. |
| `--only <text>` | Run only the scripts whose file name holds the text. |
| `--results-folder <folder>` | Where the verdicts and the stream fixture go; default `.platform-probes/results/<os>-<architecture>/`, git-ignored. |
| `--record-wire <folder>` | Save the stream-json lines of the sessions the fake agent plays, one `<scenario>.json` each; `bun run record src/testing/fake-agent/` passes it. |
| `--scratch-root <folder>` | Where each probe makes its `platform-probe-` scratch folders; default `/tmp/agent-progress-tests` (the temp folder on Windows). The spec passes its run's own folder. |
| `--settle-seconds <seconds>` | Replace the waits for a turn that should not come, and cut each fixed settle wait to at most this. Without it every wait keeps its default. The spec passes a twentieth of a second. |

## Run on a standard account

Run on a standard account, not an elevated one, for the answers that differ: `os-symlink-permission`,
`os-task-scheduler-logon`, `os-job-object-nesting` and `os-pipe-second-user` record the elevation in `observed`.

Some unknowns need more than one run:

- `os-boot-identity`: run it on each side of a shutdown with Fast Startup on, and compare.
- `os-bwrap-user-namespaces`: run it as the machine comes, then with `kernel.apparmor_restrict_unprivileged_userns=0`.
- `os-watch-user-limit`: lower `fs.inotify.max_user_watches` below 20000 first; otherwise it builds no tree.
- `os-pipe-second-user`: run it with `--hold-seconds 300` on one account, and with `--connect <path>` on a second.

## The verdict line

```json
{"unknown":"exit-code-extremes","os":"linux","architecture":"x64","bunVersion":"1.4.2","applicable":true,"observed":{}}
```

`observed` holds raw values, never a pass or a fail. A script that cannot apply prints `applicable: false`, and
`observed.whyNotApplicable` says why. A script that throws records `observed.probeThrew`. `run-all.js` prints
`observed.scriptPrintedNoVerdict` for a script that died without a line.

## Recording results

Record the results on the platform, in a per-OS column of `docs/development/hephaestus-claude-probe.md`. The probe record
there has no P12, so no script has that number. `host-stream-fixture` saves a session as a `.stdout.jsonl` and
`.stdin.jsonl` pair beside `verdicts.jsonl`.

## Files

- `os-*.js`: one operating-system unknown each, Windows, Linux or macOS.
- `host-*.js`: one Claude host unknown each.
- `claude-pNN-*.js`: one numbered probe of `docs/development/hephaestus-claude-probe.md` each.
- `support/`: the verdict line, program runs, scratch folders, pipes and the scripted session.

Plain `.js`, as in `.readme-graphics/`, so typecheck, lint and the layer guards stay out of this folder.
