---
paths:
  - "bridge/**"
---

# The Bridge

- The Bridge is the board's one page: the React live UI the Overseer serves at `GET /` from `bridge/index.html`, an
  HTML import in `cli/overseer/routes/OverseerRoutes.ts` that `src/services/overseer/OverseerServer.ts` builds with
  `Bun.build` for production and serves through `fetch`, never Bun's HTML route, which takes no headers: every file
  carries the page CSP's `frame-ancestors`. It reads the Overseer's API and nothing else, and keeps no copy of the
  rules: what it shows arrives as facts. Nothing renders a static page: `open` opens the live Overseer's URL, and
  starts the Overseer detached first when none is live, and `progress.html` is a stub that `init`, `update` and
  `oversee` write, naming that URL or saying the Overseer is down.
- The render service builds the payload from the same Board queries `status --json` prints (`BoardFacts`,
  `PagePayloadAssembly`, `MarkdownRenderer`); a ticket's `bodyHtml` and an epic's `descriptionHtml` are its only HTML.
- The detail panel claims a log line by its `taskIds` or `ticketIds`, never a number in free text; a note is matched
  by its sentence. Stamps are sliced, never re-parsed.
- A view model reads a structural type of exactly the fields it uses; tracker types satisfy it unchanged.
- A visual change leaves the README screenshots stale: once it lands, run `.readme-graphics/regenerate.sh` in the
  long-lived checkout holding that code: the script shoots its own checkout.
- `bridge/index.html` links the package's entry stylesheet, `design-system/design-system.css`, first, then
  `bridge/styles/tokens.css`, then `bridge/styles/board.css`. `design-system/styles/tokens.css` holds every token of
  the theme.
  `bridge/styles/tokens.css` holds only the tokens that only the Bridge's classes read. `bridge/styles/board.css` holds
  every class of the Bridge. All of them are designer-owned. `bridge/StyleContract.spec.ts` holds both ways that every
  class a Bridge component emits is styled and every styled class is emitted. It also holds that no Bridge component
  emits a `design-system-…` class, and that no `board.css` selector names one. A `className` is a literal the scan can
  read.
- `bridge/HoverMovesNothing.spec.ts` holds that no `:hover` or `:active` rule moves or resizes anything. The one
  exception is the tooltip's transform: the tooltip takes no space.
- `bridge/ReducedMotionStopsEveryAnimation.spec.ts` holds that a `prefers-reduced-motion: reduce` rule stops each
  animation outside `prefers-reduced-motion: no-preference`. The reduce rule must win: a higher specificity, or the same
  specificity later in the file. A scroll timeline is not motion.
- `bridge/StyleBraceBalance.spec.ts` holds that each stylesheet closes each brace that it opens.
- These three guards and `bridge/ThemeTokens.spec.ts` read the stylesheets of `bridge/styles/` and of `design-system/`.
- React's escaping is the one escape for a value: no value is escaped by hand, and a pre-escaped one would show its
  entities. `eslint.config.js` bans
  `dangerouslySetInnerHTML` and assigning `innerHTML` or `outerHTML` in `bridge/` and `design-system/`; agent-written
  HTML reaches the DOM
  only as a sandboxed iframe's `srcdoc`, whose fixed markup is the one place `escapeHtml` is used, for its title, theme
  and stylesheet addresses.
- A view is `bridge/views/<view>/`: its component, and its logic in a pure `<View>Model.ts` beside it, specced as a
  plain `.spec.ts` in the main run; its behaviour is held by `.dom.tsx` specs, never a frozen markup table. A pure
  util several views use lives in `bridge/utils/` (chip parts in `bridge/chips/`), with its spec.
- The Pipeline view is `bridge/views/pipeline/`. Its components are in one subfolder for each part: `setup/`,
  `agent-panel/`, `flow/`, `gates/`, `dialogs/`, `apply/`, `editing/` and `live/`. Each subfolder keeps the logic of its
  components in pure `*Model.ts` files. `PipelineViewModel.screenOf` selects the screen from the pipeline facts of the
  board and the route: a setup step, the resume summary, the live flow or the editing flow.
