# brand

Forge's mark, drawn once for every app that shows it: the mark as a React component, its colours as tokens of a light and a dark theme,
and the geometry a host's own mark may draw alike. The design system names no app, so the mark lives here; Forge's brand is this
library's subject, and it names no host.

It is a library of its host's page: a folder with no manifest, whose only door for code is its interface file, `BrandInterface.ts`. It
imports nothing outside its folder but React, has no build step and is TypeScript source; its host's scripts run its tooling.

## What is inside

```
BrandInterface.ts  the one module code outside the library imports: `ForgeMark`, its props and `MARK_GEOMETRY`
marks/          ForgeMark, beside its stylesheet, its DOM spec (`.dom.tsx`) and its story
constants/      MarkGeometry: the hexagon ring and the scale Forge's mark draws on the 64-unit grid
styles/         tokens.css, every colour of the mark in both themes, and brand.css, the one stylesheet to link
```

## Use the mark

Import the mark from the interface file by a relative path, and link `styles/brand.css` once, before your own stylesheets:

```tsx
import { ForgeMark } from './lib/brand/BrandInterface.ts';

<ForgeMark title="Double-click to open" onDoubleClick={open} />;
```

```html
<link rel="stylesheet" href="./lib/brand/styles/brand.css">
```

- `ForgeMark` is an image named "Forge", 22 px by default. A `title` and an `onDoubleClick` reach the drawing when given.
- The drawing names its gradient and mask with ids of its own, so a host's marks on the same page never fight.
- A host that draws a mark of its own alike imports `MARK_GEOMETRY` from the interface file: the same ring, at the same scale.

`styles/brand.css` is the one file a page links by its path; every other file is reached through the interface file or not at all.
Inside the library a file imports the module it needs, never the interface file.

## Theming

The light theme is the default on `:root`; `data-theme="dark"` on the `html` element selects the dark one, as the design system reads
it. Every colour is a `--brand-…` token of `styles/tokens.css`, so none meets a token of the host; the mark's stylesheet reads only these
tokens.

## What is public

The interface file's exports, the `--brand-…` tokens and `styles/brand.css`. The classes are not public: no selector outside the library
names them.

## Verify

The host's scripts run the library's tooling: its two TypeScript projects (`tsconfig.json`, the library that ships on the DOM library
only, and `tsconfig.spec.json`, its specs), ESLint from this folder under `eslint.config.js`, the architecture tests in `architecture/`
under `test:architecture`, and the mark's DOM spec under happy-dom through `testing/RunDomSpecs.ts`. Its Storybook runs with
`--config-dir` on `.storybook/`.
