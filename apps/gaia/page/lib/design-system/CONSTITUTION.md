# Design system conventions

These are rules, not preferences. Where a linter or type checker can hold a rule, it does; everything else is checked
in review. A rule that a guard spec holds names the guard; the spec is the full statement.

## 1. Principles

- **Readability comes first, at every layer.** In the owner's words: "Code readability at all layers of the
  application is a core principle. Good naming, clear readable APIs at each level are essential." A call site reads
  like the design it builds.
- **Composition over configuration.** "Design the design system with composition as its core philosophy. All
  reusable UI components go in here. Design system components are allowed to make logical combinations of other
  components in the design system like atomic design." A new look is a new combination of parts, not a new prop on an
  old part.
- **One theme.** Every colour, space, radius, type size, shadow and time is a token of `styles/tokens.css`, in a
  light and a dark value. A component reads only tokens.
- **One spacing scale.** Each step of `SPACING` (`constants/Spacing.ts`) is the `--space-<size>` token of
  `styles/tokens.css` that holds its value, and `--sp-1` to `--sp-6` are short names of six of them. The spacing props
  and the stylesheets read the same tokens. `constants/Spacing.spec.ts` holds this.
- **The library knows nothing about its host.** It is portable: it imports nothing of the host, holds no
  word of the host, and a host's code reaches it only through its interface file, `DesignSystemInterface.ts`. The
  folder can move to its own repository with no change to a source file.

## 2. Library layout

```
design-system/
  atoms/              one element, or a small fixed group of elements: Button, Icon, StateDot, View, Text
  molecules/          a logical combination of atoms: Row, Card, Tag, ConfirmStrip
  organisms/          a larger composition: Dialog, SidePanel, Tabs, MultipleChoiceQuestion
  utils/              helpers that are not components: Dismissal, Presence, ValueChange, RovingFocusUtil, SpacingStyleUtil
  constants/          design decisions as values: SPACING, the spacing scale, each step a token of tokens.css
  @types/             types several layers share: StateTone and StateDotShape, and ThemeChoice
  styles/             tokens.css, base.css, keyframes.css and the entry stylesheet design-system.css
  fonts/              Inter and Newsreader as woff2, each beside its OFL.txt, and FontLoader.ts, which registers them
  testing/            the helpers of the library's own specs; never exported
  DesignSystemInterface.ts  the interface file: the only door into the library for code outside it
  CONSTITUTION.md     these rules
  README.md           the guide for a developer who uses the library
```

- **Each component has three files beside it:** `Button.tsx`, its stylesheet `Button.css` and its DOM spec
  `Button.dom.tsx`, plus its story.
- **Exported** means named in `DesignSystemInterface.ts`: each component a host uses, the helpers a host calls,
  `StateTone` and `ThemeChoice`. A page links `styles/design-system.css`, `styles/tokens.css` and the font files by
  their path. **Everything else is internal**, and a host never reaches it. The library has no manifest: its
  host's scripts run its tooling.
- **`testing/`, the specs and the stories never ship.** Nothing that ships imports them.

## 3. Import direction

- **A component imports only components of a lower layer.** An atom imports no component, a molecule imports atoms,
  an organism imports atoms and molecules. Any of them may import `utils/`, `constants/` and `@types/`, which import no
  component. `CompositionLayers.spec.ts` holds this.
- **Nothing in the library imports a file outside it.** What ships imports React and nothing else: no `bun:` or
  `node:` module, no other package. A stylesheet references no file outside the folder. `PackageIsolation.spec.ts`
  holds this.
- **A host imports only the interface file.** `import { Button } from './lib/design-system/DesignSystemInterface.ts'`
  by its relative path, never `atoms/Button.tsx` or another file of the folder, and never a name the interface file
  does not export. The host holds this with a guard of its own.
- **The interface file is a facade, not a barrel to grow.** It names each export one by one and holds nothing else.
  Inside the library a file imports exactly the module it needs: no file imports the interface file, and no other
  file re-exports.
- No import cycles, at any level.

## 4. Scope

- **The library holds the visual vocabulary of the host: nothing else.** The test for a component: **it knows no
  domain, and it only lays out, styles or interacts.** A button, a pill, a card, a dialog, a list that reorders and a
  question with options pass. An order card that knows order states fails.
