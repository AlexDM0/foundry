# design-system

A library of React components with its own theme: the components, their stylesheets, the tokens of the light and the
dark theme, and the fonts. It knows nothing about the page that uses it (the host).

The package stands alone. Its one peer dependency is React. It uses only browser APIs, makes no network call and reads
no browser storage.

**The rules of the package are in [`CONSTITUTION.md`](CONSTITUTION.md). Read it before you change the package.** This
guide shows how to use it.

## What is inside

The components sit in three layers, as in atomic design: `atoms/` (one element, such as `Button`, `View` and `Text`),
`molecules/` (a combination of atoms, such as `Row`, `Card` and `Tag`) and `organisms/` (a larger composition, such
as `Dialog`, `Tabs` and `MultipleChoiceQuestion`). Each component has its stylesheet and its DOM spec beside it.

`constants/Spacing.ts` holds the spacing scale, each step the `--space-<size>` token of `styles/tokens.css`, `utils/`
the helpers that are not components, `@types/` the shared `StateTone`, `styles/` the tokens and the entry stylesheet,
and `fonts/` Inter and Newsreader.

## Lay out a screen

Build a one-off layout from `View`, `Row`, `Card` and `Text` at the call site. Make a new component only when a second
screen needs the same thing, or when it has behaviour of its own.

`View` is a flex column; `Row` is a flex row. Flags align them, and spacing props take a step of the spacing scale,
named for its size in pixels:

```tsx
import { Row }  from 'design-system/Row';
import { Text } from 'design-system/Text';
import { View } from 'design-system/View';

<View gap="twelve" padding="sixteen">
  <Row between centerY>
    <Text typeRole="page" element="h2">Billing</Text>
    <Text typeRole="small" muted>Updated 09:41</Text>
  </Row>
  <Text>Three orders wait for a review.</Text>
</View>;
```

A side wins over an axis, and an axis over all sides: `padding="sixteen" paddingTop="eight"` keeps 16px on three sides.
`divider` draws a hairline between the children, and `wrap` lets a row wrap.

`Card` is a `View` with the card ground, border, radius and padding as defaults. Every `View` prop you pass wins over a
default. A `title` is drawn in the title role; leave it out to put a title of your own in the children:

```tsx
import { Card } from 'design-system/Card';

<Card title="Agents at work" titleElement="h3" gap="eight">
  <Text>Two editors and one reviewer are online.</Text>
</Card>;

<Card decision padding="twelve">
  <Text typeRole="lead" bold>Your decision</Text>
  <Text muted>Apply the suggested edits to the draft?</Text>
</Card>;
```

The ground flags `quiet`, `step` and `decision` exclude each other; `dashed`, `interactive` and `selected` combine with
any of them.

## Write text

`Text` takes one role of the type scale as `typeRole`: `display`, `phase`, `page`, `section`, `title`, `lead`, `body`
(the default), `tab`, `small`, `pill` or `micro`. The flags `bold`, `muted` or `subtle`, `mono`, `struck` and `centered`
change its look. The element is your choice, never the role's: pass `element="h2"` for a heading.

```tsx
<Text typeRole="display" element="h1">Workflow</Text>
<Text typeRole="lead" muted marginBottom="sixteen">Design the steps every order takes.</Text>
<Text typeRole="small" mono>T-142</Text>
```

## Theming

- The light theme is the default. Set `data-theme="dark"` on the `html` element for the dark theme, and
  `data-theme="light"` for the light theme.
- For the theme of the system, read `matchMedia('(prefers-color-scheme: dark)')` and set `data-theme` from it, before
  the first paint.
- Every motion token is `0ms` until you set `data-motion="ready"` on the `html` element. Set it after the first paint,
  so the first render shows its final state at once. Under `prefers-reduced-motion: reduce` every animation stops.
- Every colour, space, radius, type size, shadow and time is a custom property of `styles/tokens.css`. Your own
  stylesheets can read them too.
- An element with `data-state-tone` set to a `StateTone` reads its colours from that tone's row: `--s-fill`,
  `--s-tint`, `--s-ink`, `--s-edge` and `--s-head`. Each tone is named for how it looks: `neutral` (grey), `accent`
  (orange on its tint), `accent-outline` (orange on the surface), `info`, `info-outline` and `info-deep` (teal),
  `success` (green), `error` (the failure crimson), `ink` (the text colour on the wash) and `muted` (faded ink). Map
  the states of your own data to a tone in one place of your app; the shape of a state is a flag of the component:

  ```tsx
  <StateBadge tone="neutral" label="Waiting" dashed dotShape="dashed-ring" />
  <StateBadge tone="ink" label="Done" checked />
  <StateBadge tone="muted" label="Dropped" struck dotShape="ring" palette="quiet" />
  ```

