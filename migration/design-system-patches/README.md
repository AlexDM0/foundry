# Patches for forge's design-system package

Ready changes to forge's `design-system` package for what Gaia needs of forge's own components, one patch per change, numbered
in apply order. They are written against the package folder, so after the monorepo merge they apply from the repository root as
a series:

```bash
git am --directory=packages/design-system migration/design-system-patches/*.patch
```

or, without commits, `git apply --directory=packages/design-system <patch>` one by one in order. Each patch adds a DOM spec case
and a story for each new prop or variant, and keeps the package's constitution: no host word, a variant is a `data-*` attribute,
colours and spaces are tokens. The requirement numbers are the entries of Gaia's design-system requirements list (the v2 build's
`gaia-v2-design-system-requirements.md`). Gaia's paths below are under `apps/gaia/`.

## Made against

Forge worktree `graphite-orange-handoff-ebd9dc`, commit `7784bd61` plus its uncommitted work as it stood on 2026-11-15; the
package's `package.json` says version `0.1.0`. The package is still moving: each patch's `index` lines carry the full git blob
hash of every file it touches, before and after, and each section below lists the first 12 characters of the hash each file has
right before that patch (for a file an earlier patch also touches, its hash after that patch). Before applying, check the series
against the package folder:

```bash
bun migration/design-system-patches/CheckPatches.ts packages/design-system
```

It says per patch whether it applies, is applied already, is stale (a file it touches changed since; make it again against the
new source) or waits on an earlier patch that does not apply. Its spec holds this README to the patches' hashes. Forge kept
reworking the package after this snapshot (motion tokens, and hooks in `CountBadge` and `NumberStepper`), so expect the check to
name stale patches until that work lands; make those again against the landed source. Against forge's live uncommitted package,
patches 05, 06, 07, 08, 09, 11, 13 and 14 are stale. They stay here as written: once forge commits its design-system work, each is
made again against the committed source and checked with `CheckPatches.ts` before the series applies.

After every patch in order, and after the whole series on an untouched copy, the package's checks pass: both typechecks
(`tsconfig.json`, `tsconfig.spec.json`), its specs, its DOM specs under happy-dom, and forge's lint of the package.

## Versioning

Every change adds an optional prop, a member to a union a caller passes, or a token, and widens two `count` props from `number` to
`number | string`. Nothing a caller passes today stops compiling or changes its look, except where a patch says so. Under the
owner's rule that is a minor bump: `0.1.0` to `0.2.0` once the series lands. A host that maps every member of `IconName`,
`StateTone`, `StateDotShape`, `CalloutTone` or `CountBadgeTone` in an exhaustive record must add the new members; forge's Bridge
only passes values of them (read, not compiled).

## The patches

### 01-callout-tones-and-actions.patch

- **Answers:** 5 (the Callout half: an error tone), 17 (an error tone), 38.
- **Change:** `Callout` takes `tone="error"` (the failure tint, a 4 px left edge), `tone="warn" tinted` (the warn tint, a 4 px
  left edge), `tone="neutral"` and `tone="neutral" dashed` (the surface with a strong hairline, dashed), and `actions`, drawn at
  the end of its line beside its title and contents. `tinted` compiles only with `warn`, `dashed` only with `neutral`. The
  existing `state` and `warn` looks are unchanged.
- **Gaia switches over:** `page/views/attention/AttentionLayout.tsx` (the Attention callouts) and
  `page/views/forge-frame/ForgeFrameLayout.tsx` (the held banner and Not found notice), through Gaia's `Callout`.
- **Gaia deletes after:** in `page/design-system/Callout.tsx` the `CalloutFrame` built on `Banner` and a dashed `Card`; Gaia's
  `Callout` keeps only its body (the title line with the dot, name and word, the sentence, the machine line) inside the package
  `Callout`. `.gaia-callout-actions` in `page/styles/gaia.css` goes.
- **Made against:** `molecules/Callout.css` `b29a236892ec`, `molecules/Callout.dom.tsx` `29b04c6bad6f`,
  `molecules/Callout.stories.tsx` `d44ecec16ef7`, `molecules/Callout.tsx` `ac6fc5bb0e6f`.

### 02-button-trailing-glyph.patch

- **Answers:** 9.
- **Change:** `Button` takes `trailing`, a glyph after the label, on a button and on a link drawn as one, as `leading` comes
  before it.