- **A state arrives as its look, never as its name.** A component takes a `StateTone`, named for how the row looks
  (`neutral`, `accent`, `info-outline`, `success`, `muted`), and the flags of its shape (`dashed`, `struck`,
  `checked`, `pulsing`, a `StateDotShape`). The host maps its own states to a tone and flags; no component decides a
  look from a state's name. `PackageIsolation.spec.ts` holds that no file names a word of the host: its names, its
  views and its lifecycle. The scan reads every file, this constitution and the README among them, so neither names
  the host either.
- **The handoff's names are the design's own vocabulary, not host words:** `FlintSlot` with its sizes and grounds, the
  `decision` flag of `Card`, and the tokens such as `--lane-bg` and `--pass-tint`.
- **A place that the host fills is an empty box with a ref prop.** `FlintSlot` draws no sprite and says nothing of what
  the sprite does. It is the square box (its size, its ground and its accessible name), and it gives its element through
  `slotRef`. The host puts its sprite there. Each size is at least 100px square.
- **Graphs, charts, Gantt charts, flow graphs and editors are not design system.** They stay in the host and compose
  the library. The owner's criticism of an earlier app was that "lib components and design system are mixed in there".
- **A building block of the host that draws data** (a dependency graph, a Gantt chart, a markdown editor) is a lib
  component of the host. It may use the library; the library never knows it.

## 5. Components

- **One component per file**, named after it, and the types of its props. A component that is used alone has its own
  file, also when it is small (`TextButton`, `IdLink`, `EmptyState`, `SegmentMeter`).
- **The one exception is the parts of a compound component.** A file may also export the parts that only work inside
  its component, and these files are the full list: `molecules/Menu.tsx` (`MenuItem`, `MenuSeparator`),
  `molecules/ChoiceOption.tsx` (`ChoiceInput`, `ChoiceFreeText`, `ChoiceMark`), `organisms/MultipleChoiceQuestion.tsx`
  (`QuestionOption`, `QuestionOtherOption`) and `organisms/SidePanel.tsx` (`SidePanelHead`, `SidePanelBody`,
  `SidePanelFoot`).
- **Keep every existing component.** A component is not folded into `Text`, a pill or a configurable super component.
- **A component earns its place by a second consumer or by behaviour of its own.** "That does not mean we need 1000
  components that are all preconfigured." A one-off composes `View`, `Row`, `Card` and `Text` at its call site.
- **A reviewer judges each new export on merit.** There is no count of exports, no quota and no ceiling: a new
  export is accepted for what it adds, and refused when composition at the call site does the same.
- **A preset is a component that fixes props of another one** (`Row` is `View` with `row` set). A preset earns its
  place the same way: a second consumer, or behaviour of its own.
- **A component holds no state of the host.** State it owns is the state of its own interaction: an open menu, a
  focused option, a drag in progress.

### Presets or one-offs

| The need | Do |
| --- | --- |
| One screen needs a box with a border and a title | Compose `Card` and `Text` at the call site |
| Two screens need the same composition, with the same behaviour | Make a component of the right layer |
| A composition with its own behaviour (focus, keys, dismissal) | Make a component, even for one consumer |
| A component needs one more look | Add a `data-*` variant through a flag or a union prop, never a new copy |

## 6. Props

- **No super components with 1000 props.** The smell, in the owner's words: "if you MUST configure 10 props just to
  use the component".
- **Optional props are free.** A component may have many, as long as each reads like the design.
- **More than 8 required props must pass scrutiny from a reviewer.** A component over 8 states its use case in a
  one-line comment at its props declaration, and is listed with that use case in `RequiredProps.spec.ts`. The spec
  counts required props through the type checker, so props from `extends`, an intersection and the most demanding
  member of a union all count. It only makes each such component visible: the reviewer decides. The list is exact
  both ways: a component that drops back to 8 or fewer leaves it.
- **Boolean props are adjectives** where they read like the design: `<Text bold muted>`, `<View row centerY>`. This
  is an explicit exception to the predicate-phrase rule for other booleans (`isClosing`, `focusesCloseOnOpen`): a
  flag that names a look is an adjective; a boolean that states a fact of the host stays a predicate phrase.
