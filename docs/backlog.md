# Backlog

What is agreed and not started, with the reason it waits.

- **The theme switch writes `settings.theme`.** SCREENS "The shell": the switch applies a choice at once and keeps it for the next first
  paint, and Gaia's settings answer with it. `POST /api/commands` now carries `settings-set`; the shell's switch does not send it yet,
  because the shell (W4.2) landed before the command existed and no page item names the change.
- **Record the path chooser from a person's answers.** `src/testing/recordings/darwin/path-chooser.json` is authored: only a person at the
  screen answers the system's dialog, so `bun run record path-chooser` waits for someone to run it on a Mac.