- **Gaia switches over:** "Open in new tab" in `page/views/attention/AttentionLayout.tsx` and
  `page/views/forge-frame/ForgeFrameLayout.tsx` puts its arrow after the words; Stop takes its down caret.
- **Gaia deletes after:** nothing on its own; with 03, see there.
- **Made against:** `atoms/Button.dom.tsx` `a4e798c54bf6`, `atoms/Button.stories.tsx` `39185d48fb40`, `atoms/Button.tsx`
  `5ffb56412134`.

### 03-icon-arrow-caret-and-chevrons.patch

- **Answers:** 39.
- **Change:** `Icon` draws `arrow-out-of-square` (the open-in-new-tab arrow), `caret-down` (a small filled triangle) and
  `chevron-down` and `chevron-up`. Each name says what is drawn, as the constitution asks, not what it stands for.
- **Gaia switches over:** the "Open in new tab" buttons and icon action (`AttentionLayout.tsx`, `ForgeFrameLayout.tsx`,
  `page/views/forges/ForgesLayout.tsx`), Stop's caret, Activity's "N more" mark (`page/views/activity/ActivityView.tsx`) and the
  Forges fold's chevron. An `Icon` fills its holder, so Gaia holds it in a sized span (13 px in a compact button).
- **Gaia deletes after:** `page/design-system/OpenInNewTabGlyph.tsx`, `.gaia-open-in-new-tab-glyph`, the inline
  `.gaia-activity-menu-mark` drawing, and the fold's `::after` chevron once its summary holds an `Icon`.
- **Made against:** `atoms/Icon.css` `05a711c38436`, `atoms/Icon.dom.tsx` `4a2f11765f94`, `atoms/Icon.stories.tsx`
  `d9443db69d33`, `atoms/Icon.tsx` `d47e9685d5cc`.

### 04-state-dot-diamond.patch

- **Answers:** 25.
- **Change:** `StateDotShape` gains `diamond`: the ring's square turned 45 degrees at 85%, in the tone's fill, so
  `<StateDot tone="accent" shape="diamond" small />` is the brain's mark and `tone="neutral"` its ended one. `StateBadge` draws the
  shape too, since it shares the type. The design's 1 px corner is left out: the package's radii hold no 1 px step.
- **Gaia switches over:** `page/design-system/RoleDot.tsx` (the `brain` role becomes a look like the others),
  `page/design-system/BrainChip.tsx`, `page/views/agents/AgentsTable.tsx`, `page/views/agents/BrainPanel.tsx`,
  `page/views/forges/ForgesLayout.tsx`, `page/views/activity/ActivityView.tsx`, `page/views/attention/AttentionLayout.tsx`.
- **Gaia deletes after:** `page/design-system/BrainDiamond.tsx`, `.gaia-brain-diamond` and the `--brain-diamond-*` tokens.
- **Made against:** `@types/StateTone.ts` `df7432972b8a`, `atoms/StateBadge.css` `67a5e5c7acf6`, `atoms/StateBadge.dom.tsx`
  `d10011e73fdf`, `atoms/StateBadge.stories.tsx` `e542698324f0`, `atoms/StateDot.css` `363930a99bea`, `atoms/StateDot.dom.tsx`
  `1b28edde444e`, `atoms/StateDot.stories.tsx` `3a39869c8fb3`, `atoms/StateDot.tsx` `50e755f3b2d4`.

### 05-confirm-strip-choices.patch

- **Answers:** 21.
- **Change:** `ConfirmStrip` takes `choices`, shown side by side in equal columns between the question and the actions; with
  them the strip stacks its question, choices and actions instead of running inline.
- **Gaia switches over:** the Stop questions in `page/views/forges/ForgesLayout.tsx` and
  `page/views/forge-frame/ForgeFrameLayout.tsx`, as a `Card` holding a `ConfirmStrip` with the two `ChoiceOption`s. The strip
  keeps its own order and emphasis (the confirming control, then a quiet Cancel), where Gaia's panel draws a ghost Cancel first.
- **Gaia deletes after:** `page/design-system/ConfirmPanel.tsx`, its spec and the `.gaia-confirm*` rules.
- **Made against:** `molecules/ConfirmStrip.css` `b05d0bca26fc`, `molecules/ConfirmStrip.dom.tsx` `7774bac47279`,
  `molecules/ConfirmStrip.stories.tsx` `e19a65b6461d`, `molecules/ConfirmStrip.tsx` `6132cb3e94b6`.