- **Flags that exclude each other are exclusive by type.** They stay booleans at the call site, and the props type
  is a union that makes setting two of them a type error (`bold?: never` in the other member).
- **No config objects.** A props object passed to get around the limit (`options={{ … }}`) is worse than a flag. Data
  the component lists, such as the options of a question or the rows of a list, is data, not config.
- **No `className`, no `style`, no free colour.** A variant is a `data-*` attribute, styled in the component's own
  stylesheet. A colour is chosen by a state or a tone union, never passed as a value.
- **Direct-styling props are allowed for spacing only,** on `View` and what passes its props through (`Row`, `Card`),
  and as `marginTop` and `marginBottom` on `Text`. "They are convenience ... realistically you only need 4 or 5 and
  read like the design." `margin`, `padding` and `gap`, per side (`Top`, `Bottom`, `Left`, `Right`) and per axis
  (`Horizontal`, `Vertical`), take a named step of `SPACING` (`constants/Spacing.ts`), never a number: `gap="eight"`
  reads as the designs' `gap: 8px`. `SpacingStyleUtil` applies them as inline style, each as the token of its step.
- **Each word is a prop or children; each action is a callback; each link is an `href`.** See section 10.
- **A host reaches an element only through a ref prop of the component** (`buttonRef`, `panelRef`, `scrollRef`). A
  class of the library is not public: no host selector, query or stylesheet names it.

## 7. Layout: View, Row and Card

- **`View` is the layout primitive.** It is a flex box, a column unless `row` is set, with alignment flags
  (`centered`, `centerX`, `centerY`, `between`, `wrap`), the spacing props of section 6, and a `divider` flag that
  draws a hairline between its children. Flags that pull one axis two ways exclude each other by type: `centered`
  stands alone, and `between` takes centring only across the main axis. A layout is a `View`, never a one-off `div`
  with a class.
- **`Row` is `View` with `row` fixed.** Every other `View` prop passes through.
- **`Card` is a preconfigured but overridable `View`.** Its defaults are the card ground, border, radius and padding.
  Every `View` prop passes through and wins over a default: a padding given to `Card` replaces its own.
- **`Card` flags:** `quiet`, `step`, `decision`, `dashed`, `interactive` and `selected`. The ground flags (`quiet`,
  `step`, `decision`) exclude each other by type.
- **`Card` takes an optional `title`,** drawn in the `title` role of `Text`, its element given by `titleElement` like
  any other heading (section 8). With no `title`, "an app is free to add its own title" in the children.
- An organism that needs a box composes `Card` or `View`; it does not copy their styles.

## 8. Text

- **`Text` takes one role from the type scale as `typeRole`:** `display`, `phase`, `page`, `section`, `title`, `lead`,
  `body` (the default), `tab`, `small`, `pill` and `micro`. The role sets the font, size, line height and weight.
  `display`, `phase`, `page` and `section` are Newsreader; every other role is Inter.
- **`Text` flags:** `bold`, `muted`, `subtle`, `mono`, `struck` and `centered`, with `marginTop` and `marginBottom`
  from the spacing scale. `muted` and `subtle` exclude each other by type.
- **The heading level is explicit, never chosen by the role.** The call site picks the element (`element="h2"`, `p`
  or the default `span`); a role alone renders no heading. A page-sized name can be an `h2` on one page and a `span`
  in a card: the outline belongs to the screen, not to the size of the type.
- **A component that draws a title draws it with `Text` and takes its element as `titleElement`:** `Card`,
  `SectionHead`, `ListSection`, `Pane`, `TitledBlock`, `Callout` and `SidePanel`. Its default is the level that the
  component has in most screens, and a screen that nests it picks another.
- **Mono is for machine text only:** commands, file names, ids, hashes, counts and times.

## 9. Styling and theme

### Tokens

- **Every token lives in `styles/tokens.css`, in both themes.** The light theme is the default on `:root`; the dark
  theme sits under `:root[data-theme="dark"]`. An alias is written once as `var(--other)` and follows both themes.
- **No colour literal outside `styles/tokens.css`.** No hex, `rgb()` or named colour in a component or its
  stylesheet; an SVG fill reads a token through `var(…)`.
