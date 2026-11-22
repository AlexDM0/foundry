# Backlog

What is agreed and not started, with the reason it waits.

- **Record the path chooser from a person's answers.** `src/testing/recordings/darwin/path-chooser.json` is authored: only a person at the
  screen answers the system's dialog, so `bun run record path-chooser` waits for someone to run it on a Mac.
- **The starting monitor's refusals are recorded.** Before its first generation Hephaestus answers `GET /api/monitor` with 503
  `starting` and its monitor stream with 404 `not-ready`; the forge watch reads both as starting (`WatchReadingUtil.failureMeansStarting`).
  Ten starts of a scratch Hephaestus of a released forge gave no answer in that window, so `hephaestus-fetch-supported-forge` holds only the
  identity's 503 for `starting`, as it was authored from that recording.
- **Record the forge program before F8 again.** `forge-program` holds a forge that answers no F8 JSON (install version 27, code
  3a6e9e6043da). Its recording spec asserts that older shape, so it records again only from a checkout of that forge.
- **Notifications (W5.6).** `docs/design/screens.md` C2: a notification for each new item of the kinds User chose, through `page/notifications/`, with the
  Notification API behind its own boundary. It waits for spike 2 of `docs/spikes.md`, which needs the owner at the Mac: the permission
  prompt must be answered and a notification clicked while another application is in front. A "no" there means PLAN 11's fallback, and
  the owner decides. The window title that leads with the count of what waits is already built (`page/shell/WindowTitle.ts`), and so is
  the "What notifies" checklist; the artboard of C2 also draws the notification card and the permission line, which wait with W5.6.
- **Record an update whose restart was not taken.** `forge update --json` answers `restart: 'failed'` with `restartStep:
  'restart-not-taken'` at exit 0 when the live Hephaestus does not take the restart, and Gaia answers it as restart pending
  (`src/features/forge-control/utils/ProgramVerdictUtil.ts`). `forge-program-done` holds only a restart that was not needed: a recording
  needs a scratch Hephaestus on other code than the forge on disk that then declines the restart, which `src/testing/ScratchForge.ts`
  cannot stage from one read-only forge checkout.
- **Flint looks at the composer.** The design handoff's answer of the chat habitat to "the user types", and the look after the doubt of
  "the agent asks a question". The composer sends the `user-is-typing` cue, which only wakes Flint (`page/lib/flint/`): no intent of the
  fixed list looks at an element, and neither the playground nor `02-animations.md` gives a look's motion. It waits for a look in the
  playground, and a `look` intent with the element the habitat names.
