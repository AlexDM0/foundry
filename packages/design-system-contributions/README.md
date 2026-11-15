# design-system-contributions

Components staged to join the design-system package, built under its constitution ([`CONSTITUTION.md`](CONSTITUTION.md)), which
holds here in full. They read only the design-system package's tokens and compose its components, imported by their export names. When
they move into that package, each file moves unchanged but for those imports, which become relative.

The package has its own version and is published on its own; a host depends on it by a version range.

## What is inside

| Layer | Export | What it is |
| --- | --- | --- |
| atoms | `TextField` | A 36px text field inside its label, in the interface or the mono face; its label may be hidden |
| atoms | `Checkbox` | A checkbox inside its label, with an optional second line of explanation |
| atoms | `Figure` | A mono value and its words with a hairline, stacked or inline, its value coloured by a `StateTone` |
| molecules | `PageHead` | A page's display title, its lead, a row of figures and its actions |
| molecules | `FailedAction` | An action that failed: an optional lead, an optional code in mono, its sentence, retry and dismiss |
| molecules | `PendingStep` | A step still to take after an action succeeded: its word, its sentence, the control that takes it, dismiss |
| molecules | `ThemeCycleButton` | An icon button that steps the theme choice from auto to light to dark |
| organisms | `DataTable` | A table drawn as a grid per row in a card, with selected, interactive and expanded rows |

`ThemeChoice` is the type of a theme choice, and `ThemeCycleUtil.nextChoiceOf` the step the button takes, so a host can word the
button's name: the current choice and the next.

## Use it from a host

Depend on the package and on the design-system package, then link the design-system package's entry stylesheet first, this package's
next and the host's own last, so a host rule wins over a package rule of the same specificity:

```html
<link rel="stylesheet" href="design-system/design-system.css">
<link rel="stylesheet" href="design-system-contributions/design-system-contributions.css">
<link rel="stylesheet" href="./styles/host.css">
```

Import each component by its export name, and pass every word in:

```tsx
import { FailedAction } from 'design-system-contributions/FailedAction';

<FailedAction lead="Saving failed: " code="disk-full" sentence="The disk is full." retryLabel="Try again" onRetry={save} />;
```

## Storybook

`bun run storybook` starts the package's Storybook on port 6007; `bun run storybook:build` builds it into the git-ignored
`storybook-static/design-system-contributions/` at the workspace root, outside the folder the guards read. The Theme menu of the
toolbar sets `data-theme` on the `html` element: light, dark, or auto.

## Checks

`bun run verify` runs the typecheck of `tsconfig.json` (the DOM library, no Bun or Node types) and `tsconfig.spec.json`, the lint,
the guard specs and the DOM specs, which `testing/RunDomSpecs.ts` runs under happy-dom. The guards are the design-system package's,
adapted to this folder, and `MotionAndTokens.spec.ts`, which holds that every value read is a token of the design-system package and
that motion is gated and moves nothing.