- **A state colour comes from its tone's row.** An element with `data-state-tone` set to a `StateTone` reads
  `--s-fill`, `--s-tint`, `--s-ink`, `--s-edge` and `--s-head`. `data-palette="quiet"` gives a badge the quieter
  colours of a table row. A shape is a flag of the component, never a tone.
- **Only the scale's radii, spaces and type sizes.** A value that is not a token is a design change, made in
  `tokens.css` first. A space is a `--space-…` token or its short name `--sp-…`.

### Stylesheets

- **A stylesheet beside each component holds exactly its classes.** It styles the classes its component emits, and
  the parts of lower layers that the component holds; nothing else. `StyleContract.spec.ts` holds this both ways.
- **Every class and keyframe is named `design-system-…`.** A keyframe that one component uses is in its stylesheet;
  one that several use is in `styles/keyframes.css`. A keyframe is not public: a host animates with keyframes of its
  own, and `styles/keyframes.css` holds no keyframe that no stylesheet of the library uses.
- **`styles/design-system.css` imports every stylesheet once:** tokens, base, keyframes, then the atoms, the
  molecules and the organisms. `StyleContract.spec.ts` holds the order.
- **A variant is a `data-*` attribute** (`data-tone="warn"`, `data-quiet`), styled in the component's stylesheet.
- **Hover and press move nothing.** A `:hover` or `:active` rule changes colour, outline, shadow, filter, opacity or
  cursor. The exception is a movement that moves nothing else, such as the pressed scale of a button.
- **No gradients, no emoji, no coloured icon tiles, no shadows** other than the shadow tokens.

### Motion

- **Every motion token is `0ms` until the host sets `data-motion="ready"`** on the root, after the first paint.
- **Reduced motion stops everything.** Under `prefers-reduced-motion: reduce`, every motion token is `0ms` and every
  animation stops, the pressed scale too. The reduce rule wins over the rule it stops.
- **Motion explains a change:** a part that appears, leaves, changes state, is pressed or is counted. It is
  short, and it never plays only because the page renders again.
- **Each duration and delay of a motion that plays once is a motion token, or a `calc()` of one,** so the
  first paint and reduced motion zero it. A new token is zeroed in both zeroing blocks of `styles/tokens.css`.
  The toast's reading time is no motion: reduced motion keeps it.
- **An easing is a token too:** `--ease-out` for a motion that plays once, `--ease-in-out` for one that loops.
- **A part that leaves animates out through `usePresence` (`utils/Presence.ts`),** inert while it goes. A
  number that ticks when it changes keys its element through `useValueChange` (`utils/ValueChange.ts`), so the
  first showing plays nothing.

### Fonts

- **Inter and Newsreader ship as woff2 in `fonts/`, each beside its `OFL.txt`.** Both are under the SIL Open Font
  License 1.1; the licence never leaves the font files.
- **A host registers the fonts once, before the first render, with `loadDesignSystemFonts` (`fonts/FontLoader.ts`).**
  The loader imports the woff2 files from TypeScript and adds them with the FontFace API. No stylesheet names a font
  file: a bundler inlines a small file that a stylesheet `url()` names as a `data:` address, and a content security
  policy that allows only the page's own origin blocks it. An imported file is emitted as a file of its own.
- **Newsreader is only for the `display`, `phase`, `page` and `section` roles.** Inter is for everything else; the
  system mono stack only for machine text.

## 10. Words, actions and links

- **The library holds no text for the user.** Each word arrives as a prop or as children: a label, a title, an
  accessible name, a close label.
- **No hard-coded text,** also not a symbol that reads as a word to a screen reader: give it an accessible name.
- **An action is a callback** named for the event: `onPress`, `onClose`, `onSelect`.
- **A link is an `href`.** The component draws an `a`; the host owns its routes.
- **A value reaches the DOM only through React**, which escapes it. No component injects markup as text.

## 11. Accessibility

- **Every control has an accessible name**, given as a prop. An icon-only control takes its label as a prop.
- **A decorative part is hidden; a meaningful one is named.** An icon or drawing with a label is `role="img"` with
  that `aria-label`; with `null` it is `aria-hidden="true"`.
