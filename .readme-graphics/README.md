# README graphics

What renders the store panels of the root `README.md` in `docs/images/`: `suite-hero`, the four `forge-*` panels, the four
`gaia-*` panels and `flint`, each 1920 x 1200. Every screen in them is painted from Gaia's own fixtures (the five forges'
fleet and Example Storefront), never from a live forge.

`docs/images/gaia-icon.png` is `apps/gaia/docs/images/icon.svg` at 512 x 512, shot once by hand; no script here renders it.
`apps/forge/.readme-graphics/` renders forge's own diagrams.

## Requirements

macOS with zsh, Bun, and Google Chrome in `/Applications`. Everything the scripts write goes to `build/` in this folder,
which git ignores.

## Files

| file | what it does |
|---|---|
| `WriteGaiaScreens.tsx` | Writes Gaia's fleet screens (artboards A1 to A4 and B1, light and dark) as whole documents, with `list.txt`. |
| `WriteBoardScreens.tsx` | Bundles `BoardScreenClient.tsx` and writes Example Storefront's board on its Kanban, Questions and Progress tabs, with `board-list.txt`. |
| `BoardScreenClient.tsx` | The browser side of a board screen: mounts Gaia's real page root over the fleet fixture and the board. A static render leaves the question panel and Flint out, so the board is mounted live. |
| `StorefrontBoard.ts` | Example Storefront's board for the panels, fuller than Gaia's fixture and agreeing with the fleet fixture. |
| `ComposePanels.ts` | Writes each panel as a page: headline, subhead and the screenshots in framed windows, with `list.txt`. |
| `shoot.sh` | Screenshots every `name width height address` line of a list with headless Chrome, reduced motion forced. |

## Render the panels

From this folder:

```sh
bun WriteGaiaScreens.tsx "$PWD/../apps/gaia" "$PWD/build/gaia-html"
bun WriteBoardScreens.tsx "$PWD/build/gaia-html"
./shoot.sh build/gaia-html/list.txt build/gaia-shots
TZ=UTC ./shoot.sh build/gaia-html/board-list.txt build/gaia-shots
bun ComposePanels.ts "$PWD/.." "$PWD/build/panel-pages"
./shoot.sh build/panel-pages/list.txt build/panels 1.5
```

Look at `build/panels/*.png`, then copy them into `docs/images/`.

The board screens are shot under `TZ=UTC` because the board shows clock times of the fixture's day.

## The Flint panel

`flint.png` shows stills that Flint's frame capture wrote to `.claude/.evidence/flint-frames/root-readme/` in the main
checkout. When they are missing or Flint changed, capture them again from `apps/gaia/page/lib/flint/`:

```sh
bun testing/CaptureFlintFrames.ts capture root-readme
```
