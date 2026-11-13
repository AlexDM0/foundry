# Backlog

What is agreed and not started, with the reason it waits.

- **The theme switch writes `settings.theme`.** SCREENS "The shell": the switch applies a choice at once and keeps it for the next first
  paint, and Gaia's settings answer with it. `POST /api/commands` now carries `settings-set`; the shell's switch does not send it yet,
  because the shell (W4.2) landed before the command existed and no page item names the change.
- **Record the path chooser from a person's answers.** `src/testing/recordings/darwin/path-chooser.json` is authored: only a person at the
  screen answers the system's dialog, so `bun run record path-chooser` waits for someone to run it on a Mac.
- **The embed channel's messages are recorded from a real Bridge.** `page/testing/AuthoredBridge.ts` holds the Bridge's messages as
  authored from FORGE_REQUIREMENTS F5; they match the forge's `bridge/shell/VersionedEmbedChannel.ts` at 55beb9cd. The forge serves F5
  now, but a recording needs a recording boundary of its own: the browser framing a live Bridge from Gaia's origin and collecting what it
  posts, which no recording spec does yet and the page's specs, having no document, cannot. The frame session answers there are Gaia's
  own server's, not the forge's.
- **The starting monitor's refusals are recorded.** Before its first generation the Overseer answers `GET /api/monitor` with 503
  `starting` and its monitor stream with 404 `not-ready`; the forge watch reads both as starting (`WatchReadingUtil.failureMeansStarting`).
  Ten starts of a scratch Overseer gave no answer in that window, so `overseer-fetch-every-contract` holds only the identity's 503.
- **A failed Baton pass's warning is told apart.** PLAN 7.2 row 3 shows `baton-pass-failed` for "a warning of that kind in the
  snapshot", but monitor contract 1 sends each header warning as the forge's sentence alone (FORGE_REQUIREMENTS F2 types it `string[]`),
  so the ingestion reads every warning as `forge-warning` and the look never applies to a real forge. It waits for the owner: a warning
  kind added to the forge's monitor contract, or another rule for row 3. Gaia never decides on the forge's wording.
- **Record the forge before F1 again.** `overseer-fetch` and `forge-program` hold a forge that names no contracts and answers no F8 JSON
  (install version 27, code 3a6e9e6043da); Gaia reads such a forge through its summary. Their recording specs assert that older shape, so
  they record again only from a checkout of that forge.
- **The usage line names its window's reset while under the limit.** A3's artboard reads "under its limit · window resets 16:00", but
  monitor contract 1's `usage` holds `resetsAt` and `window` only from the machine's usage-limit marker, which the forge writes when a
  window refuses requests; under the limit both are `null` (every recorded snapshot), so Gaia shows "under its limit" and invents no time.
  It waits on the forge: the snapshot would carry the current window and its reset stamp while under the limit, from the `usage-window`
  events its agents' sessions already report, as a key the monitor contract adds.
- **Notifications (W5.6).** SCREENS C2: a notification for each new item of the kinds User chose, through `page/notifications/`, with the
  Notification API behind its own boundary. It waits for spike 2 of `docs/spikes.md`, which needs the owner at the Mac: the permission
  prompt must be answered and a notification clicked while another application is in front. A "no" there means PLAN 11's fallback, and
  the owner decides. The window title that leads with the count of what waits is already built (`page/shell/WindowTitle.ts`).
