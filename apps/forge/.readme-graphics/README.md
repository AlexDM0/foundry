# README graphics

What renders the diagrams in `docs/images/`. This folder owns `docs/images/` and nothing else. `docs/figures/` holds
the PNGs the remaining documents use, and no script here touches them. A figure that was drawn again keeps its SVG
source beside its PNG; it is rendered with the same renderer and the same card mask as the diagrams here.

## Requirements

Python 3 with Pillow and the `diagrams` skill's renderer at `~/.claude/skills/diagrams/scripts/render.py` (qlmanage
on macOS).

## Files

| file | what it does |
|---|---|
| `render-diagrams.py` | Re-renders `lifecycle`, `architecture`, `terminal-setup` and `terminal-init` from their SVGs in `docs/images/` and clears the corners outside each card. Only after editing an SVG. |

## What is not generated

- **The two terminal windows** (`terminal-setup.svg`, `terminal-init.svg`) are the real output of
  `./setup.sh` and `agent-progress init` with home paths shortened, typed into the SVG by hand. When either
  command's output changes, edit the text in the SVG and run `python3 .readme-graphics/render-diagrams.py
  terminal-setup` (or `terminal-init`).
- **The lifecycle and architecture diagrams** describe the mechanism; edit the SVG when the mechanism changes, then
  `render-diagrams.py`.
- **The icon** is `docs/images/icon.svg` with its raster `icon.png` beside it.
- **The words on the READMEs** are written by hand.

## The images and what each shows

| file | shows |
|---|---|
| `icon.png` | Light rounded square with a graphite hexagon and an orange electron at its upper right corner. |
| `lifecycle.png`, `architecture.png` | The two diagrams (SVG sources beside them). |
| `terminal-setup.png`, `terminal-init.png` | `./setup.sh` and `agent-progress init` in a terminal window. |
