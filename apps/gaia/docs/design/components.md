# Components: Gaia's own parts, its tokens and the contrast it holds

Gaia's page is drawn with three libraries under `page/lib/`: the design system (`page/lib/design-system/`, reached through
`DesignSystemInterface.ts`), Flint (`page/lib/flint/`) and the brand (`page/lib/brand/`, Forge's mark). This document holds what
is Gaia's own: the design rules Gaia keeps on top of the library's, Gaia's tokens, the parts in `page/components/` that no library
has, the one place each state reaches a library tone, and the contrast `page/StyleContract.spec.ts` holds. It does not describe a
library component; each library's `README.md` does.

## 1. Principles

The design system's own rules are in `page/lib/design-system/CONSTITUTION.md`: one theme of tokens, composition over
configuration, mono for machine text only, hover and press move nothing, no gradients, no emoji and no shadow beyond the shadow
tokens, every control named. Gaia keeps these besides, in both themes and on every screen:

- **Orange is work, what waits on User, and the one primary button of an area.** A running forge, a builder, a used slot, a
  waiting count, a held forge or one that needs an update, a link and the focus ring are orange. **Teal** is review. **Green** is
  a pass (a landed ticket). **Crimson** is a failure only (a forge that does not answer, a refusal, an error) and is never a
  button. Everything else is graphite.
- **The word stands beside the colour.** A dot, an edge or a tint never carries a meaning alone; every dot Gaia draws is hidden
  from the accessibility tree and its row says the word (3.2).
- **Fill holds, a ring changes, dashed waits.** A filled dot is a state that holds, a ring one that is on its way, a dashed ring
  one that waits (a held forge, a forge that needs an update, an agent that asks User, a missing forge).
- **Hover and press move nothing.** In `gaia.css` a `:hover` or `:active` rule changes only colour, background, border colour, box
  shadow, opacity, outline colour, text decoration or the cursor. `--press-scale` is 1, so a press changes no size (2.2).
- **No shadow at rest.** A hover draws the library's lift ring; a popover and a dialog float on the library's shadow tokens.
- **Mono for machine values:** ids, stamps, durations, counts, figures, paths, versions, model names and contract numbers, with
  tabular figures. Role words are mono capitals.
- **Honest facts.** A value the forge did not report is absent, or "—" in a table cell. A row Gaia only knows as last reported
  says "as last reported" with its stamp as a clock time, and reads at `--stale-opacity`.
- **Sentence case** for titles, buttons, tabs and condition words leading a line ("Launches held"). Section heads are micro-caps.
- **Say what is empty** in the place's own words.
- **"You" only for what waits on User** ("Needs you", "asks you · E2"). Everything else names the part.
- **Drawn shapes only.** No emoji. The shapes are Gaia's mark (3.1), Forge's mark from the brand library, the library's icons and
  dots, and Gaia's own two versions marks, the check and the half-filled dot (3.2).
- **Flint only in the forge route.** Gaia draws Flint, one per forge, only in a forge's own view, and calls no model.

## 2. Tokens

Colour lives only in tokens, in a light value under `:root` and a dark value under `:root[data-theme="dark"]`, which the shell
sets before the first paint. A page links the library's stylesheets first, so Gaia's own tokens come after the library's.

### 2.1 The libraries' tokens

- **The design system's** `page/lib/design-system/styles/tokens.css` holds every colour, space, radius, type size, shadow and time
  Gaia's page reads: the grounds, the inks, the lines, the orange family, the badge tones, the failure tones, the motion tokens
  and `--ease-out`, and the state tone rows (`data-state-tone` sets `--s-fill`, `--s-tint`, `--s-ink`, `--s-edge`). Its
  `README.md` ("Theming") says how to read it. The values are not copied here.
- **The brand's** `page/lib/brand/styles/tokens.css` holds Forge's mark's colours, every one named `--brand-…`, in both themes.
- **The board's** `page/styles/board/tokens.css` holds only the values the board's classes read that the design system does not
  define (the epic slots, the board's pulses, Flint's palette), under the board's own guards (section 4.3).

### 2.2 Gaia's own tokens

`page/styles/tokens.css` holds only what the library lacks. It redefines no library token but `--press-scale`, which the library's
README leaves to its host: Gaia sets it to 1, so a press changes no size. Every token in it is read somewhere: by `gaia.css`, the
splash's own style (`resources/page/loading.html`), a shipping component or another token.

Its colours are the mark's alone, each with a light and a dark value:

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--mark-from` | `#ffffff` | `#343434` | The tile's gradient, its top left |
| `--mark-to` | `#d6d6d6` | `#121212` | The tile's gradient, its bottom right |
| `--mark-rim` | `rgba(0, 0, 0, 0.14)` | `rgba(255, 255, 255, 0.12)` | The tile's rim |
| `--mark-ring` | `#f26100` | `#ff7417` | The orange hexagon ring |
| `--mark-core` | `#2f4a5c` | `#c9dbe6` | The slate core and the node cores |
| `--mark-node-halo` | `#f5a473` | `#d9854c` | Each node's halo |
| `--mark-glow` | `#ff8d42` | `#ff8d42` | The glow on the top left node |
| `--mark-mask-open` | `#ffffff` | `#ffffff` | The mask: what it keeps open |
| `--mark-mask-shut` | `#000000` | `#000000` | The mask: the gaps around the nodes |

The rest are single values, the same in both themes, by family (the values are in the file):

| Family | Tokens | Used for |
| --- | --- | --- |
| Host setting | `--press-scale` (1) | A press changes no size |
| Spacing | `--sp-half` (2 px), `--hairline` (1 px), `--focus-ring-width` (2 px) | Below the library's scale |
| Type | `--fs-figure`, `--line-height-figure`, `--fs-wordmark`, `--line-height-wordmark`, `--fs-splash`, `--line-height-splash`, `--weight-figure`, `--weight-label`, `--weight-wordmark`, `--wordmark-tracking`, `--weight-strong` | The figure, the wordmark (20/24, 650, -0.035em) and the splash's wordmark (60/64) |
| Dots and marks | `--condition-dot-size` (8 px), `--dot-ring-width` (1.5 px), `--versions-mark-size` (10 px), `--versions-check-stroke-width`, `--line-height-versions-line`, `--versions-pair-name-width` | The half dot, the versions marks and the versions pair |
| Edges | `--selected-edge-width` (3 px), `--banner-edge-width` (4 px) | A selected row's inset edge; a banner's left edge |
| Brand bar | `--brand-bar-height` (52 px), `--brand-bar-start-padding` (22 px), `--brand-bar-end-padding` (20 px), `--brand-bar-divider-height` (18 px), `--wordmark-gap` (9 px) | 3.4 |
| Splash | `--splash-stack-gap` | The splash's stack |
| Rail | `--rail-width` (232 px), `--rail-section-gap`, `--rail-inset`, `--rail-row-height` (30 px), `--rail-machine-gap` | The rail |
| Forge view | `--forge-bar-height` (56 px), `--forge-frame-notice-width`, `--forge-bar-update-refusal-width` | A forge's bar and its notices |
| Views | `--view-side-width`, `--activity-…`, `--agents-…`, `--fs-agents-role`, `--weight-agents-role`, `--fs-agents-panel-kind`, `--line-height-agents-last-line`, `--forges-…`, `--attention-…` | Each view's columns, rows and side widths |
| Stale | `--stale-opacity` (0.62) | A row shown as last reported: it can be read, not acted on |

### 2.3 Gaia's stylesheet

`page/styles/gaia.css` reads only tokens the library's or Gaia's `tokens.css` defines and holds no colour value, no named colour
and no keyframe of its own (it names the library's). It styles exactly the classes Gaia's components emit, all `gaia-`, and never
a library class. A variant is a `data-*` attribute on the component's class, never a class of its own.

### 2.4 From the design's token names to the library's

The design named its colours its own way. The library names them as below; `page/StyleContract.spec.ts` checks the design's text
pairs in the library's names (section 4).

| Design's name | Library name | What it is |
| --- | --- | --- |
| `--ground` | `--bg` | The page, the rail, the splash |
| `--surface` | `--surface` | Cards, tables, buttons, fields |
| `--lane` | `--lane-bg` | Sunken grounds |
| `--wash` | `--wash` | Hover, a selected row, a neutral pill (ink 5%) |
| `--ink` | `--ink` | Text |
| `--ink-2` (ink 72%) | `--ink-muted` | Leads and secondary text |
| `--ink-3` (ink 68%) | `--ink-4` | Micro-caps, meta, stamps |
| `--ink-off` (ink 45%) | `--ink-disabled` | Disabled text |
| `--hair`, `--strong` | `--line`, `--line-strong` | Hairlines; card and control borders, dashed waits |
| `--neutral` | `--neutral-fill` | A paused forge, a waiting job |
| `--or` | `--signal` | The running dot, a builder, a used slot |
| `--or-button`, `--or-button-ink` | `--button`, `--accent-ink-on` | The primary button's ground and text |
| `--or-text`, `--or-tint`, `--or-edge` | `--link`, `--link-tint`, `--accent-edge` | Orange text, its tint, its edge |
| `--teal`, `--teal-ink`, `--teal-tint` | `--tone-info`, `--badge-info-ink`, `--badge-info-tint` | Review |
| `--pass`, `--pass-ink`, `--pass-tint` | `--tone-success`, `--badge-success-ink`, `--badge-success-tint` | A pass, a landing |
| `--fail`, `--fail-ink`, `--fail-tint`, `--fail-edge` | `--err-fill`, `--err-ink`, `--err-tint`, `--err-edge` | A failure |
| A disabled primary (`--wash`, `--ink-3`) | `--primary-disabled-fill`, `--primary-disabled-ink` | A disabled primary button |
| `--mark-*` | Gaia's own `--mark-*` (2.2) and the brand's `--brand-*` | The marks |

## 3. Components

`page/components/` holds only Gaia's own parts: those no library has (Gaia's mark, the brand bar, the callout's body, the list
card) and Gaia's words around a library part (the refusal around the failed action). Each is hook-free, composed from the
libraries through their interface files, imports no shell, view or board (`page/PageImportDirection.spec.ts`), and has a spec
beside it that reads the props it hands a library part, never the markup the library draws. A state reaches a library component as
a state tone mapped in one place: `ConditionDot`, `RoleDot`, `VersionsVerdictMark` and `FigureLookUtil` (3.2).

Where a part of the design is now a library part, Gaia uses the library's:

| Design's part | Now |
| --- | --- |
| `Button`, `SegmentedControl`, `Stepper`, `Checkbox` (its switch), `TextField`, `Dialog`, `DataTable`, `FactList`, `PendingStep`, `ThemeCycleButton`, `SlotMeter`, `CountBadge`, `Figure`, `MicroCapsLabel`, `Banner` | The library's part of the same name (the switch is `Switch`; the stepper `NumberStepper` or `Stepper`) |
| `Pill` | `StateBadge` or `StatePill` in a state tone |
| `Meter` | `FillMeter` |
| `PageTitle` | `PageHead` |
| `ConfirmPanel` | `ConfirmStrip` |
| `Refusal` | Gaia's `Refusal` (3.4) around the library's `FailedAction` |
| `Callout` | Gaia's `Callout` (3.4) around the library's `Callout` |
| `ConditionDot`, `RoleDot` | Gaia's maps (3.2) onto the library's `StateDot` |

### 3.1 Marks

**Gaia's mark** (`page/components/GaiaMark.tsx`) is the constellation: on a 64-unit grid, a tile of radius 13 with the
`--mark-from` to `--mark-to` gradient and a `--mark-rim` rim, holding a rounded hexagon ring in `--mark-ring`, opened by a mask
around three nodes (top left, right, bottom left), about a hexagon core in `--mark-core`. The ring's path and its scale about the
tile's centre are the brand library's `MARK_GEOMETRY` (`hexagonRingPath`, `scaleAboutCentreTransform`), so Gaia's mark and Forge's
draw the same ring.

It has two drawings, chosen by size against `SMALL_DRAWING_BELOW_SIZE_PIXELS` (24):

- **Large** (24 px and up): a ring of stroke 3; each node a `--mark-node-halo` halo at 22% fill over a `--mark-core` core; a
  blurred `--mark-glow` circle at 22% on the top left node.
- **Small** (below 24 px): a ring of stroke 5.8 under a tighter mask, a larger core and three solid `--mark-core` nodes, with no
  halo and no glow, since those blur into the tile when small.

It is `aria-hidden`; the link around it carries the name. Each drawing names its gradient, mask and filter with ids of its own.
Sizes:

| Where | Size | Drawing |
| --- | --- | --- |
| The brand bar (3.4) | 28 px, the default | Large |
| The splash, `resources/page/loading.html` (`SPLASH_MARK_SIZE_PIXELS` in `page/testing/ArtboardScreens.tsx`) | 88 px | Large |
| A window bar, as `GaiaMark.spec.tsx` draws it | 22 px | Small |

The splash links no `gaia.css`, so it carries the mark's markup and the mark's rules in its own style. The app's icon is
`resources/app-bundle/Gaia.icns`. The rail draws no mark; it leaves the mark to the brand bar (`page/shell/Rail.spec.tsx`).

**Forge's mark** is the brand library's `ForgeMark` (`page/lib/brand/BrandInterface.ts`), coloured by its `--brand-…` tokens: an
image named "Forge", 22 px by default, taking an optional `title` and `onDoubleClick`. Gaia draws it at 22 px in a forge's bar
(`page/views/forge/ForgeLayout.tsx`) and at 28 px in the board's header (`page/board/shell/Header.tsx`).

### 3.2 State parts

Each maps a state to the library's `StateDot` in a state tone and a shape, in one place. The tones, as the library names them:
`accent` orange, `info` teal, `success` green, `error` crimson, `neutral` grey, `muted` faded ink. The shapes: `solid` (fill
holds), `ring` (changes), `dashed-ring` (waits). The library draws the dot hidden from the accessibility tree.

**`ConditionDot`** (`page/components/ConditionDot.tsx`, `CONDITION_LOOKS`): a forge's condition as its 8 px dot.

| Condition | Tone | Shape | Word beside it (3.3) |
| --- | --- | --- | --- |
| `live` | `accent` | `solid` | live |
| `starting` | `accent` | `ring` | starting |
| `held` | `accent` | `dashed-ring` | launches held |
| `outdated` | `accent` | `dashed-ring` | needs update |
| `paused` | `neutral` | `solid` | paused |
| `unreachable` | `error` | `solid` | unreachable |
| `dormant` | `muted` | `ring` | dormant |
| `unreadable` | `muted` | `dashed-ring` | not readable |
| `missing` | `muted` | `dashed-ring` | repository missing |

A shown condition that has no dot of its own borrows one (`ForgeTextUtil.dotConditionOf`): `restarting` draws `starting`;
`crashed`, `down` and `hung` draw `unreachable`. Their words tell them apart.

**`RoleDot`** (`page/components/RoleDot.tsx`, `ROLE_LOOKS`): what an agent or an activity entry is. It pulses only when asked to
(`pulsing`), while the work it stands for is under way.

| Role | Tone | Shape | Word beside it (3.3) |
| --- | --- | --- | --- |
| `builder` | `accent` | `solid` | builder |
| `reviewer` | `info` | `solid` | reviewer |
| `needs-user` | `accent` | `dashed-ring` | asks; in Activity "Needs you" |
| `waiting` | `neutral` | `dashed-ring` | the agent's state |
| `landed` | `success` | `solid` | Landed |
| `forge` | `neutral` | `solid` | Forge |

An agent that asks User a question is `needs-user` before anything else; one that waits on anything else is `waiting`; otherwise
its role gives the dot, and a role other than builder or reviewer draws none (`page/views/agents/AgentsModel.ts`).

**`VersionsVerdictMark`** (`page/components/VersionsVerdictMark.tsx`): a forge's versions verdict against the forge version this
Gaia is built for, as a 10 px mark hidden from the accessibility tree. `VersionsVerdictLabel` sets the mark before its word, with
a `data-verdict` rule of its own in `gaia.css`.

| Verdict | Mark | Word's ink |
| --- | --- | --- |
| `current` | Gaia's own check, stroked in the word's colour | `--ink` |
| `ahead` | Gaia's own half-filled 8 px dot in `--ink-muted` | `--ink` |
| `newer` | `StateDot`, `muted`, `dashed-ring` (it waits on a newer Gaia) | `--ink-muted` |
| `older` | `StateDot`, `accent`, `dashed-ring` (it waits on User's update) | `--link`, orange |

**`FigureLookUtil`** (`page/shared/utils/FigureLookUtil.ts`): a figure that waits on User or stands at a limit takes the `accent`
tone, every other figure none. `pageHeadFiguresOf` hands a page head's figures to the library's `PageHead` this way.

### 3.3 Condition and role words

The words beside the dots, as the code writes them. A forge's condition (`page/shared/utils/ForgeTextUtil.ts`), in lower case in a
row and in sentence case when it leads a line or heads a cell ("Launches held"): live, paused, launches held, restarting,
starting, dormant, unreachable, not readable, repository missing, needs update, crashed, down, stopped supervising. The
unreachable callout's word is "Unreachable".

A role word is mono capitals: the forge's role (builder, reviewer), else the job's kind, and "asks" while the job waits on User's
decision (`page/views/attention/AttentionModel.ts`). Builder and asks take `--link`, reviewer the teal ink, any other the muted
ink. Activity's categories are "Needs you", "Landed", "Agent" and "Forge" (`page/views/activity/ActivityModel.ts`).

### 3.4 Gaia's own parts

| Part | What it is | Variants | Composes |
| --- | --- | --- | --- |
| `BrandBar` | The 52 px bar across Gaia's window: Gaia's mark (28) and the wordmark "gaia" as one link to `#attention`, named "Gaia, Attention"; a 1 × 18 `--line-strong` divider; the fleet's status pill; its sentence in `--ink-muted`, cut with an ellipsis; at the far end the theme button. A hairline under it, on `--bg`. | `status`: running (an `accent` pill with a pulsing dot, such as "4 forges running"), dormant (a `neutral` pill with a ring dot), or `null` before Gaia knows the fleet (no pill, no sentence). `themeButton`: given, or `null` in the forge route (`page/shell/GaiaApp.tsx`). | `GaiaMark`; the library's `StateBadge`, `ThemeCycleButton` and `ThemeCycleUtil`. The theme button's name says the current choice and the next: "Theme: auto. Switch to light". |
| `Callout` | A forge-level condition: a title line (the forge's dot, its name in 600, its word), one sentence or a status in its place, then either a mono machine line in `--ink-muted` or a versions line, and the actions at the end. A `section` named "<title>: <word>". | `warn` (held; the library's warn callout, tinted, the word in `--link`), `error` (unreachable; the library's error callout, the word in `--err-ink`), `neutral` (what is only incomplete or only explains; the library's dashed callout, the word in `--ink-muted`). | The library's `Callout`; a `ConditionDot` handed as `dot`. Used on Attention and in a forge's presence view. |
| `ListCard` | Rows inside one bordered card (`--line-strong`, `--r-3`, `--surface`), a hairline between each; a `ul` named by its `label`. | None of its own; Attention's waiting list gives the row holding its primary item an inset 3 px `--signal` edge in its own rule. | Nothing; Gaia's own markup. |
| `Refusal` | A refusal beside the control that caused it: "The forge refused <command>: " or, when Gaia refused or nothing answered, "Gaia could not <command>: ", then the code in mono and the sentence unedited, a compact "Try again" when the command can be sent again, and a dismiss button named "Dismiss this refusal". An alert, read out when it appears. Never a red button. | `refusedBy`: `forge` or `gaia`; with or without `onTryAgain`. | The library's `FailedAction`. |

`ConditionDot`, `RoleDot` and `VersionsVerdictMark` are in 3.2.

## 4. Contrast

`page/StyleContract.spec.ts` reads the library's `tokens.css` and Gaia's together, as the page links them (the library's first),
and computes each ratio from the token values; nothing states a ratio by hand. Every pair is a WCAG 2 text pair, checked in the
light theme (`:root`) and the dark theme (`:root` with `:root[data-theme="dark"]` over it), with the same pairs in both.

### 4.1 How a pair is read

- A token that reads another (`var(--…)`) is followed to its value.
- A colour is read as hex, `rgb()`, `rgba()` or `oklch()`; any other form fails the check as unreadable rather than guessed.
- A translucent text or ground is laid over the ground beneath it, from the opaque bottom up, before the ratio is taken. The last
  ground of a pair must be opaque. So `--ink-muted` (ink at 72%) on `--wash` over `--surface` is the wash composited on the
  surface, then the ink on that.
- A missing token fails the check.

### 4.2 The pairs

Floor 4.5:1 unless named otherwise. "on A over B" means A composited over B.

| Text | Ground | Floor |
| --- | --- | --- |
| `--ink`, `--ink-muted`, `--ink-4` | `--bg` | 4.5 |
| `--ink`, `--ink-muted`, `--ink-4` | `--surface` | 4.5 |
| `--ink`, `--ink-muted`, `--ink-4` | `--lane-bg` | 4.5 |
| `--ink`, `--ink-muted`, `--ink-4` | `--wash` over `--surface` | 4.5 |
| `--ink`, `--ink-muted`, `--ink-4` | `--wash` over `--bg` | 4.5 |
| `--link` | `--bg`, `--surface`, `--lane-bg` | 4.5 |
| `--link` | `--wash` over `--surface` | 4.5 |
| `--link` | `--link-tint` | 4.5 |
| `--ink`, `--ink-muted` | `--link-tint` | 4.5 |
| `--badge-info-ink` | `--badge-info-tint`, `--surface` | 4.5 |
| `--badge-success-ink` | `--badge-success-tint`, `--surface` | 4.5 |
| `--err-ink` | `--err-tint` over `--surface`, `--err-tint` over `--bg` | 4.5 |
| `--err-ink` | `--surface`, `--bg` | 4.5 |
| `--primary-disabled-ink` | `--primary-disabled-fill` over `--surface` | 4.5 |
| `--bg` | `--ink` | 4.5 |
| `--accent-ink-on` | `--button` (the primary button) | **3** |

**The primary button is the one exception.** White on Forge's orange is under 4.5:1 in both themes, and the owner accepted it on
2026-11-13 ("Keep Forge's orange"). The spec holds it at 3:1, so a further drop still fails, and a second test proves it is the
only pair under 4.5:1: run at 4.5 throughout, exactly the button's light and dark pair fail.

Not checked as text pairs: disabled text (`--ink-disabled`), which is not in the list; the non-text marks (dots, rings, meters,
borders), whose meaning never rests on colour alone, since every dot has its word and every control its label.

### 4.3 The board's pairs

The board's views under `page/board/` are styled by `page/styles/board/*.css` and checked against the library's, Gaia's and the
board's tokens together, at 4.5:1 in both themes: the refusal's `--err-ink` on `--bg` and `--surface`; a chip's, a card's and a
chat bubble's `--ink`, `--ink-muted` and `--ink-4` on `--surface` and on `--wash` over `--surface`; `--link` on `--surface` and on
`--link-tint` over `--surface`, and `--ink` on that tint; each of the six epic slots' ink on its tint over `--surface`; a warning
card's `--warn-ink` and a failed tool call's `--err-ink` on their tints over `--surface`. The board's other guards are in
`page/testing/BoardStyleGuards.ts`.

### 4.4 What else the style contract holds

- Gaia's `tokens.css` redefines no library token but `--press-scale`.
- Every colour token of Gaia's `tokens.css` has a light and a dark value, and no dark value lacks a light one.
- Every token of Gaia's `tokens.css` is read by `gaia.css`, the splash, a shipping component or another token.
- `gaia.css` holds no colour value or named colour, and reads only tokens a `tokens.css` defines.
- No `:hover` or `:active` rule in `gaia.css` sets a property that may size or place a box.
- Every class a shipping component outside `page/lib/` and `page/board/` emits is styled in `gaia.css`, and every class styled
  there is emitted; a `className` must be a literal the scan can read.
- One rule hides every label read only by a screen reader.
- Motion in `gaia.css` and the splash: every transition and animation is timed by a library motion token and eased by
  `--ease-out`, and animates, starts from or keyframes no size or place.
- An animation is a live signal only: it runs under `:root[data-motion="ready"]`, stops under reduced motion and repeats; a part
  that appears fades in by a `@starting-style` transition. Gaia defines no keyframe; it names the library's.
- Every motion token Gaia reads is zeroed by the library before motion is ready and under reduced motion.
- The board: its stylesheets are exactly those `BOARD_STYLESHEETS` lists; its classes are `board-` and styled and emitted both
  ways; no hover or press moves anything; every animation has a winning reduced-motion rule; braces balance; only defined tokens
  and no colour value; each literal colour token has a dark value, but those the same in both themes (Flint's palette), set once
  in the light block; no `gaia-` board class and no `board-` Gaia class; every board keyframe is `board-` and only in a board
  stylesheet.
- Every guard is first proved on a planted case, in memory.
