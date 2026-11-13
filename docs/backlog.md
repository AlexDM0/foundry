# Backlog

What is agreed and not started, with the reason it waits.

- **The theme switch writes `settings.theme`.** SCREENS "The shell": the switch applies a choice at once and keeps it for the next first
  paint, and Gaia's settings answer with it. `POST /api/commands` now carries `settings-set`; the shell's switch does not send it yet,
  because the shell (W4.2) landed before the command existed and no page item names the change.
- **Record the path chooser from a person's answers.** `src/testing/recordings/darwin/path-chooser.json` is authored: only a person at the
  screen answers the system's dialog, so `bun run record path-chooser` waits for someone to run it on a Mac.
- **The embed channel's messages are recorded from a real Bridge.** `page/testing/AuthoredBridge.ts` holds the Bridge's messages and the
  frame session answers as authored from FORGE_REQUIREMENTS F5 and PLAN 8.3. It waits for the forge to serve F5 (W7.2), which records
  them from a Bridge framed by Gaia.
- **Notifications (W5.6).** SCREENS C2: a notification for each new item of the kinds User chose, through `page/notifications/`, with the
  Notification API behind its own boundary. It waits for spike 2 of `docs/spikes.md`, which needs the owner at the Mac: the permission
  prompt must be answered and a notification clicked while another application is in front. A "no" there means PLAN 11's fallback, and
  the owner decides. The window title that leads with the count of what waits is already built (`page/shell/WindowTitle.ts`).
- **Record every authored forge fixture from a real forge (W7.2).** The fixtures of the forge's contracts that it does not serve yet are
  authored from FORGE_REQUIREMENTS and stamped `authored`: the forge's recordings in `src/testing/recordings/` that `bun run verify` lists
  as authored, the documents in `src/adapters/forge-api/testing/` and `src/adapters/forge-program/testing/`, and the registry fixture in
  `src/adapters/forge-registry/testing/fixtures/`. It waits for the forge to ship F1 to F8; then each is recorded from a real forge, its
  mark removed, an authored fixture made a failure of `bun run verify`, and every difference from the authored shape reported to the owner.
