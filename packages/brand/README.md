# brand

Forge's mark, drawn once for every app that shows it: the mark as a React component, its colours as tokens of a light and a dark theme,
and the geometry a host's own mark may draw alike. The design system names no app, so the mark lives here; Forge's brand is this
package's subject, and it names no host.

The package stands alone. Its one peer dependency is React; it has no build step and exports TypeScript source.

## What is inside

```
marks/          ForgeMark, beside its stylesheet, its DOM spec (`.dom.tsx`) and its story
constants/      MarkGeometry: the hexagon ring and the scale Forge's mark draws on the 64-unit grid
styles/         tokens.css, every colour of the mark in both themes, and brand.css, the one stylesheet to link
```

## Use the mark

Import the mark by its export name, and link `brand.css` once, before your own stylesheets:

```tsx
import { ForgeMark } from 'brand/ForgeMark';

<ForgeMark title="Double-click to open" onDoubleClick={open} />;
```

```html
<link rel="stylesheet" href="brand/brand.css">
```

- `ForgeMark` is an image named "Forge", 22 px by default. A `title` and an `onDoubleClick` reach the drawing when given.
- The drawing names its gradient and mask with ids of its own, so a host's marks on the same page never fight.
- A host that draws a mark of its own alike imports `MARK_GEOMETRY` from `brand/MarkGeometry`: the same ring, at the same scale.

A page that resolves no package export, such as a static file page, links `styles/brand.css` by its path in `node_modules/brand/`.

## Theming

The light theme is the default on `:root`; `data-theme="dark"` on the `html` element selects the dark one, as the design system reads
it. Every colour is a `--brand-…` token of `styles/tokens.css`, so none meets a token of the host; the mark's stylesheet reads only these
tokens.

## Versions

The package carries its own semantic version and is published on its own. An app depends on it with `workspace:^`, which becomes a
version range on release. A change that only adds (a new mark, a new token, a new optional prop) is a minor version; anything else,
such as a renamed or removed export, prop or token, is a major version. The classes are not public: no app's selector names them.

## Verify

```bash
bun run verify
```

typechecks the package that ships (DOM library only) and its specs, lints, and runs the guard specs and then the mark's DOM spec under
happy-dom.
