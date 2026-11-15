# brand

Gaia's and Forge's marks, drawn once for every app that shows them: the marks as React components, their colours as tokens of a light
and a dark theme, and the logo's source drawings. The design system names no app, so the marks live here; the two brand names are this
package's subject.

The package stands alone. Its one peer dependency is React; it has no build step and exports TypeScript source.

## What is inside

```
marks/          GaiaMark and ForgeMark, each beside its stylesheet, its DOM spec (`.dom.tsx`) and its story
constants/      MarkGeometry: the hexagon ring and the scale both marks draw alike on the 64-unit grid
styles/         tokens.css, every colour of the marks in both themes, and brand.css, the one stylesheet to link
assets/         icon.svg, the app icon's drawing at 512 px, and logo/, the mark in light and dark at 16 and 96 px
```

## Use the marks

Import each mark by its export name, and link `brand.css` once, before your own stylesheets:

```tsx
import { ForgeMark } from 'brand/ForgeMark';
import { GaiaMark }  from 'brand/GaiaMark';

<GaiaMark sizePixels={28} />;
<ForgeMark title="Double-click to open" onDoubleClick={open} />;
```

```html
<link rel="stylesheet" href="brand/brand.css">
```

- `GaiaMark` is decoration, hidden from the accessibility tree: the name beside it carries the meaning. It is 28 px by default. Below
  `SMALL_DRAWING_BELOW_SIZE_PIXELS` (24 px) it draws its small drawing, a thicker ring and solid nodes with no halo or glow, which still
  reads where the large drawing's thin ring would blur.
- `ForgeMark` is an image named "Forge", 22 px by default. A `title` and an `onDoubleClick` reach the drawing when given.
- Each drawing names its gradient, mask and filter with ids of its own, so several marks on one page never fight.

A page that resolves no package export, such as a static file page, links `styles/brand.css` by its path in `node_modules/brand/`.

## Theming

The light theme is the default on `:root`; `data-theme="dark"` on the `html` element selects the dark one, as the design system reads
it. Every colour is a `--brand-…` token of `styles/tokens.css`, so none meets a token of the host; a mark's stylesheet reads only these
tokens.

## The macOS app icon

`Gaia.icns` stays a resource of the app that installs it; it is made from this package's drawings. Render each image of a
`Gaia.iconset` folder at its pixel size: `icon_16x16.png`, `icon_16x16@2x.png` and `icon_32x32.png` (16 and 32 px) from the small
drawing, `assets/logo/gaia-mark-light-16.svg`, and every larger image (64 px to 1024 px) from `assets/icon.svg`. Then run
`iconutil --convert icns Gaia.iconset --output Gaia.icns`. Redraw the icon whenever a drawing changes.

## Versions

The package carries its own semantic version and is published on its own. An app depends on it with `workspace:^`, which becomes a
version range on release. A change that only adds (a new mark, a new token, a new optional prop) is a minor version; anything else,
such as a renamed or removed export, prop or token, is a major version. The classes are not public: no app's selector names them.

## Verify

```bash
bun run verify
```

typechecks the package that ships (DOM library only) and its specs, lints, and runs the guard specs and then the marks' DOM specs under
happy-dom.