- While the board has no readable `pipeline.json`, the Bridge shows only the Pipeline tab
  (`bridge/shell/HashRouter.ts`). The header then shows the setup stepper in place of the statistics, the Overseer
  controls and the tabs (`setupSteps` in `bridge/shell/HeaderModel.ts`). A done step links back to its route.
- The reusable components of the Bridge are in `design-system/` (see `.claude/rules/design-system.md`). A component that
  only the Bridge uses is in `bridge/`.
- `bridge/shell/` holds what the entry starts with: the hash router, the theme bootstrap, the embedded channel (theme in
  and Esc out by `postMessage`, only with the framing parent's origin), the banners and the error boundary.
  `bridge/api/` holds the clients of the Overseer's API. Every control sends its `ControlCommand` through
  `useControlCommand` (`bridge/shell/ControlCommandSender.ts`): a `CommandButton`, or the Send button and Enter of the
  composer, `bridge/conversation/Composer.tsx`. The control is disabled while the event stream is down or launches are
  held, and it shows its refusal verbatim. The one post that is not a `ControlCommand` is the picture upload:
  `bridge/api/PictureUploadClient.ts` posts the bytes of a picture to `/api/pictures` before the command that names the
  picture.
- `eslint.config.js` holds the Bridge's browser storage to `bridge/preferences/PreferenceStore.ts`, keys under
  `<STORAGE_PREFIX>:<trackerId>` and the theme under `<STORAGE_PREFIX>:theme`.
- `bridge/HeadlessBridge.integration.spec.ts` loads the Bridge from a real Overseer in headless Chrome and fails on a
  console error, an exception or a failed request; it skips through `src/testing/ToolGuard.ts` without Chrome.

## Flint in the Bridge

- `bridge/flint/` is the host of Flint in the Bridge. `bridge/flint/BridgeFlint.tsx` gives the home corner at the
  bottom right, the storage port on `bridge/preferences/PreferenceStore.ts` for each board, the visit target and the
  board occasions. The visit target (`bridge/flint/VisitTargetTracker.ts`) is the Flint slot of the open screen. When
  User focuses or clicks in another habitat after that slot shows, the visit target is that habitat. A slot that
  shows, as on a change of screen, is the visit target again. An element with `data-flint-workplace` around a
  habitat, such as the chat card, counts as part of that habitat; a slot counts only as its own box. The innermost
  habitat around the element that User worked in wins. The Bridge learns where Flint lives only from the handle's
  `livesIn`.
- The habitats of the Bridge are the chat thread (`bridge/conversation/`), the Agents view, the Questions view and the
  question panel, the Tickets and Kanban views, the merge queue, the Epics view, the Progress timeline, and the Flint
  slot of each screen. A habitat makes its cues from the data that its component gets, through a pure model with a
  plain spec. It never reads text from the page and never calls a model. One change of the board has one answer of
  Flint, not a cue and an occasion that replace each other: while Flint lives in the questions habitat, that habitat
  answers an incident that opens or settles, and the board occasions do not. A change that ends a loop of Flint, such
  as the connection that comes back, gets a one-action gesture, because an emote does not stop a gesture.
  `bridge/flint/BridgeFlint.dom.tsx` holds the host.
- Each Flint slot (`design-system/FlintSlot`) is the habitat of its screen. The slot draws no sprite. It gives its box
  to `bridge/flint/FlintSlotHabitat.tsx` through `slotRef`. That component registers the box with the habitat of the
  screen, a module constant in `bridge/flint/FlintSlotHabitats.ts`, and sends the cue of the screen's data
  (`bridge/flint/FlintSlotCues.ts`) when the data changes it. While a lasting cue holds, Flint keeps up its answer in
  the slot through `copy`. A screen whose agent does one thing for the whole time sends no cue: the arrival answer of
  its habitat shows it. A slot is at least 100 by 100 pixels, because Flint ignores a smaller habitat. A page shows
  one slot; a slot under a covering panel, or in a panel that is hidden behind one, is not rendered, so it is not
  registered. Each slot habitat sets `keepsFlintInside`: Flint does not show outside the slot, and a visit comes in
  through the edge of the slot. When a slot shows, or when Flint is made while a slot shows,
  `bridge/flint/BridgeFlint.tsx` sends Flint to the slot at once with `perform('visit')`, so Flint does not wait at
  home for its director.