### 06-press-scale-token.patch

- **Answers:** 31.
- **Change:** the pressed scale of `Button` and `IconButton` reads `--press-scale` (0.98, as before); the README says a host sets
  it to 1 for a press that changes no size.
- **Gaia switches over:** `page/styles/tokens.css` sets `--press-scale: 1`, so a press changes no size, as SCREENS asks.
- **Gaia deletes after:** nothing; the press scale stops being a known gap.
- **Made against:** `README.md` `a82816db9306`, `atoms/Button.css` `4eccb2babddf`, `atoms/IconButton.css` `123f7a75a7d6`,
  `styles/tokens.css` `11538e9d045b`.

### 07-icon-button-disabled.patch

- **Answers:** 10.
- **Change:** `IconButton` takes `disabled`: drawn in the disabled ink, no hover and no press, and it calls nothing.
- **Gaia switches over:** the disabled "Open in new tab" icon action in `page/views/forges/ForgesLayout.tsx`, today a label-less
  compact `Button`, becomes an `IconButton` with the 03 arrow.
- **Gaia deletes after:** the label-less `Button` and the tooltip wrapper `.gaia-forges-icon-button`.
- **Made against:** `atoms/IconButton.css` `b31f7dadcded`, `atoms/IconButton.dom.tsx` `b9a2da27a931`,
  `atoms/IconButton.stories.tsx` `4b9e8015f71a`, `atoms/IconButton.tsx` `07b174adc63c`.

### 08-choice-option-disabled.patch

- **Answers:** 12 (the half still open: a disabled state).
- **Change:** `ChoiceInput` and `ChoiceFreeText` take `disabled`; an option whose input is disabled fades, takes no hover ring and
  ignores a click.
- **Gaia switches over:** Stop's two choices in `ForgesLayout.tsx` and `ForgeFrameLayout.tsx` pass `disabled` while the command
  is on its way.
- **Gaia deletes after:** the handlers that ignore a change while the command is on its way.
- **Made against:** `molecules/ChoiceOption.css` `091c8efcabba`, `molecules/ChoiceOption.dom.tsx` `596104df7ec0`,
  `molecules/ChoiceOption.stories.tsx` `8bcd8f67b5a2`, `molecules/ChoiceOption.tsx` `7d887594e199`.

### 09-count-badge-text-and-plain-tone.patch

- **Answers:** 18.
- **Change:** `CountBadge` takes a count written as text (`count="4+"`, `count="2?"`) and a `plain` tone: the neutral ink on no
  ground.
- **Gaia switches over:** `page/shell/Rail.tsx` (`RailCountBadge`) and the plain counts the design draws on the wash.
- **Gaia deletes after:** `.gaia-rail-count-mark` and `MARK_TITLES`'s separate mark; the tooltip that says what a mark means moves
  to the badge's holder.
- **Made against:** `atoms/CountBadge.css` `0b54bcbcb4ab`, `atoms/CountBadge.dom.tsx` `63461080a0fa`,
  `atoms/CountBadge.stories.tsx` `5e420f27ac89`, `atoms/CountBadge.tsx` `a3b730a31a47`.

### 10-section-head-compact-and-text-count.patch