- **Use the native element** (`button`, `a`, `input`, `dialog`, `output`) before a role on a `div`.
- **Every control works from the keyboard.** Focus is drawn by `:focus-visible` (a 2px `--link` outline, 2px
  offset). A composite widget moves focus with the arrow keys through `RovingFocusUtil`; a popover closes on Esc and
  returns focus through `Dismissal`.
- **State is a word, colour only supports it.** A pill or a dot that shows a state carries the state's word or an
  accessible name.
- **The heading level is chosen by the screen** (section 8), so the outline stays correct.

## 12. Tests and stories

- **Each exported component has a DOM spec beside it** (`<Component>.dom.tsx`). It holds behaviour through the
  rendered DOM and its roles, never a frozen markup table. A pure util has a `.spec.ts` against its own contract.
- **Each exported component has a story** in the library's Storybook (Storybook 10), showing its variants in both
  themes. A new prop or flag gets a story.
- **A guard proves its scan found something and plants each form it claims.** An allowlist is exact both ways.

| Guard | Holds |
| --- | --- |
| `CompositionLayers.spec.ts` | Every component sits in a layer and imports only components of a lower layer |
| `PackageIsolation.spec.ts` | Nothing imports outside the library; what ships imports only React; no file, the constitution and the README among them, names a host word |
| `StyleContract.spec.ts` | Each class is styled by its owner's stylesheet, each rule styles its own component, the entry imports each stylesheet once in layer order |
| `StyleBraceBalance.spec.ts` | Every stylesheet closes every brace it opens, and closes none it did not open |
| `HoverMovesNothing.spec.ts` | A `:hover` or `:active` rule changes only colour, outline, a shadow, a filter, opacity, visibility or the cursor; a movement that moves nothing else is listed, exact both ways |
| `ReducedMotionStopsEveryAnimation.spec.ts` | Each animation set outside the no-preference query is stopped by a reduced-motion rule on the same subject that wins the cascade |
| `ThemeTokens.spec.ts` | Each literal colour token has a dark value or is listed as the same in both themes; an alias is one `var()` line; a state tone's literal has its dark row; each token that is a time is zeroed under reduced motion and before the first paint; the type scale and corners hold their sizes |
| `RequiredProps.spec.ts` | A component over 8 required props is listed with its use case; a listed one is still over 8 |
| `StoryCoverage.spec.ts` | Every exported component has a story beside it, and every story shows an exported component, titled `<Layer>/<Component>` |
| `constants/Spacing.spec.ts` | Each step of `SPACING` is a `--space-…` token, each such token a step, each the size its name says; each `--sp-…` is an alias |
| `SpacingTokens.spec.ts` | No margin, padding, gap or offset from an anchor in a component stylesheet or a stylesheet of `styles/` holds a pixel literal; only a hairline pull, `margin-<side>: -1px` in a rule that draws a border on that side, is a border width |

## 13. Known exceptions

The code breaks these rules on purpose. Each exception is exact, and `docs/backlog.md` holds the change that ends it.
Add no exception without the owner's agreement.

None.

## 14. Review checklist

- [ ] Every new component passes the scope test: no domain; it only lays out, styles or interacts.
- [ ] Every new export earns its place: a second consumer or behaviour of its own; otherwise it is composed at the
      call site from `View`, `Row`, `Card` and `Text`.
- [ ] The component sits in the right layer and imports only lower layers; nothing imports outside the library.
- [ ] Call sites read like the design; names are full; flags are adjectives; exclusive flags are exclusive by type.
- [ ] More than 8 required props: the use case is in a one-line comment at the props and in `RequiredProps.spec.ts`,
      and the reviewer agrees.
- [ ] No `className`, no `style`, no free colour, no config object; spacing comes from the named scale.
- [ ] Every word is a prop or children, every action a callback, every link an `href`.
- [ ] The stylesheet beside the component holds exactly its classes, named `design-system-…`; variants are `data-*`.
- [ ] Every new token has a light and a dark value; no colour literal outside `styles/tokens.css`.
- [ ] Hover moves nothing; reduced motion stops every new animation.
- [ ] Every control has an accessible name and works from the keyboard; headings have an explicit level.
- [ ] The component has a DOM spec and a story; a new guard proves its scan and plants each form.
