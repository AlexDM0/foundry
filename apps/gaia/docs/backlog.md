# Backlog

What is agreed and not started, with the reason it waits.

- **Record the path chooser from a person's answers.** `src/testing/recordings/darwin/path-chooser.json` is authored: only a person at the
  screen answers the system's dialog, so `bun run record path-chooser` waits for someone to run it on a Mac.
- **Support forge 1.1 and record Flint's brain from a real forge (R5.1).** It waits for the forge to ship G1 to G3 (Flint's brain) as
  forge 1.1. Gaia supports forge 1.0, at control 1, which carries no brain command, and every forge it supports reports no brain;
  `src/testing/recordings/darwin/overseer-fetch-flint-brain.json` is authored from those requirements, and the specs read and drive
  Gaia's brain from it. Once a forge serves them, raise `SUPPORTED_FORGE_VERSION` to 1.1 and `CONTRACT_VERSIONS.forgeControl` to the
  brain's control, record `overseer-fetch-supported-forge` and `overseer-fetch-versions` again, and `bun run record
  overseer-fetch-flint-brain` takes the brain, after which `forgeRequirementsAwaited` leaves its entry in `RECORDED_BOUNDARIES`. Its
  recording spec reaches a running and an ended brain through the brain's own commands, but the requirements name no way to hold a
  scratch forge's usage limit or to run one without Flint, so the spec refuses `brain-refused` and `no-flint` until the forge names one.
  G2 names the ended brain's activity entry by its kind, sentence and tokens but not its category: the authored entry is category `agent`
  with `kind: 'flint-brain'` and `tokens`, the two keys only that entry carries, and the recording from a real forge settles both.
- **Stop reading forge's integer contract keys.** Forge's compatibility registry keeps `identityVersion`, `contracts`, `summaryVersion`,
  `monitorVersion`, `controlVersion` and the embed channel's `channelVersion` only for clients from before system versions, yet Gaia's
  forge ingestions, its control and frame-session guards, the page's `ForgeContractUtil` and the embed channel still decide on them,
  and the page contract carries them (`contracts`, `knownContracts`). For a forge Gaia can talk to, its verdict alone should say what it
  serves. It waits because it changes the fleet document, so the fleet and events routes' versions and Gaia's own registry, and it
  changes nothing while forge's minimum is 0.0, when every forge Gaia talks to still serves the keys; it must land before that minimum
  is raised past 0.0.
- **Flint's box in the framed Bridge (G4).** B1 frames the Bridge with its "Agents at work" strip, where Flint has its Kanban box; the
  Bridge decides under `embedded=frame` whether it shows, so the forge's G4 makes it hold. Gaia changes nothing for it; it waits on the
  forge and on the owner's answer to Q11.
- **The embed channel's messages are recorded from a real Bridge.** `page/testing/AuthoredBridge.ts` holds the Bridge's messages as
  authored from FORGE_REQUIREMENTS F5; they match the forge's `bridge/shell/VersionedEmbedChannel.ts` at 55beb9cd. The forge serves F5
  now, but a recording needs a recording boundary of its own: the browser framing a live Bridge from Gaia's origin and collecting what it
  posts, which no recording spec does yet and the page's specs, having no document, cannot. The frame session answers there are Gaia's
  own server's, not the forge's.
- **The starting monitor's refusals are recorded.** Before its first generation the Overseer answers `GET /api/monitor` with 503
  `starting` and its monitor stream with 404 `not-ready`; the forge watch reads both as starting (`WatchReadingUtil.failureMeansStarting`).
  Ten starts of a scratch Overseer of a released forge gave no answer in that window, so `overseer-fetch-supported-forge` holds only the
  identity's 503 for `starting`, as it was authored from that recording.
- **Record the forge program before F8 again.** `forge-program` holds a forge that answers no F8 JSON (install version 27, code
  3a6e9e6043da). Its recording spec asserts that older shape, so it records again only from a checkout of that forge.
- **Notifications (W5.6).** SCREENS C2: a notification for each new item of the kinds User chose, through `page/notifications/`, with the
  Notification API behind its own boundary. It waits for spike 2 of `docs/spikes.md`, which needs the owner at the Mac: the permission
  prompt must be answered and a notification clicked while another application is in front. A "no" there means PLAN 11's fallback, and
  the owner decides. The window title that leads with the count of what waits is already built (`page/shell/WindowTitle.ts`), and so is
  the "What notifies" checklist; version 2's C2 also draws the notification card, the line that Flint's brain does not notify, and the
  permission line, which wait with W5.6.
- **Record an update whose Baton pass was not taken.** `forge update --json` answers `batonPass: 'failed'` with `batonPassStep:
  'restart-not-taken'` at exit 0 when the live Overseer does not take the pass, and Gaia answers it as restart pending
  (`src/features/forge-control/utils/ProgramVerdictUtil.ts`). `forge-program-done` holds only a pass that was not needed: a recording
  needs a scratch Overseer on other code than the forge on disk that then declines the pass, which `src/testing/ScratchForge.ts` cannot
  stage from one read-only forge checkout.