- **Answers:** 40 (the compact form and the text count; its other wishes were not on this round's list).
- **Change:** `SectionHead` takes `compact`, which drops its 26 px minimum height, and a count written as text (`"1.24M"`,
  `"4+"`).
- **Gaia switches over:** the Attention heads in `page/views/attention/AttentionLayout.tsx` take `compact`.
- **Gaia deletes after:** the negative top margin of `.gaia-attention-looks` that takes the head's slack back.
- **Made against:** `molecules/SectionHead.css` `39859b83f3c8`, `molecules/SectionHead.dom.tsx` `16b8621350a1`,
  `molecules/SectionHead.stories.tsx` `f928a1d2e6ed`, `molecules/SectionHead.tsx` `feb4042f7a1c`.

### 11-number-stepper-compact-and-disabled.patch

- **Answers:** 16, 29.
- **Change:** `NumberStepper` takes `disabled` (both buttons off, the arrow keys ignored), `compact` (two 24 px buttons, each in
  its own box, around the value as 12.5 px mono text, as the design's `.step` draws it) and `leadingText`, shown before the value
  and read with it ("4 / 5").
- **Gaia switches over:** the agent limit in `page/views/forges/ForgesLayout.tsx` (`LimitStepper`) draws `[−] 4 / 5 [+]` with
  `compact leadingText="4 /"` and `disabled` while a limit is on its way.
- **Gaia deletes after:** the mono "4 /" beside the stepper, `.gaia-forges-agents-stepper`, and the minimum and maximum pinned to
  the limit to switch a side off while a change is on its way (a side at the lowest limit or the ceiling still clamps).
- **Made against:** `atoms/NumberStepper.css` `5d2537ea50ff`, `atoms/NumberStepper.dom.tsx` `bfb54b26dffa`,
  `atoms/NumberStepper.stories.tsx` `7c74e908657e`, `atoms/NumberStepper.tsx` `85174bb21f76`.

### 12-fact-list-fitted-labels.patch

- **Answers:** 15 (a settable label width).
- **Change:** a `table` `FactList` takes `fittedLabels`: its labels share one column as wide as the widest, so no label wraps. It
  compiles only with the table layout. A free width is no prop, since the package takes no free size.
- **Gaia switches over:** `page/views/agents/SelectedAgentPanel.tsx` and `page/views/agents/BrainPanel.tsx`, where "Messages
  waiting" wraps today.
- **Gaia deletes after:** nothing; the other wishes of 15 (value at the end, label over value, the top rule optional) still keep
  the Forges machine facts and the Gaia panel as Gaia's own lists.
- **Made against:** `molecules/FactList.css` `a9db8f105035`, `molecules/FactList.dom.tsx` `5109813294d8`,
  `molecules/FactList.stories.tsx` `33b7390c2c1e`, `molecules/FactList.tsx` `7d9b09dbfd90`.

### 13-motion-gate-pulse-and-side-panel.patch

- **Answers:** 8 (the token half), 32 (the token half).
- **Change:** `--pulse-status` and `--side-panel-motion` are `0ms` until the host sets `data-motion="ready"`, and `--pulse-status`
  is `0ms` under reduced motion, as every other motion token.
- **Gaia switches over:** the brand bar's `StateBadge` pulse waits for the first paint.
- **Gaia deletes after:** the `:root[data-motion="ready"]` qualifier on `.gaia-agents-panel-live-dot`.
- **Made against:** `styles/tokens.css` `1571fde5a073`.

### 14-state-tone-error.patch

- **Answers:** 5 (the `StateTone` half; 01 is the `Callout` half).
- **Change:** `StateTone` gains `error`, a row in the failure colours (`--err-fill`, `--err-tint`, `--err-ink`, `--err-edge`), so a
  state dot, pill or badge can be drawn failed; the README lists it with the other tones.
- **Gaia switches over:** `page/design-system/ConditionDot.tsx` maps `unreachable` to `{ tone: 'error', shape: 'solid' }` in
  `CONDITION_LOOKS` like every other condition.
- **Gaia deletes after:** the `unreachable` branch of `ConditionDot`, the `.gaia-condition-dot` rules in `page/styles/gaia.css`
  and their case in `page/testing/DrawnDots.ts`.
- **Made against:** `@types/StateTone.ts` `7379f993b3be`, `README.md` `29638068fa1f`, `atoms/StateBadge.stories.tsx`
  `66536eec2b82`, `atoms/StateDot.dom.tsx` `b5fd000a065a`, `atoms/StateDot.stories.tsx` `5a92e72182a6`, `styles/tokens.css`
  `3c173fb88124`.

## Tickets

Changes the list asked for that are not small or clean as a patch:

- **32, the raw durations.** About twenty durations in thirteen stylesheets bypass the motion gate (Tooltip 140 ms, Dialog's
  backdrop 260 ms and its 60 ms entry delay, ModelEffortMeter's 480 ms and its 60 ms steps, LogTail 300 ms, Menu 260 ms, Stepper
  240, 700 and 200 ms, SidePanel's 140 ms swap, the 0.9 and 1.3 s spinners, Skeleton 1.4 s, Toast 420 to 600 ms, ChangeRow,
  TypingIndicator). Each needs a decision of the package's owner: which existing token holds it or which new token it gets, and
  what an endless loop (a spinner, the skeleton) shows before the gate opens, where a zero duration is no answer. Patch 13 does
  the token half that needs no decision. Later on 2026-11-15 forge's own uncommitted work began moving these durations onto new
  motion tokens and set `--side-panel-motion` to `var(--motion-slow)`; once that work lands, this ticket and part of 13 may be done.
