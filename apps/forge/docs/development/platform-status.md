# Platform status: what has never run

The code holds an adapter for every port on macOS, Linux and native Windows, and
`src/lib/platform-ports/PlatformPortsFor.spec.ts` proves each one is reachable through its selector. Reachable is not
run. **The test suite and every session so far ran on one machine: macOS on arm64.** Nothing has run on Linux, on
native Windows, or on macOS x64. The specs run the Linux and Windows adapters on this Mac, over fakes: fake `/proc` text,
a fake kernel table, fake `icacls` output, a recorded `reg.exe`, a fake pipe listener. A fake proves the adapter reads
what the fake says the OS prints, not what the OS prints.

This page lists, per OS and per port, the named unknowns that each ticket of the cross-platform chain (#516 to #554)
left behind. Each `Unrun` cell quotes that ticket's `Unrun, for the Handoff` line word for word. The probes in
`.platform-probes/` answer many of them on a real host ([the probes' README](../../.platform-probes/README.md)); no
probe result is recorded here yet. When one runs, move the row to a "Has run" note with the date, OS version and
architecture, and correct the docs that it contradicts.

## macOS

| Port | Status |
| --- | --- |
| Every port | Has run on arm64, under the full suite and real sessions. Never run on x64. |
| `GateConfinement` (Seatbelt) | Has run on arm64. `sandbox-exec` is deprecated by Apple; a macOS release that drops it leaves gates refused. |

### Sessions in a folder tracker's worktree (probed 16 November 2026)

Probed on macOS arm64 with Claude Code 2.1.323: a builder of a folder tracker (`apps/example`, namespace `example`) in a
scratch repository, its launch rendered by a real Hephaestus and replayed with the real `claude`, changing only the
start folder and `sandbox.network.allowLocalBinding`. Never run on Linux or Windows.

| Start folder | `allowLocalBinding` | `git add` / `git commit` | Bind 127.0.0.1 | Reach Hephaestus's port | Reach another local service |
| --- | --- | --- | --- | --- | --- |
| the project folder in the worktree | not set | refused: `index.lock` in `<git common dir>/worktrees/<name>/` | refused | refused | refused |
| the worktree's root | not set | committed | refused | refused | refused |
| the worktree's root | `true` | committed | bound | answered HTTP 200 | reached |

- **Start folder.** The settings, argv and environment were byte-equal in the first two rows: only the start folder
  decides. Claude Code's sandbox grants a linked worktree's admin folder only to a session that starts at the
  worktree's root, which holds the `.git` file naming that folder. So a session in a job's worktree starts at
  `worktreeRoot` (`src/services/hephaestus/SessionPlace.ts`), and forge adds no git grant. From there Claude Code reads
  the repository root's `CLAUDE.md` and `.claude/settings.json` of the worktree, and a folder's `CLAUDE.md` only when
  the session works in that folder. A resumed session starts where it first started, since Claude Code finds it by
  that folder.
- **`allowLocalBinding` stays off.** It opens more than binding: with it set, the session also connected out to every
  loopback port, Hephaestus's API and an unrelated local service among them. Without it, outbound loopback is
  refused at once. Setting it would give every builder and reviewer Hephaestus's API and every local service on the
  machine, so no profile sets it, held by `src/lib/claude-code/ClaudeCodeAdapter.spec.ts`.

## Talos

[Talos](../glossary.md#talos), the worker thread that runs its synchronous calls, and the supervision lease have run on
macOS arm64 only, under the suite and with the fake agent; Talos's recordings are macOS's. On macOS a real sleep across
a held lease or a running line never ran: the specs move the clock, so the wake rule and a line's allowance for a gap
are proved on a fake clock alone. On Linux and Windows none of Talos ever ran: not its endpoint (a Unix socket on Linux,
a named pipe on Windows), not a Bun `Worker` running its synchronous calls while its timers fire, not `bun:ffi` in a
worker on Windows, and not a line's tree stop at its time bound.

## Linux

The POSIX adapters (`PosixShellLine`, `PosixOwnerOnlyFiles`, `PosixDataFolders`, `PosixLaunchEnvironment`,
`PosixExecutableResolver`, `PosixFileReplace`, `PosixSocketEndpoint`, `PosixSetupPlatform`) are the ones that ran on
macOS; on Linux they have never run. The Linux-only adapters have never run anywhere real.

| Port | Ticket | Unrun, for the Handoff |
| --- | --- | --- |
| `GateConfinement` | #521 | the preflight against a real Linux host. |
| `ProcessSupervision` | #522 | the adapter on a real /proc. |
| `ProcessSupervision` | #523 | the Linux walk on a real /proc. |
| File watches (core) | #543 | max_user_watches exhaustion on Linux. |
| `GateConfinement` | #546 | every rendered argv under a real bwrap, including default Ubuntu 24.04 with its AppArmor user-namespace rule. |
| `AgentHostFacts`, worker sandbox | #547 | a real sandboxed session on Linux, including an empty ref left after SIGKILL. |
| `AgentHostFacts`, worker sandbox | #548 | a real Linux session reading the file, and authentication under the deny. |
| `LocalEndpoint` | #554 | a socket path of 104 to 107 bytes binding under the 108-byte Linux limit. |
| Platforms section | #554 | Talos ending at logout under `KillUserProcesses=yes`, and a container run without `--init`. |
| `ProcessSupervision` (tree stop), `GateConfinement` | none | a gate profile's line under bwrap, its output read piece by piece, and Stop ending its tree on a real /proc. |
| `ProcessSupervision` (tree stop), `GateConfinement` | none | a pipeline check's two runs under bwrap, and a Hephaestus stop ending its tree on a real /proc. |
| `ProcessSupervision` (boot start) | none | the `btime` line of a real /proc/stat, read for a crash suspected before a reboot. |
| `ProgramFolders` | none | `LinuxProgramFolders` against a real Linux install: the agent's program and the tools found in its folders. |

## Windows

Native Windows only; WSL is Linux. Windows on arm64 is unknown in addition: Bun's own support for it is not checked
here, and `WindowsKernelProcessApi` calls `kernel32.dll` through `bun:ffi`.

| Port | Ticket | Unrun, for the Handoff |
| --- | --- | --- |
| `ProcessSupervision` (spawn options) | #524 | a child started on real Windows with this block. |
| `ExecutableResolver` | #525 | lookup against a real Windows PATH, and a multi-line JSON argument reaching claude.exe. |
| `ProcessSupervision` (spawn options) | #526 | powershell.exe, pwsh, cmd.exe and git under these options; visible windows on a desktop. |
| `ProcessSupervision` (identity) | #527 | the kernel calls and the reg.exe read on real Windows, Fast Startup behaviour. |
| `ProcessSupervision` (tree stop) | #528 | taskkill and the snapshot on real Windows. |
| `ProcessSupervision` (stop signals) | #529 | console close and Ctrl+Break on real Windows. |
| `FileReplace` | #530 | a real held file under Defender. |
| `OwnerOnlyFiles` | #531 | real icacls output on Windows. |
| `LocalEndpoint` | #532 | a real pipe: bind, busy name, half-close latency, release after a crash, and the default DACL. |
| git paths (core) | #535 | git's real C:/ output. |
| `ShellLine` | #537 | the wrapper under real cmd.exe, including unbalanced parentheses in a line. |
| Worktrees (core) | #538 | a checkout over 260 characters on real Windows. |
| Worktrees (core) | #539 | a real held cwd, and whether `.git` goes first on NTFS. |
| Landings (core) | #540 | a tracked file really held open on Windows. |
| `AgentHostFacts` | #549 | whether a real Windows session refuses on a rendered deny, and the exclude's glob matching there. |
| `AgentHostFacts` | #550 | a real Windows session running `git push` in PowerShell. |
| `AgentHostFacts`, worker settings | #551 | a real Windows session starting with these settings. |
| `SetupPlatform` | #552 | setup.ps1 from real cmd and PowerShell. |
| Platforms section | #554 | Talos started inside a job object that kills on close, and `clear` from a Git Bash mintty. |
| `ProcessSupervision` (tree stop) | none | a gate profile's line, unconfined as every gate here, its output read piece by piece, and Stop ending its tree through taskkill. |
| `ProcessSupervision` (tree stop) | none | a pipeline check's two runs, unconfined as every gate here, and a Hephaestus stop ending its tree through taskkill. |
| `ProcessSupervision` (boot start) | none | no read exists: the boot's start answers `null`, so a crash suspected before a reboot is never judged on Windows. |
| `ProgramFolders` | none | `WindowsProgramFolders` against a real Windows install: claude.exe and the tools found in its folders, and a session's `Path` ending in the folders under `SystemRoot`. |

## Repository tooling

`.claude/hooks/fix-lint-on-edit.sh` is bash and `.readme-graphics/render-diagrams.py` is Python, for the owner's machine
only, on macOS and Linux; `CLAUDE.md` records that boundary. The README graphics need macOS. None of them is a product
requirement, and none is planned for Windows.
