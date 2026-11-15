# Gaia

One window over every forge on this machine: what waits on User across all boards, every running agent, and the state and controls of
every forge. One forge's own views are its Bridge, shown in place under Gaia's bar.

Gaia is a Bun server and a React page in TypeScript, opened as a macOS app. It runs no agent and is optional: a forge works the same
without it.

## Develop

Set up at the repository root, as its `README.md` says (install the workspace, link the design-system package). Then, in this folder:

```bash
bun run verify
```

```bash
bun src/Main.ts help
```

```bash
bun src/Main.ts launch
```

opens Gaia's window in Google Chrome or Microsoft Edge, starting its server when none runs, and stops that server when the window closes.

```bash
bun src/Main.ts install-app
```

installs `Gaia.app` into `~/Applications`, which opens the same window from the Finder, Launchpad or Spotlight. It runs Gaia from this
checkout; when Gaia's install version changes, the app says so and asks for this command again.

## The app icon

`resources/app-bundle/Gaia.icns` is made from Gaia's mark as drawn in `docs/images/`. Render each image of a `Gaia.iconset` folder at
its pixel size: `icon_16x16.png`, `icon_16x16@2x.png` and `icon_32x32.png` (16 and 32 px) from the small drawing,
`docs/images/logo/gaia-mark-light-16.svg`, and every larger image (64 px to 1024 px) from `docs/images/icon.svg`. Then run
`iconutil --convert icns Gaia.iconset --output Gaia.icns`. Draw the icon again whenever `page/design-system/GaiaMark.tsx` changes.

## Read further

- `CLAUDE.md`: the rules for working on Gaia, its map and its boundaries.
- `docs/architecture.md`: how the launcher, the server, the page and the forges fit together at run time.
- `docs/contracts.md`: every versioned contract Gaia reads, writes, sends or serves, with its version.
- `docs/forge-requirements.md`: what Gaia needs from forge, written as tickets for forge's board.
- `docs/backlog.md`: what is agreed and not started, with the reason it waits.
- `docs/spikes.md`: what was seen on a real Mac before the frame, the notifications and the launcher were written.