Link the entry stylesheet before your own, so that a rule of yours can change a rule of the package:

```html
<link rel="stylesheet" href="design-system/styles/design-system.css">
<link rel="stylesheet" href="./styles/host.css">
```

A bundler, such as `Bun.build`, puts its imports into one stylesheet.

## Fonts

`fonts/inter/` holds Inter and `fonts/newsreader/` holds Newsreader, both under the SIL Open Font License 1.1. The
`OFL.txt` beside each font is its licence; keep it with the font files.

No stylesheet names the font files. Call `loadDesignSystemFonts` once, in your entry module, before the first render:

```tsx
import { loadDesignSystemFonts } from 'design-system/FontLoader';

loadDesignSystemFonts();
```

It imports the four woff2 files from TypeScript and adds Inter and Newsreader to `document.fonts` with the FontFace
API, each for the latin and the latin-ext range, with `display: swap`. The browser fetches a file only when it draws
text in that font and range. Your bundler must emit an imported `.woff2` as a file and give its address, as
`Bun.build` and Vite do. A stylesheet `url()` would not do: a bundler inlines a small file as a `data:` address, and a
content security policy without `font-src data:` blocks it. In a spec, pass a fake set and a fake `FontFace` factory.

## Use it from a host

Add the folder to the host as a workspace package. In this repository it is `packages/design-system/`: the root
`package.json` sets `"workspaces": ["apps/*", "packages/*"]`, and a host app declares the dependency
`"design-system": "workspace:^"`. `bun install` at the repository root links `node_modules/design-system` to the
folder.

The `exports` map of `package.json` names each entry a host may import: each component, the helpers a host uses,
`StateTone`, `FontLoader` and the entry stylesheet. Import each one by its name, never by a file path:

```tsx
import { Button } from 'design-system/Button';

<Button label="Save" onPress={save} />;
```

Link the entry stylesheet before the host's own stylesheets, so a host rule wins over a package rule of the same
specificity. `Bun.build` resolves the link through the exports too:

```html
<link rel="stylesheet" href="design-system/design-system.css">
```

The classes and keyframes of the package are not public. To reach an element of a component, pass its ref prop, such
as `panelRef` on `SidePanel` or `scrollRef` on `SidePanelBody`; to animate a part of your own, define your own
keyframes:

```tsx
const scroll = useRef<HTMLDivElement>(null);

<SidePanelBody scrollRef={scroll}>{contents}</SidePanelBody>;
```

`FlintSlot` is the one box that the package leaves empty for the host. It draws no sprite. It gives its element through
`slotRef`, and the host puts its sprite in that element:

```tsx
const slot = useRef<HTMLDivElement>(null);

<FlintSlot label="Flint, the example agent" size="100" ground="page" slotRef={slot} />;
```

## Storybook

The package has its own Storybook 10 (React on Vite), configured in `.storybook/`. Each exported component has a story
beside it, `<Component>.stories.tsx`, titled `<Layer>/<Component>`, with a story for each meaningful flag or variant.
The Theme menu of the toolbar sets `data-theme` on the `html` element: light, dark, or auto, which follows the system.

In `packages/design-system/`, run `bun run storybook` to start it on port 6006, or `bun run storybook:build` to build it
into the git-ignored `storybook-static/`. The stories compile with the specs, under `tsconfig.spec.json`, and
`StoryCoverage.spec.ts` holds that every exported component has its story.

## Checks

`bun run typecheck` checks `tsconfig.json` (the DOM library, no Bun or Node types) and `tsconfig.spec.json` (the specs,
with Bun types). The guard specs at the root of the package are listed in the constitution, section 12.

## Split it off

The folder can go to its own repository with no change to a source file:

1. Move `packages/design-system/` to the new repository.
2. Add the devDependencies of the specs to `package.json`: `typescript`, `@types/react`, `@types/bun`,
   `@testing-library/react` and `@happy-dom/global-registrator`, and a preload that registers the DOM for the
   `.dom.tsx` specs.
3. In the host, remove the folder from `workspaces` and point the dependency `design-system` at the new repository
   or a published version instead of `workspace:^`. The host's imports, such as `design-system/Button`, do not change.
4. The host's style guards (`ThemeTokens.spec.ts`, `ReducedMotionStopsEveryAnimation.spec.ts`,
   `HoverMovesNothing.spec.ts` and `StyleBraceBalance.spec.ts`) read the stylesheets of the package. Copy the checks
   of the package's stylesheets into the package before the split.
