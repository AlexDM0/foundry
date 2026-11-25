# Screens: every screen of Gaia's page, its parts, its controls and its acceptance

What each screen of Gaia's page is for, what it shows, what every control does, the states it has and what it must hold. Code, specs
and rule files cite a screen by its mark ("`docs/design/screens.md` A4", "B2 acceptance 3"); the marks and the acceptance numbers stay
as they are, and an acceptance that no longer applies is marked withdrawn, so no number shifts. `docs/design/README.md` says how the
documents of this folder fit together.

Paths are relative to `apps/gaia/`. Every sentence in quotes is the page's own copy. The data in the examples is the fixtures' under
`page/testing/fixtures/`.

| Mark | Screen | Route |
| --- | --- | --- |
| A1 | Attention | `#attention` |
| A2 | Agents | `#agents` |
| A3 | Activity | `#activity` |
| A4 | Forges and this machine | `#forges` |
| B1 | A forge in place | `#forge/<trackerId>` |
| B2 | Start, stop and a refusal | `#forges`, with controls in use |
| B3 | Forges Gaia cannot fully read | `#attention`, with forges not read in full |
| B4 | No forge yet | `#attention`, with no forge registered |
| C2 | Notifications and the window title | the "What notifies" dialog over `#forges` |
| C3 | Launcher splash | `resources/page/loading.html` |

There is no C1; the mark is not reused, and both themes are part of every screen.

## Rules for every screen

Every screen of Gaia's page is drawn at 1440 x 1016 (`ARTBOARD_SIZE_PIXELS` in `page/testing/ArtboardScreens.tsx`). The "What
notifies" dialog (C2) is drawn at the same size, as a modal over the Forges view it opens from; the splash (C3) is its own file page,
drawn at 900 x 560 (`SPLASH_SIZE_PIXELS`). Both themes, light and dark, are drawn for every screen, light first as the design system's
default; `page/Screens.visual.spec.ts` paints every artboard in both from the same markup, which differs only in the theme the root
names and the theme button shows, for the by-eye pass against the artboards.

- **Mono is for machine values:** an id, a stamp, a duration, a count, a path, a code version.
- **Gaia never invents a time or a count.** A value the forge did not report is absent, not zero: a rail count the fleet document does
  not hold is no badge at all (`page/shell/RailModel.spec.ts`, "the counts that are absent"), and a forge's own figure, such as its
  tokens today, is passed on as the forge reports it.
- **A control is disabled while its command is on its way,** and for a forge whose control contract Gaia does not know
  (`ForgeContractUtil.controlContractIsKnown`). `page/api/CommandSender.ts` sends nothing for a subject that already has a command on its
  way, nor while the controls may not act; `page/api/CommandSender.spec.tsx` holds both.
- **A refusal is the forge's own code and sentence,** unedited, beside the control that caused it, until dismissed or until the next
  command about the same subject succeeds. It reads "The forge refused <the button's label>: " with the code in mono and the sentence;
  where Gaia itself refused or nothing answered it reads "Gaia could not <the button's label>: " with Gaia's own code and sentence, such
  as `server-unreachable` and "Gaia's server could not be reached.", so a refusal never blames a forge that was not asked and is never
  blank. It offers "Try again" where the command can be sent again and a dismiss button named "Dismiss this refusal". It is an alert and
  never a red button. Held by `page/shared/utils/CommandFailureTextUtil.spec.ts`, `page/components/Refusal.spec.tsx` and
  `page/api/CommandSender.spec.tsx`.
- **No screen shows a command for User to run.** Gaia's sentences name no command (`page/shell/ConnectionBanner.spec.tsx`,
  `page/shared/utils/ForgeVersionsTextUtil.spec.ts`); a forge's notice that names none is passed on as the forge worded it.
- **A hover or a press changes colour, background, border colour, shadow, opacity, outline colour, text decoration or cursor only.**
  Nothing moves or changes size. The design system's press scale, which it leaves to its host, is set to 1 in `page/styles/tokens.css`
  (`--press-scale: 1`), so its press shrinks nothing. `page/StyleContract.spec.ts` holds it for `gaia.css` ("no hover or press rule
  changes a size or a place") and for the board's stylesheets ("no :hover or :active rule moves or resizes anything"), and holds that
  every transition and animation changes no size or place either.
- **Both themes.** A screen is done when it matches its artboard in light and in dark. Every colour is a token with a light and a dark
  value (`page/StyleContract.spec.ts`, "the tokens").
- **One primary per area.** An area (a list, a callout, a row, a panel, a dialog) has at most one orange primary button. Orange is work,
  what waits on User and that one primary button; crimson is a failure only and never a button. Stop is never red, and never
  primary except as the confirming "Stop" of a Stop question (A4's stop panel, B1's popover).
- **A colour is never alone.** Every dot, edge or tint stands beside its word: the condition word, the role word, the kind pill. A
  condition dot is the design system's `StateDot`, hidden from the accessibility tree (`page/components/ConditionDot.tsx`); the row
  beside it says the word or carries it as its title. Fill holds, a ring changes, dashed waits.
- **No shadow at rest.**
- **"You" only for what waits on User:** "Waiting on you", "2 wait on you". Attention's lead reads "What waits on you across every forge,
  and the forges that need a look.", and the list of what waits is labelled "Waiting on you".
- **Flint only in a forge.** Gaia draws Flint only in the forge route, one per forge, and calls no model (`CLAUDE.md` rule 12;
  `page/PageImportDirection.spec.ts` holds that only `page/board/` imports Flint).

## The shell

The frame around every view: a brand bar across the window, the rail under it on the left, and beside the rail the view's page title,
the connection banner and the view.

Built in: `page/shell/` (`GaiaApp.tsx`, `Rail.tsx`, `RailModel.ts`, `BrandStatusModel.ts`, `ConnectionBanner.tsx`, `WindowTitle.ts`,
`ThemeBootstrap.ts`), `page/components/BrandBar.tsx`, `page/shared/HashRouter.ts`, `page/shared/MachineLoadModel.ts`,
`page/api/FleetStreamClient.ts`.
Held by: `page/shell/GaiaApp.spec.tsx`, `page/shell/RailModel.spec.ts`, `page/shell/Rail.spec.tsx`, `page/shell/BrandStatusModel.spec.ts`,
`page/components/BrandBar.spec.tsx`, `page/shell/ConnectionBanner.spec.tsx`, `page/shell/WindowTitle.spec.ts`,
`page/shell/ThemeBootstrap.spec.ts`, `page/shared/HashRouter.spec.ts`, `page/api/FleetStreamClient.spec.ts`, `page/Screens.visual.spec.ts`.

Every control of the shell and the view sits in one fieldset, which is disabled while the controls may not act (see Connection banner);
a link, as every rail row is, still navigates.

### Brand bar

52 px across the whole window, a hairline under it, padding 0 20 0 22 (`--brand-bar-height`, `--brand-bar-start-padding`,
`--brand-bar-end-padding`).

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Mark and wordmark | `GaiaMark` at 28 px and "gaia" in lowercase | One link to `#attention`, named "Gaia, Attention" |
| Divider | An 18 px hairline in the strong line colour | none |
| Status pill | While a forge's Hephaestus runs: an orange pill with a pulsing dot, "4 forges running" ("1 forge running"). While none runs: a neutral pill with a ring dot, no pulse, "No forge running"; with no forge registered "No forge registered"; with every forge hidden "No forge shown" | none |
| Status sentence | The other conditions by count, over the forges not hidden, joined by " · " in this order: paused, "holds its launches" / "hold their launches", "restarting", "starting", "dormant", "unreachable", "needs a forge update" / "need a forge update", "not readable by this Gaia", "repository missing" / "repositories missing". A1: "1 holds its launches · 1 dormant · 1 repository missing". No forge registered: "nothing runs on this machine yet"; every forge hidden: "every forge is hidden in Gaia". Cut with an ellipsis when long | none |
| Theme | `ThemeCycleButton` at the far end, named after the current choice and the next: "Theme: auto. Switch to light". Absent on `#forge/…`, so a forge in place has room for its own line and buttons | Cycles auto, light, dark. A choice shows at once, is stored in the browser for the next first paint, and is sent to Gaia's settings as `settings-set` with key `theme` |

A forge's Hephaestus runs while the forge is live, paused, held or restarting, or when it answered its versions at a version Gaia
cannot talk to (`BrandStatusModel.ts`). Before the first fleet document the bar shows neither pill nor sentence.

The theme is set on the root as `data-theme` before the first paint from the choice this browser last stored (`ThemeBootstrap.ts`); a
missing or unknown stored value is auto, which follows the system's scheme. From the first fleet document on, the settings' choice is
shown, and a choice made in the window stands through a document that still carries the old one.

### Rail

232 px wide, under the brand bar, a hairline on its right. It is the navigation landmark named "Gaia" and holds no brand of its own.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Views | Attention, Agents, Activity, Forges, each a row with its count. The current row has `aria-current="page"`, the wash, an inset 3 px ink left edge and the strong weight | Each row links to `#attention`, `#agents`, `#activity`, `#forges` |
| Attention count | `figures.waitingOnUser` in the warn tone; `4+` while a forge Gaia cannot read in full may hold more (titled "more possible"); absent while nothing waits and nothing more is possible | as Views |
| Agents count | The fleet document's agent rows, plain; `8+` while a forge at a version Gaia cannot talk to runs agents no total counts | as Views |
| Activity | no count | as Views |
| Forges count | The forges not hidden, plain | as Views |
| Forges group | Micro-caps "Forges", then one row per forge not hidden, in registry order: its `ConditionDot`, the project name (ellipsis), its waiting count. The row's title is the condition word, and for a forge at another version what that version means ("Older than this Gaia · update the forge"), and the agents a network outage stopped. With no forge registered the group says "No forge is registered" and lists none; before the first document the group is absent | A row goes to `#forge/<trackerId>` when the forge can open in place (read in full, or unreachable as last reported), else to `#forges?forge=<trackerId>`, its Forges row in view |
| A forge's count | Read in full: its attention entries plus its agents a network outage stopped, in the warn tone. Counts only: the count it reports. Unreachable: the count it last reported, plain, marked `?` ("2?", titled "as last reported"). Absent when none | as the row |
| This machine | At the bottom: micro-caps "This machine"; the figure in mono, "10 / 12", and "agents"; a `SlotMeter` of the limit in orange (used filled, free open); the limit line "limit 12 of 12 CPUs". With no limit known the figure is the agents alone, the meter has one slot per CPU, and the line reads "no limit known · 12 CPUs" | One link to `#forges` |

At the machine limit the figure turns to the link orange, every slot is filled, and a line "at the limit · 3 tickets wait" ("1 ticket
waits"; "at the limit" when none waits) stands over the limit line (B2). While a forge is unreachable the limit line adds "3 of the 10 as
last reported" (B3), and while a forge's agents are not counted it adds "1 forge not counted". Before the first document the rail shows
its four views without counts and no machine.

### Page title

The first row of the main area beside the rail: the design system's `PageHead` with the view's title, its lead under it, its figures at
the right (each a mono value over its label, separated by hairlines; a figure that waits on User or stands at a limit in orange), then
the view's own actions, such as Look again and "Add a repository" on Forges. A view hands the shell these parts (`ViewParts`); a view
that heads itself, as a forge in place (B1) and no forge yet (B4) do, gives no title, and then no page title is drawn. Before the first
fleet document a view shows its title and lead with no figure.

### Connection banner

An error banner (the design system's `Banner`, error tone, `role="alert"`) right under the page title, or heading the main area where
there is no page title. It shows in four states of `FleetStreamClient`, each with its sentence:

| State | Sentence |
| --- | --- |
| `lost`: Gaia's event stream erred and is being reopened every 2 seconds | "Gaia's server could not be reached. Trying again." |
| `page-out-of-date`: a reload did not bring a page of the server's fleet version | "This page does not match Gaia's server, and reloading it did not help." |
| `session-lost`: the server no longer knows this window's session | "Gaia's server no longer knows this window, as after it restarted. Close this window and open Gaia again." |
| `server-ended`: nothing answers the session check | "Gaia's server no longer answers, and this window's session ended with it. Close this window and open Gaia again." |

While `connecting` or `live` there is no banner. While the banner shows, the shell's fieldset is disabled, so every button and field of
the brand bar, the rail and the view is disabled; links still navigate. The stream is `GET /api/v11/events`; the server sends its current
document first on every open, so a reopened stream needs no separate read.

### Routes

Routes are hash fragments (`page/shared/HashRouter.ts`), so the page needs no server route and a link survives a server restart. Each
segment is URL-encoded.

| Fragment | View |
| --- | --- |
| `#attention` | Attention, the default |
| `#agents` | Agents |
| `#agents?<filters>` | Agents with its filters in the query, such as `role=builders&condition=needs-a-look` |
| `#agents/<trackerId>/<jobId>[?<filters>]` | Agents with that job selected; without the job none is selected |
| `#activity` | Activity |
| `#forges` | Forges |
| `#forges?forge=<trackerId>` | Forges with that forge's row in view |
| `#forges/add` | Forges with the "Add a repository" dialog open |
| `#forge/<trackerId>` | The forge's board in place, at the tab this browser last chose, else the first it shows |
| `#forge/<trackerId>/<place>` | The board at a place: `tickets`, `progress/kanban`, `progress/waves`, `progress/gantt`, `epics`, `agents`, `questions`, `assistant`, `intake`, `pipeline` |
| `#forge/<trackerId>/<place>/<item>` | The board with an item open: `questions/<decisionId>`, `tickets/ticket/<ticketId>`, `tickets/draft/<draftId>`, `agents/<jobId>`; an incident opens `assistant` alone; `tickets/in-draft`, `tickets/active` and `tickets/finished` open Tickets on that segment (`tickets.md`) |

An old board link (`kanban`, `waves`, `progress`) is redirected to the route it names (`board-menu.md`, "Routes"). A path after the
tracker id that names no board place, and the form with `#` before the tab (`#forge/<trackerId>/#questions/E2`), open the
forge at its default tab. A malformed escape in an item reads as no item, and in the tracker id as no forge. Any empty, unknown or
malformed fragment is Attention, never an error. A tab the board does not show (Waves with no dependency, Epics with no epic, every tab
but Pipeline on a board with no readable pipeline) falls back to the first tab it shows. The launcher's one-time `#session=<code>`
fragment is spent and cleared before the page reads any route (`page/shell/SessionCodeExchange.ts`).

### Window title

`(N) Gaia · <view>`: the view's name, or for a forge in place its project (its tracker id while the document does not hold it). The count
is the rail's Attention count, `4+` included, so the two never disagree; with nothing waiting, and before the first document, it is left
out: `Gaia · Attention`.

### Acceptance

1. Each rail row's count equals the fleet document's figure for it, and a count the document does not hold is absent, never 0
   (`page/shell/RailModel.spec.ts`).
2. A forge that joins or leaves the registry joins or leaves the rail from the next fleet document, without a reload
   (`page/shell/GaiaApp.spec.tsx`).
3. The brand bar and the rail match A1 at 1440 x 1016 in both themes (the by-eye pass of `page/Screens.visual.spec.ts`).
4. Tab reaches every control in visual order: the brand bar from its home link to the theme button, the rail top to bottom, then the
   view's buttons; the markup order is the visual order; every control, an icon-only one included, has a name
   (`page/shell/GaiaApp.spec.tsx`, "Tab and names").
5. In the A1 fixture the rail's Agents count reads 10 and this machine "10 / 12" (`page/shell/RailModel.spec.ts`).
6. `#forge/…` has no theme button; every other route has one, named after the current choice and the next ("Theme: auto. Switch to
   light") (`page/shell/GaiaApp.spec.tsx`, `page/components/BrandBar.spec.tsx`).
7. With no forge registered the rail says "No forge is registered" and its slot meter shows 12 free slots (`page/shell/GaiaApp.spec.tsx`,
   `page/shell/Rail.spec.tsx`).
8. While the event stream is lost, the page is out of date, the session is lost or the server has ended, the connection banner shows its
   sentence under the page title and every control is disabled; once the stream is live again both are gone
   (`page/shell/GaiaApp.spec.tsx`, `page/shell/ConnectionBanner.spec.tsx`).

## A1. Attention

The home screen and the shell's default route: everything that waits on User across every forge, and the forge-level conditions no
forge raises about itself, beside the running forges and what just happened.

Built in: `page/views/attention/` (`AttentionView.tsx`, `AttentionModel.ts`, `AttentionLayout.tsx`, `OutageResumeButton.tsx`), with the
order and the looks decided by the server in `src/features/fleet/utils/AttentionOrderUtil.ts`, `src/features/fleet/utils/ForgeLookUtil.ts`
and `src/features/fleet/FleetAssembly.ts`.
Held by: `page/views/attention/AttentionModel.spec.ts`, `page/views/attention/AttentionLayout.spec.tsx`,
`page/views/attention/AttentionView.spec.tsx`, `src/features/fleet/utils/AttentionOrderUtil.spec.ts`,
`src/features/fleet/utils/ForgeLookUtil.spec.ts`, `page/testing/fixtures/fleet-five-forges.spec.ts`, `page/Screens.visual.spec.ts`
(A1, and A1 with a pending restart, a failed restart and an outage). Example data: `page/testing/fixtures/fleet-five-forges.ts`.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Page title | "Attention", the lead "What waits on you across every forge, and the forges that need a look.", and the figures stacked in one row | "Resume agents stopped by an outage" (see the outage rows below) |
| Figures | Six figures from `figures`: "waiting on you" (the one marked as waiting on User, orange), "agents" as `10 / 12` (the machine limit; the agents alone when none is known; a `+` after the count while a forge at a version Gaia cannot talk to runs agents it cannot count), "tickets ready", "done today", "tokens today" (short form, `1.2M`), "open incidents". "done today" and "tokens today" are left out, never printed as zero, while no forge reports today | none |
| Waiting on you | A card: the serif head "Waiting on you" with the count in an orange pill (`5`), and "oldest first · escalations on top" at its end; then one row per entry of `attention`, in the server's order (below) | none of its own |
| A row | The forge's condition dot, its name and condition word; a kind pill ("Escalated", "Question", "Draft", "Review", "Accept", "Crashed", "Down", "Not supervised", "Outage"), green for Accept and orange for every other; the mono id (`E4`, `#015`); the subject; a meta line of the forge's `metaText` (or the decision kind, `pipeline-proposal`) and the stamp's word with the age (`from incident I2 · opened 21m`; a meta line that opens with the stamp's word prints the age alone, `filed by intake · 2h 04m`) | The row's button carries the forge's action label ("Answer", "Ready", "Accept", "Open", "Start") and goes to the forge's board in place, `#forge/<trackerId>/<tab>/<item>` (`#forge/example-storefront-7c41/questions/E2`). Only the first row that can act has the primary button and the orange left edge; the others are quiet |
| A forge alert row | Raised by Gaia from a forge's presence, never by the forge: "Forge crashed. It stays off until it is started." (or "Suspected crash before a reboot." and the error's name), "Forge is down: its Hephaestus is gone or hung.", "The forge stopped supervising its agents. They wait for a resume." | A crashed or down forge's "Start" sends `forge-start` and is disabled while it is on its way; a hung forge's "Open" goes to `#forge/<trackerId>` |
| The outage row | When a network outage stopped agents that wait for User's resume: one row for the whole fleet, kind "Outage", condition word "network outage", the forges it names as its name (`Example Storefront and Invoice Service`), the subject `3 agents stopped on a network outage`, the meta line each forge's own count (`Example Storefront 2 · Invoice Service 1`) | "Open" goes to the Agents view, `#agents` |
| Outage resume | "Resume agents stopped by an outage" in the page title whenever the fleet shows, not disabled by what it would resume, with nothing to resume or a forge down too (only the shell's fieldset disables it, while the connection banner shows) | Sends `fleet-outage-resume`. Its answer shows atop the view, one line per forge that resumed ("Resumed 2 agents", "Resumed its agents"), refused (the forge's own sentence, else "Refused the resume.") or did not answer ("Did not answer. Nothing was resumed there."); a forge with nothing to resume has no line, and with none at all the answer reads "Nothing to resume". "Dismiss" takes it away; a failed send shows its refusal there with Try again |
| Forges that need a look | The micro-caps head "Forges that need a look · N" and one callout per look (see "Forges that need a look" below), absent with no look. A callout: the forge's dot, its name, its word ("Launches held." as a sentence, or a quiet pill such as "Dormant"), a sentence, a mono machine line where it has one | The callout's actions, from the table below. A refusal of a callout's command shows under that callout with the forge's code and sentence, "Try again" and a dismiss, until dismissed or the next success |
| Pending restart | Under a callout whose "Update forge" was answered `restart-pending`: the pending step "Updated; restart pending." and "Its Hephaestus runs the old code until it restarts." | "Restart" sends `forge-restart` (primary, but quiet under an older forge's callout, which keeps "Update forge" as its primary; disabled while the forge's control contract is unknown); "Dismiss the pending restart" takes the step away. The step stays until a restart, stop or update of that forge succeeds |
| Running | The head "Running · N" and one card per forge that runs agents: its dot, name and condition word, `agentsInFlight / limit` in mono (or `3 agents` for a forge that reports no limit), a chip per job (role dot, mono id, its role word; a job that waits on User's decision is drawn as asking, with the word "asks"), and in orange "2 wait on you" | The card goes to `#forge/<trackerId>` |
| Just happened | The newest four entries of `activity`: clock time, forge and the forge's own text; "No forge has reported activity yet." in its place when there is none | "All activity" goes to `#activity` |

Each change reaches the view as the next fleet document over Gaia's event stream, so an entry appears or leaves, and a callout leaves,
with no reload. An age is printed from the page's clock for display only.

### The order of what waits

The server orders `attention` and the page keeps that order (`src/features/fleet/FleetAssembly.ts`,
`src/features/fleet/utils/AttentionOrderUtil.ts`):

1. The fleet's outage alert, when a network outage stopped agents that wait for User's resume.
2. Each crashed, down or hung forge's alert, in the forges' order.
3. Every entry of every forge read in full, and of an unreachable forge as it last reported it, each with its forge: escalated entries
   first, then by stamp, oldest first. Stamps are compared as instants whatever offset each writer used; a stamp that does not parse sorts
   after every one that does; a tie keeps the forges' order and each forge's own order. A forge read in part or not at all lists no entry
   by name.

The stamps of different writers are compared to order a display only. This is the one stated exception to "a clock decides nothing" in
Gaia, and nothing but the order of rows on screen depends on it. The primary button is on the first row that can act. `figures.waitingOnUser`
counts the listed entries; while a forge cannot vouch for its count, the figure and the head say so (B3).

### Forges that need a look

A look is derived by the server from one forge's reading, never stored (`src/features/fleet/utils/ForgeLookUtil.ts`). A forge has at most
one: the first row that applies, in this order. Warnings, notices, a held state and machine slots come only from a forge read in full now.
The row numbers are the ones `ForgeLookUtil.spec.ts` cites; `older-contract` has no number there and is
listed as 2a, between rows 2 and 3.

| Row | `kind` | When | Callout | Actions in Gaia |
| --- | --- | --- | --- | --- |
| 1 | `unreachable` | fidelity `unreachable` | error: "Unreachable." "Its Hephaestus stopped answering. The registry still names it." machine line `127.0.0.1:4957 · process 48211 · last answer 13:14` | "Look again" sends `fleet-look-again` |
| 2 | `newer-contract` | fidelity `newer-contract` | neutral, dashed: "Newer than this Gaia." with the versions document's sentence, or, for a forge whose version Gaia talks to but whose document is of a newer contract, "This forge publishes monitor contract 6. This Gaia reads 5, so it shows nothing of it and sends it nothing." and the machine line `monitor 6 · control 4` | none |
| 2a | `older-contract` | fidelity `older-contract`: the forge's system version is older than the one this Gaia is built for, or it serves none | warn (see the versions document, U1) | "Update forge" sends `forge-update` (primary) |
| 3 | `restart-failed` | a warning of kind `restart-failed` | error: "Restart failed." and the forge's own warning sentence (else "Its Hephaestus could not hand over to its successor.") | "Open" goes to `#forge/<trackerId>` |
| 4 | `launches-held` | `hephaestus.state` is `held-by-install-change`, read as the condition `held` | warn: "Launches held." "The install version changed. Nothing launches until this forge is updated." and, with agents running, `2 agents keep running through the update` | "Update forge" sends `forge-update` (primary); "Open" goes to `#forge/<trackerId>` |
| 5 | `new-code` | a notice of kind `new-code` | neutral, pill "New code": the notice's sentence (else "This forge's code changed since its Hephaestus started.") and `code <codeVersion>` | "Restart onto the new code" sends `forge-restart` (primary; disabled while the forge's control contract is unknown) |
| 6 | `counts-only` | fidelity `counts-only` | neutral, dashed, pill "Counts only" (B3) | "Update forge" sends `forge-update` (quiet) |
| 7 | `dormant-with-ready-tickets` | fidelity `dormant`, and the last summary Gaia read in this run held ready tickets | neutral, dashed, pill "Dormant": "This forge is not running. 3 tickets are ready and nothing drives them." and `last command: <command>` | "Start forge" sends `forge-start` (quiet) |
| 8 | `machine-limit-reached` | tickets wait for a machine slot | never a callout: it shows on the Forges view's machine panel (A4) and in the rail's This machine (B2) | none |

A dormant forge Gaia read nothing of in this run has no look: Gaia never reads a board's files, so it does not know the ready count. A
forge whose repository is gone has none either. Every callout with "Update forge" also holds the pending restart above.

On screen the callouts are drawn by kind, not by the row order: unreachable, Restart failed, launches held, older, newer, new code,
counts only, dormant; forges of one kind keep the document's order (`AttentionModel.ts`).

**States.**

- Nothing waits: the list's place reads "Nothing waits on you."; the figures stay, with "waiting on you" at 0.
- No look: the "Forges that need a look" section is absent.
- An update on its way: the callout's "Update forge" is disabled, and only that forge's buttons are.
- An update left a restart pending: the pending step under its callout (above).
- A failed restart: Invoice Service's error callout comes before the two looks A1 draws (`ArtboardScreens.tsx`,
  `MONITOR_WARNING_SCREENS`).
- Agents stopped on a network outage: the outage row heads the list, primary, and the count in the waiting pill counts it once
  (`page/testing/fixtures/fleet-outage-endings.ts`).
- A forge at a version this Gaia cannot talk to: see the versions document, U1.
- No forge registered: B4. A forge not fully read: B3. Before the first fleet document the view shows its title and lead only.

**Acceptance.**

1. With the fixture `fleet-five-forges`, the list holds the five rows of the artboard in its order: Invoice Service E4 (Escalated), Example
   Storefront #015 (Draft), Research Wiki E1 (Question), Invoice Service #031 (Accept), Example Storefront E2 (Question); only the first
   button is primary. (`AttentionModel.spec.ts`, `AttentionLayout.spec.tsx`, `AttentionOrderUtil.spec.ts`)
2. A new entry in a forge's snapshot appears in the list without a reload, and a closed one leaves. (`AttentionView.spec.tsx`)
3. The Answer button of E2 opens Example Storefront in place at `#forge/example-storefront-7c41/questions/E2`.
   (`AttentionModel.spec.ts`, `AttentionLayout.spec.tsx`)
4. "Update forge" sends `forge-update`, is disabled while it is on its way, and the callout leaves when the forge reports `serving`.
   (`AttentionLayout.spec.tsx`, `AttentionView.spec.tsx`)
5. An age is computed from the forge's stamp and the page's clock for display only; no order depends on it. (`AttentionModel.spec.ts`)
6. The head's figures stay on one line at 1440 px in both themes. (By eye, `Screens.visual.spec.ts`.)

## A2. Agents

Every agent at work on this machine in one table, grouped by forge, beside a panel that shows what its forge reports of the agent
User selects. Gaia sends an agent no message and stops no single job: those are sent from the agent's own forge, and the panel
says so.

Built in: `page/views/agents/` (`AgentsModel.ts`, `AgentsFilters.ts`, `AgentsTable.tsx`, `AgentsView.tsx`,
`SelectedAgentPanel.tsx`, `utils/AgentTextUtil.ts`).
Held by: `page/views/agents/AgentsModel.spec.ts`, `AgentsFilters.spec.ts`, `AgentsView.spec.tsx`, `SelectedAgentPanel.spec.tsx`,
`utils/AgentTextUtil.spec.ts`, and the A2 screen of `page/Screens.visual.spec.ts` (painted from `page/testing/ArtboardScreens.tsx`
with `fleet-five-forges` and J4 of Example Storefront selected).

The fleet document's agent rows come from the server ordered by project name, then by job id read as a number, so J2 comes before
J11 (`src/features/fleet/FleetAssembly.ts`); a forge that is hidden in Gaia's settings has no row. The page keeps that order
inside a forge and draws the forges' groups in the registry's order, then any forge the document no longer holds, named by its
tracker id. A value the forge does not report is a dash on screen, never zero.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Page title | Title "Agents", lead "Every agent at work on this machine, per forge. Select one to read what its forge reports.", and three figures: the agents against the machine limit ("10 / 12 agents"; the count alone when no limit is known), the forges with an agent ("4 forges") and the sum of the rows' `tokens` ("821,300 tokens in flight"). Before the first fleet document the title and lead stand alone. | none |
| Role filter | A segmented control (labelled "Role"): All, Builders, Reviewers, each with the count of rows it would leave beside the condition filter as it stands. | A press keeps the selected agent and goes to `#agents[/<trackerId>/<jobId>]?role=builders` (or `reviewers`); All writes no parameter. A value the view does not know reads as All. |
| Condition filter | A segmented control (labelled "Condition"): Every agent, and Needs a look with its count. Needs a look keeps the rows the forge itself flags: `quiet` is true, or the agent waits on a decision. | As the role filter, with `condition=needs-a-look`; Every agent writes no parameter. |
| Order note | "by forge, then job", at the right of the filters. | none |
| Table head | Columns Job, Ticket · last tool, State, Calls, Tokens. | none |
| Group head row | Per forge with a row the filters leave: its condition dot, its name, a `SlotMeter` and mono "4 / 5" "agents" (its own rows against its concurrency limit, whatever the filters leave; the count alone and no meter when it reports no limit), and at the right a note: "Launches held" for a held forge, then "N waits on you" / "N wait on you", joined by " · ". | none |
| Job cell | A role dot (orange builder; teal reviewer; orange dashed ring when the agent waits on User's decision; grey dashed ring when its state is waiting on anything else; an empty space when the role is not known); the mono job id as a link; under it the role word in its role's ink and the running time (`45s`, `12m 04s`, `1h 02m`). | The job link goes to the agent in its forge's board: `#forge/<trackerId>/agents/<jobId>`, or the place the forge names for the job (its `boardRoute`). For a forge that cannot be opened in place (read other than in full or as unreachable) it goes to the forge's row on the Forges view, `#forges?forge=<trackerId>`. |
| Row | The whole row is a select link, named "<Project>, <jobId>". The selected row is marked current, on `--wash` with an inset left edge. | Selects the agent: `#agents/<trackerId>/<jobId>`, keeping the filters' query. |
| Ticket · last tool | Mono ticket ids ("#034", several joined by ", ") and the ticket title on one line; the last tool call in mono under it. | none |
| State | The state word: "Building" or "Reviewing" for a running builder or reviewer, "Running" for another role, "Launching", "Preparing", "Waiting", "Interrupted", "Stopping", "In customs", "Gating", "Merging", "Landing"; a state Gaia does not know as the forge wrote it. Beside it the flags as tags: "asks you · E2" (`warn` tone) when the agent waits on a decision, "quiet · 4 sweeps" (neutral; "quiet" alone when the forge counts no sweeps). | none |
| Calls | A borderless `FillMeter` (orange for a builder or an agent that asks, teal for a reviewer, grey otherwise) and mono "41 / 120"; with no call budget only the count, and no meter at all. | none |
| Tokens | The row's tokens, grouped ("84,210"), right-aligned. | none |
| Footnote | "Gaia shows what each forge reports." | none |
| Selected agent panel, head | "Job", the mono job id, a pulsing role dot, the state word and " · " running time ("Building · 34m 02s"). | none |
| Panel subject and ticket | The role word, the forge's name and the flags; the ticket ids and title as a chip link. | The ticket chip goes where the job link goes. |
| Panel calls and last tool | The calls meter and "58 / 120" then "calls · 122,300 tokens" (only the tokens when the forge reports no calls); "Last tool" and the last tool call in mono. | none |
| What the forge reports | A fact list in mono, each fact only when the forge reports it: Turn ("Mid-turn" or "Between turns"), Calls ("58 of 120"), Tool calls, Subagents ("1 running", or "none"), Messages waiting. | none |
| Last line | Caps "Last line" and the forge's `lastLine` in a mono box, line breaks kept. | none |
| Panel foot | "Gaia shows what the forge reports. Messages and stops are sent from the agent's own forge." and the button "Open J12 in its forge". | The button is a link to the same place as the job link. |

The view's only buttons are the two filters; everything else is a link.

**States.**

- No agent runs: "No agents are running." beside a "This machine" card: the agents ("0 / 12" or "0"), "agents", a `FillMeter` and
  the machine line ("limit 12 of 12 CPUs", or "no limit known · 12 CPUs"). No filter, table or footnote; the panel shows only when
  an agent is selected.
- Filters that leave no row: "No agent matches these filters." in the table's place. A forge the filters leave no row of has no
  group.
- Nothing selected: the panel says "Select an agent to see what its forge reports of it." over the foot's note.
- The selected job ended: the panel keeps "Job" and the job id over the forge's name and says "This agent is no longer running.",
  with the foot's note and no link. A selected agent the filters hide keeps its panel.
- A `counts-only` forge (read through its summary): its rows show the job id, role, tickets, state and tokens, and a dash in every
  other place; its panel lists no fact and says "The forge reports no last line for this agent."

**Acceptance.**

1. With `fleet-five-forges` the table holds the 10 rows of the artboard under the heads of its four forges, and the tokens sum to
   821,300 (`AgentsView.spec.tsx`, `AgentsModel.spec.ts`).
2. "Needs a look" leaves exactly the rows where the forge reports `quiet` or a waiting decision (`AgentsFilters.spec.ts`,
   `AgentsView.spec.tsx`).
3. The Calls meter is absent, not empty, when `callBudget` is null (`AgentsModel.spec.ts`, `AgentsView.spec.tsx`).
4. The selected row survives a new fleet document; when its job ends, the panel says "This agent is no longer running."
   (`AgentsModel.spec.ts`, `AgentsView.spec.tsx`).
5. The 10 rows and 4 group heads fit at 1440 x 1016 in both themes (`page/Screens.visual.spec.ts` paints it; checked by eye).

## A3. Activity

What happened across the fleet, newest first, as each forge words it, beside today's landings and tokens per forge and the usage
line the forges report.

Built in: `page/views/activity/` (`ActivityModel.ts`, `ActivityView.tsx`); the bound in `src/shared/constants/Limits.ts`; the
merge in `src/features/fleet/FleetAssembly.ts`.
Held by: `page/views/activity/ActivityModel.spec.ts`, `ActivityView.spec.tsx`, and the A3 screen of `page/Screens.visual.spec.ts`.

The server takes each forge's newest 50 entries (`LIMITS.activityEntriesShownPerForge`), merges every forge's into one list
ordered by `at`, newest first, and hands it to the page in that order; the page compares no stamp to reorder it. Ordering by stamp
is for display only. A dormant forge keeps the entries it last reported for as long as Gaia runs, while its `today` and `usage` go
with its Hephaestus. A hidden forge has no entry. Gaia stores no activity. The text of a row is the forge's, shown unedited.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Page title | Title "Activity", lead "The newest 50 entries of each forge, as each forge words them.", figures: what needs User ("5 need you", orange; with "+" while a forge is not fully read), then "6 landed today" and "1.24M tokens today", each only when a forge reports `today`. Before the first fleet document the title and lead stand alone. | none |
| Kind filter | A segmented control (labelled "Kind"): Everything, Needs you with its count, Landed with its count, Agents, Forge. The counts are the entries of that kind under the chosen forge, whatever kind is chosen. | Keeps the entries of that category; Everything keeps all. Kept in the view, not the route. |
| Forge filter | A segmented control (labelled "Forge"): All forges, then the first three forges that have an entry, in registry order; past three, a last segment "N more" with a chevron opens the menu "More forges" with the rest. When the chosen forge is in the menu, the segment shows its name and is pressed. | Keeps that forge's entries; All forges keeps every forge's. A menu item chooses its forge and closes the menu; Escape or a press outside closes it. A chosen forge that leaves the document is no longer chosen. |
| Table | Columns At (the clock time as a mono stamp, with month and day, "11-13 16:00", when of another day), Forge, Kind (a dot and the word: Agent with the job's role dot while the forge still reports the job, else a blank space; Needs you, orange dashed ring; Landed, green; Forge, grey), What happened (the forge's text, whole as its title). Compact rows. | A row with a route is a link stretched over the row, ringed on hover, to `#forge/<trackerId>/<tab>[/<item>]` (the entry's `boardRoute`, such as `#forge/<trackerId>/agents/J4`); a row without one is plain text. |
| Footnote | "A dormant forge shows its entries up to its stop. Older entries are in each forge's own log." | none |
| Landed today | A card: caps "Landed today · 6" with the total in mono, then per forge that reports `today` its name, its `deliveredTickets` and a green bar relative to the largest. | none |
| Tokens today | The same card for `today.tokens`: "Tokens today · 1.24M", values as "512k", grey bars. | none |
| Usage | "Usage", then one line per distinct reading (the limit is the machine's, so forges normally share one): a grey dot and "under its limit · window resets 16:00" (or "under its limit" when no current window is reported), or an orange dot and "five-hour limit hit · resets 16:00" (or "limit hit · resets 16:00" with no window named) for a forge that hit its limit. The trailing clock time is a mono stamp. Then "As the forges report it." | none |

The view draws no forge warning or notice; the only warning it shows is the usage reading's orange dot at the limit.

**States.**

- No entry at all: "No forge has reported activity yet." in the table's place.
- No entry the filters keep: "No entry matches these filters."
- No forge reports `today`: each side card shows its head without a total and "No forge reports it."; with nothing landed anywhere
  no bar is drawn.
- No forge reports usage: the Usage part is absent.
- A forge that reports no `today` (a dormant or missing forge) is absent from both side cards, not shown as 0.

**Acceptance.**

1. Rows from several forges interleave by `at`, newest first; with `fleet-five-forges` the table holds the fixture's 16 rows in
   the server's order (`ActivityModel.spec.ts`, `ActivityView.spec.tsx`).
2. A forge that reports no `today` is absent from the two side lists, not shown as 0 (`ActivityModel.spec.ts`,
   `ActivityView.spec.tsx`).
3. The Tokens today total is the sum of the forges' `today.tokens`, and the page title's figures total what the side lists show
   (`ActivityModel.spec.ts`, `ActivityView.spec.tsx`).
4. The usage line shows when the current window resets when the forge reports it ("under its limit · window resets 16:00")
   (`ActivityModel.spec.ts`, `ActivityView.spec.tsx`, `page/Screens.visual.spec.ts`).

## A4. Forges and this machine

Every forge on this machine with its condition, its agents and its controls, beside this machine's agent limit and Gaia's own settings
and facts. The view is `#forges`; `#forges?forge=<trackerId>` selects that forge's row and scrolls it into view.

Built in: `page/views/forges/` (`ForgesView.tsx`, `ForgesModel.ts`, `ForgesLayout.tsx`, `GaiaPanelModel.ts`, `GaiaPanel.tsx`,
`AddRepositoryDialog.tsx`, `FormDialogDismissal.ts`, `constants/AgentLimits.ts`), `page/shared/add-repository/`,
`page/shared/LookAgainButton.tsx`, `page/components/Refusal.tsx`, `src/shared/constants/GaiaSettingsDefaults.ts`.
Held by: `page/views/forges/ForgesModel.spec.ts`, `ForgesLayout.spec.tsx`, `ForgesView.spec.tsx`, `GaiaPanelModel.spec.ts`,
`GaiaPanel.spec.tsx`, `AddRepositoryDialog.spec.tsx`, `FormDialogDismissal.spec.ts`, `page/shared/add-repository/*.spec.*`,
`page/Screens.visual.spec.ts` (A4, and the later states painted over it), fixture `page/testing/fixtures/fleet-five-forges.ts`.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Page title | "Forges", the lead "Every forge on this machine, what each one runs, and the limit the machine sets.", figures: registered (hidden forges included), running (a forge Gaia cannot talk to counts as running), and only when non-zero "starting" (orange), "hidden" and "not read" | "Look again" (plain) sends `fleet-look-again`, off while one is on its way. "Add a repository", the view's one primary, goes to `#forges/add`. |
| Look again's refusal | Above the table, while `fleet-look-again` failed: "Gaia could not Look again: " with code and sentence | "Try again" sends `fleet-look-again`; "Dismiss this refusal". |
| Table | A `DataTable` labelled "Forges", tall rows set close; columns Forge, Hephaestus, Agents, Waiting, Code, and Controls (its head visually hidden). One row per shown forge whose repository is there, in registry order. The row the route names is selected. | See the cells below. |
| Forge cell | Condition dot, the project name, and under it the root read from `~` in mono, its full path as the element's title | none |
| Hephaestus cell | The condition word in sentence case (`page/shared/utils/ForgeTextUtil.ts`): "Live", "Paused", "Launches held", "Restarting", "Starting", "Dormant", "Unreachable", "Not readable", "Needs update", "Crashed", "Down", "Stopped supervising". Held, starting and needs update read in orange; paused, dormant, not readable in the secondary ink. Under it a detail: "since 09:12" (live, held, restarting), "1 agent finishing · starts no new job" (paused), "forge start · waiting for its API" (starting), "stopped 12:20" or "the forge program was not found" (dormant), "as last reported 13:02" or "stopped answering" (unreachable), "newer than this Gaia", "older than this Gaia", "stays off until started" or "suspected crash before a reboot" with the error name (crashed), "gone or hung · last reported …" (down), "its agents wait for a resume" (hung). Clock times, versions and paths are mono, words are not. | For a forge with versions, the versions subline takes the detail's place; for any verdict but current it is a disclosure that opens the versions pair under the row (the versions document, U2). |
| Agents cell | While Hephaestus runs and is read in full, or while the forge starts: a compact `NumberStepper` led by "4 /" around the forge's limit, unit "agents". Otherwise the plain "4 / 5", nothing when the document holds no figure, and "not read" for a forge Gaia cannot talk to. | Each side sends `forge-concurrency-set` with the limit one lower or higher ("Lower <project>'s agent limit", "Raise <project>'s agent limit"); a side is off at 1 and at the forge's ceiling, 10 (`AGENT_LIMITS`). The stepper is off while the forge starts, while its row is busy, and where Gaia cannot carry commands to its Hephaestus. |
| Waiting cell | What waits on User in this forge as an orange `CountBadge`; nothing at zero or unknown; "not read" for a forge Gaia cannot talk to | none |
| Code cell | The first seven characters of the code version, as a mono id | none |
| Controls cell | Compact buttons by condition (table below) | "Pause" sends `forge-pause`; "Unpause" `forge-unpause`; "Start" `forge-start`; "Stop" opens the Stop dialog under the row (B2); "Open" goes to `#forge/<trackerId>`; "Look again" sends `fleet-look-again`; "Update forge" `forge-update`. A control Gaia cannot send carries why, naming both versions, as its title. |
| Under a row | In order: an ahead forge's quiet versions line; the versions pair and its sentence when shown (U2); the forge's notice that its Assistant cannot come up, in Gaia's words, as a status ("This forge's Assistant cannot come up, so its open incidents take their defaults.", worded by the server in `src/adapters/page-api/ForgeSentenceUtil.ts`); the outage count "2 agents stopped on a network outage"; the Stop dialog (B2); then, indented: "Updating the forge…" beside a starting ring while Update forge is on its way to an older forge, the row's refusal (B2), and a pending restart drawn without an edge | The refusal's "Try again" and "Dismiss this refusal"; the pending restart's "Restart" (`forge-restart`, primary) and "Dismiss the pending restart". |
| Notes under the table | While a row can open its versions: the versions explanation (U2). While a control is in use: "A control stays disabled while its command is on its way. A refusal is the forge's own sentence, shown beside the control that caused it." | none |
| Held forge's banner | Under the table, one per held forge, labelled "<project>: Launches held": orange edge, held dot, the name, "Launches held.", the forge's held notice, or "Its install version changed. Nothing launches until this forge is updated.", then "Its 2 agents keep running." when any run | "Update forge" (quiet, at full height) sends `forge-update`. Under the banner: a refusal of `forge-update` or `forge-restart`, and the restart an update left pending: `PendingStep` "Updated; restart pending." "Its Hephaestus runs the old code until it restarts." with "Restart" (`forge-restart`, the held area's one primary) and "Dismiss the pending restart". |
| Not found | Section head "Not found · 1"; per forge whose repository is gone: the dot, the name, a neutral "Missing" pill, "~/development/legacy-importer · the repository folder is gone" | "Hide in Gaia" sends `forge-hide`; its refusal shows under the entry. |
| Hidden in Gaia | A folded `details` group, "Hidden in Gaia · 1" with a chevron; per hidden forge: dot, name, its root and condition word ("~/development/old-prototype · dormant") | "Show again" sends `forge-unhide`; its refusal shows under the entry. |
| This machine | In the aside, headed "This machine". "Agent limit" with a `NumberStepper` around the machine limit (or "—" while none is known); the sentence "At most the number of CPUs, which is 12 here. No forge starts an agent past it, whatever its own limit." (only the first sentence at the limit); "10 / 12 agents" and a `SlotMeter` ("10 of 12 agents"); the facts "Agents running", "Asked for by the forges' own limits" and "Tickets waiting for a machine slot" (when known). While a forge's agents cannot be read the figure is a floor, "8+", and a line says "Example Billing is not counted: this Gaia cannot read its agents." | The stepper sends `machine-agent-limit-set` one lower or higher ("Lower the machine's agent limit", "Raise the machine's agent limit"); minus is off at 1, plus at the CPU count; both are off while a limit is on its way. A refusal shows in the panel: "The forge refused Set the machine's agent limit: …". |
| Gaia | In the aside under This machine, headed "Gaia". One switch: "Notify me while Gaia is open", with the text button "What notifies" under its label. Facts, each label over its value: "Forge program" (from `~`, or "not found" in words), "Registry" (from `~`); then "This Gaia": version, built for forge, address (`127.0.0.1:4790`). A path may break after a slash only. | The switch sends `settings-set` with its one setting turned over (`notifications` with `enabled` turned over and every kind kept). "What notifies" opens the dialog of C2. A refused change shows under the switch with "Try again" (the same switch's change) and its dismissal. The version facts belong to the versions document (U2). |

### Which buttons a row shows

From `BUTTONS_BY_CONDITION`, `BUTTONS_BY_PRESENCE_OFF` and `buttonsOfAForgeGaiaCannotTalkTo` in `page/views/forges/ForgesModel.ts`.

| Condition | Buttons |
| --- | --- |
| `live` | Pause, Stop, Open |
| `paused` | Unpause (primary), Stop, Open |
| `held` | Stop, Open; the banner's Update forge |
| `restarting` | none; the word says what is happening |
| `starting`, or Gaia's own `forge start` on its way to a dormant forge | one disabled "Starting" |
| `dormant` | Start (primary); off when neither the registry entry nor Gaia knows a forge program, and the detail says "the forge program was not found" |
| `unreachable` | Look again, Stop |
| `unreadable` | none |
| `missing` | not in the table: its Not found entry's Hide in Gaia |
| presence `crashed` | Start, Look again |
| presence `down` | Start, Look again, Stop |
| presence `hung` | as its condition |
| verdict `older` (Needs update) | Update forge (primary; plain while a restart it left is pending; "Updating", off, while on its way), Stop off with its title |
| verdict `newer` | Pause off and Stop off, each with its title |
| verdict `ahead` | as its condition |
| hidden in Gaia | not in the table: its entry's Show again |

Open shows only where the forge opens in place: read in full, or unreachable (`ForgeContractUtil.canOpenInPlace`). Every button of a
row is off while a command to that forge is on its way or its Stop dialog is open. Pause, Unpause, Restart and the limit are off where
Gaia cannot carry a command to its Hephaestus: it did not answer the last read, or its control contract is not the one Gaia knows. Stop
stays on for a forge whose Hephaestus does not answer, since the forge program then stops it.

### Add a repository

At `#forges/add` the form of B4 opens in the design-system library's widest `Dialog` over this view, titled "Add a repository",
closed by "Close Add a repository". The form is `page/shared/add-repository/`, shared with B4.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Folder | `TextField` "Repository folder" in mono, placeholder "~/development/example-storefront" | "Choose a folder" sends `path-choose` with `what: 'folder'`; the chosen path fills the field, a cancelled choice changes nothing; off while a choice is on its way. |
| Project name | `TextField` "Project name", placeholder "Example Storefront", the hint "Starts as the folder's name." | The name follows the folder's last part until User types one, and again once User clears it. |
| Foot of the form | "Gaia sets up the board in that repository and starts its Hephaestus.", or with no forge program "Add and start waits for the forge program. Choose it below." | "Add and start" (primary) sends `forge-add` with the trimmed folder as `root` and the trimmed name; it can be sent only with both filled, a forge program known, and no add on its way. |
| Refusals | "Gaia could not Choose a folder: …" under the form only for the form's own folder choice; the refusal of `forge-add` ("The forge refused Add and start: …"), which is where a refusal of `init` or `start` shows | "Try again" sends the same choice or add; "Dismiss this refusal". |
| Missing forge program | Only while neither Gaia's settings nor Gaia know a forge program: a dashed status line, "The forge program was not found. Gaia can show running forges without it, but cannot start one." | "Choose the forge program" sends `path-choose` with `what: 'file'`, then `settings-set` `forgeProgramPath` with the chosen path; a refusal of either shows under the line. |
| Dialog foot | "Cancel" (ghost) | Closes the dialog and goes to `#forges`. |

The dialog closes on Cancel, its close button and Escape, and once the add went through (answered `done` or `nothing-to-do`) while it
is still open; never on a click beside it (`FormDialogDismissal.ts`).

**States.**

- Before the first fleet document: the title stands alone, with no figure, no button and no content.
- No forge registered: the table's place says "No forge is registered on this machine yet."; the machine panel shows "—" and "No forge
  is registered to enforce a machine limit."
- Every forge hidden or gone: "Every forge here is hidden in Gaia or has lost its repository."
- No forge reports a machine limit: "—", the stepper absent, and "This forge version does not enforce a machine limit." when a forge
  answered, or "No running forge has reported a machine limit yet." when none did.
- At the machine's limit: B2.
- A forge held: its banner under the table. An update that left a restart pending: on the banner of a held forge, else under the row;
  it stays until a restart, stop or update of that forge succeeds or User dismisses it, and a pause does not clear it. Under the row of a
  forge Gaia cannot talk to it reads "Gaia reads it after the restart."
- A forge hidden in Gaia: counted in the title, folded under "Hidden in Gaia · N".
- A forge's monitor notice that its Assistant cannot come up: a status line under its row; no other row carries a notice.
- Agents a network outage stopped: each forge's own count under its row ("1 agent stopped on a network outage"); the resume itself is
  offered on Attention (A1).
- A forge at another version than this Gaia is built for: "Needs update" or "Not readable", "not read" for its agents and what waits,
  and the versions disclosure (U2).
- Gaia's settings file newer than this Gaia: "Gaia's settings were written by a newer Gaia. This Gaia runs on its defaults and leaves that
  file as it is." and the switch off. Unreadable: "Gaia's settings could not be read. Gaia runs on its defaults until a change here
  writes them again.", the switch on. Absent or read: nothing said. The defaults are `GAIA_SETTINGS_DEFAULTS`: notifications on.
- A settings change on its way: every switch off until it answers.

**Acceptance.**

1. Each condition shows exactly its buttons (`ForgesModel.spec.ts`, "which buttons a row shows").
2. A limit above the CPU count cannot be chosen; the forge's refusal shows in the machine panel when it comes anyway
   (`ForgesModel.spec.ts`, `ForgesLayout.spec.tsx`, "this machine").
3. Without a forge that enforces a machine limit the panel says "This forge version does not enforce a machine limit." and offers no
   stepper (same specs).
4. A row offers no way to a forge's own page, since a forge serves none: Open goes to the forge's board in Gaia, B1
   (`ForgesModel.spec.ts`, "which buttons a row shows").
5. On a held forge with a pending restart, Restart is the only primary button of its held area (`ForgesLayout.spec.tsx`,
   `Screens.visual.spec.ts`).
6. Each root carries its full path as its title, for a window too narrow to print it whole (`ForgesLayout.spec.tsx`,
   `Screens.visual.spec.ts`).
7. "Add and start" is off without a folder, a name or a forge program, and while an add is on its way; a refusal of `init` or `start`
   shows in the dialog, and the dialog never closes on a click beside it (`AddRepositoryForm.spec.ts`, `AddRepositoryDialog.spec.tsx`,
   `FormDialogDismissal.spec.ts`).
8. Each settings switch sends `settings-set` with only its own setting turned over, and is off for a settings file newer than this Gaia
   (`GaiaPanelModel.spec.ts`).

## B1. A forge in place

One forge's board inside Gaia, under Gaia's bar: the forge's name, its condition and controls, how it is present, then its board,
which is Gaia's own. It is the one way a board opens, at `#forge/<trackerId>[/<tab>[/<item segments>]]`.

Built in: `page/views/forge/` (`ForgeView.tsx`, `ForgeModel.ts`, `ForgeLayout.tsx`, `ForgePresenceModel.ts`,
`ForgePresenceLayout.tsx`, `CrashLogRequest.ts`), the board under `page/board/` (mounted through `page/board/Board.tsx`), the
route in `page/shared/HashRouter.ts` and `page/board/shell/BoardRouter.ts`, the bar's words in
`page/shared/utils/ForgeCommandTextUtil.ts`.
Held by: `page/views/forge/ForgeView.spec.tsx`, `ForgeModel.spec.ts`, `ForgeLayout.spec.tsx`,
`ForgeModel.runningVersions.spec.tsx`, `ForgePresenceModel.spec.ts`, `ForgePresenceLayout.spec.tsx`, the forge-in-place specs at
other versions (`ForgeModel.versions.spec.ts`, `ForgeLayout.versions.spec.tsx`, see the versions document, U3),
`page/shared/HashRouter.spec.ts`, `page/shell/GaiaApp.spec.tsx`, and the B1 screens of `page/Screens.visual.spec.ts`
(`ARTBOARD_SCREENS` and `CRASHED_FORGE_SCREENS` in `page/testing/ArtboardScreens.tsx`).

The route. `#forge/<trackerId>` opens the forge at its default tab; `/<tab>` names one of the board's tabs (`kanban`, `waves`,
`progress`, `epics`, `tickets`, `agents`, `questions`, `assistant`, `intake`, `pipeline`, in that order); the segments after it
name the item the tab opens, each encoded. A path that names no tab, and the older form with `#` before the tab
(`#forge/<id>/#questions/E2`), read as the forge with no tab. The board falls back to the stored tab, then to the first tab it
shows. The forge view hands the shell no page title: the bar heads the view.

What sits under the bar is the board, drawn by `page/board/`: its own header with the forge's title and the tab row, then the main
area where the routed tab's view draws, with the detail panel and the question panel beside it. The board reads through Gaia's
relay, never the forge's own page. Flint, the sprite, is drawn over the board, once per forge: the board's shell is keyed by the
tracker id, so one forge's board and its Flint unmount before another's mount, and the Kanban tab's strip holds Flint's slot. This
section does not describe the board's views.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Brand bar | The shell's brand bar, without its theme button on this route. | None of its own here. |
| Bar | The forge's mark (`ForgeMark`, from the brand library); the forge's name as the view's heading (its tracker id until the fleet document names it); the condition dot beside its word in sentence case ("Live", "Paused", "Unreachable", "Crashed", "Needs update", ...); one short line of agents and what waits, the figures in mono: "`4 / 5` agents · `2` wait on you", and "as last reported `13:14`" first for a forge that stopped answering, and "`N` stopped on an outage" last where the forge reports one. The line's title is the whole reading: the same with a usage limit hit ("usage limit hit · resets 14:00") and "since 09:12". | See the controls below. |
| Pause / Unpause | "Pause" (quiet) for a live forge; "Unpause" (primary) for a paused one; neither for any other condition. | Sends `forge-pause` or `forge-unpause` for the forge. |
| Stop | "Stop" with a down chevron, for a live, paused, held or unreachable forge. | Opens the Stop question as a popover under the button; pressing Stop again or Cancel closes it. |
| Stop question | Labelled "Stop Example Storefront". The question "Stop Hephaestus of Example Storefront? 4 agents are running."; while agents run, two choice cards: A "Stop Hephaestus only" ("The 4 agents finish what they are on under Talos. Nothing new starts until this forge is started again."), chosen when it opens, and B "Stop the agents, then Hephaestus" ("The 4 agents wind down first and their tickets return to the board. Then Hephaestus stops."); then what keeps waiting: "2 entries keep waiting on you while it is stopped." With no agent running it has no choices. | "Stop" (primary) sends `forge-stop` with `agents: 'keep'` for A or with no agent running, `agents: 'stop-first'` for B, and closes the popover. "Cancel" closes it. |
| Open in new tab | "Open in new tab", its arrow after its words. | Opens the same route of Gaia's own address (the tab and item kept) in a new browser tab; sends no command. |
| Running versions line | The bar's second line, a group named "The running and the newest Hephaestus and Talos": "Hephaestus `<code>`", and "Talos protocol `<n>` · `<code>`" or "Talos not running"; a pair whose newer version is installed adds " · newer installed `<version>`" and is marked in orange. Each pair's title is its whole reading ("... Restart Hephaestus to run it."). No pair while the forge does not answer. | "Restart Hephaestus" sends `forge-restart` (a restart); "Restart Talos" sends `forge-talos-restart` (its clean quit). Both quiet, enabled only while the forge answers and its control contract is known. |
| Refusal | Under the bar: the refused command's name, the forge's code and sentence, as `Refusal` draws them; the forge's own sentence verbatim. | Dismiss takes it away. "Try again" only for Pause, Unpause and Restart Talos, which it sends again as they were; a refused Stop asks its question again instead. |
| Presence alert | Under the bar, for a forge that crashed, is down or stopped supervising: an error callout titled with the forge's name and its word, "Forge crashed" ("It stays off until it is started. Nothing runs until then."), "Forge is down" ("Its Hephaestus does not answer: it is gone, or hung so that it does not answer.") or "Not supervised" ("The forge stopped supervising its agents. They stopped at the end of their turn and wait for a resume."). A crash the registry suspects leads with "Suspected crash before a reboot." A crash adds the registry's crash summary as a mono line: "hephaestus · TypeError: Cannot read properties of undefined (reading 'ticketIds')". | "Start" (primary) sends `forge-start`, for a crashed or down forge; none for one that stopped supervising. |
| Crash logs | "Crash logs", newest first, for a forge that serves again: "crash 1" in mono, "Hephaestus crashed" (or "Suspected crash before a reboot: Hephaestus crashed"), the time it was recorded. | "Show log" asks Gaia's server for that log (`GET /api/v1/forges/<trackerId>/crash-logs/<number>`), once: "Reading…", then the log in place of the button: "Crash log 1", the error line and stack in mono, "Active jobs" (or "The board could not be read at the crash."), "Log" with the tail of the forge's log (or "The forge's log could not be read at the crash."). A read that gives none says "Gaia could not read this crash log. It is readable while the forge serves." beside Show log. |
| Waiting work | "Waiting work": each interrupted job by its id in mono, its cause in words ("Supervision lost", "Agent crashed twice", "Network outage", ...) and "kind · #tickets · what it waits for" ("waits for a resume", "resumes by itself", ...). | "Resume" (quiet) on a job that waits for an instruction sends `forge-interrupted-work-resume` for that job; "Resume all" (primary) sends it for all. Gaia resumes nothing by itself. |
| Area | The board, for a forge read in full or as a Hephaestus that stopped answering last reported it. Otherwise, in a bordered area: "Gaia cannot read this forge's board." for a forge read through its summary, dormant or whose repository is missing; the versions notice for a forge at a version this Gaia cannot talk to (the versions document, U3); "The registry names no forge with this id." with the id in mono for an unknown tracker id. | None but the board's own. |

While a command to the forge is on its way, every control of the bar waits for it, Open in new tab included, and so do the
restarts and the presence's Start and Resume buttons. A forge whose control contract Gaia does not know shows Pause and Stop
disabled and keeps Open in new tab.

**States.**

- Before the first fleet document: the bar holds the tracker id alone, with no condition, line or control, and nothing under it;
  no board is mounted or asked for.
- Waiting for the board's first read: the bar is whole, and the board's main area says "Waiting for the forge's first board."
- Live (artboard B1, Example Storefront at E2 in `FLEET_FIVE_FORGES`): "Live", "`4 / 5` agents · `2` wait on you", title "4 / 5
  agents · 2 wait on you · since 09:12"; Pause, Stop, Open in new tab; the board at its Questions tab with E2 open.
- Paused: "Paused", Unpause as the primary, Stop, Open in new tab.
- Unreachable: "Unreachable", a line led by "as last reported" and its time; Stop and Open in new tab; the board stays, as last
  reported.
- Off after a crash (`FLEET_STOREFRONT_CRASHED` in `page/testing/fixtures/fleet-storefront-crashed.ts`, which no artboard draws):
  "Crashed" by the failure dot; the "Forge crashed" alert with the crash summary's mono line and Start; Stop and Open in new tab
  in the bar. The crash log cannot be read while the forge does not answer.
- Started again after a crash (`FLEET_STOREFRONT_STARTED_AFTER_A_CRASH`): no alert; "Crash logs" lists crash 1, and once User
  opens it, the log shows in place of Show log. A new start of the forge's Hephaestus forgets what was read, so a log is read
  again.
- Down or not supervising: the alert of each, with Start for a down forge only.
- Counts only, dormant or repository missing: "Gaia cannot read this forge's board." in place of the board, with no way to open
  anything else; controls as the condition allows.
- At a version this Gaia cannot talk to (newer or older): the bar and the notice of the versions document, U3.
- No such forge: no bar but the tracker id, and "The registry names no forge with this id."
- A refusal: under the bar until dismissed.
- The brand bar has no theme button on this route, so B1 paints the very same markup in both themes.

**Acceptance.**

1. From Attention, Answer on E2 links to `#forge/<trackerId>/questions/E2`, which shows Example Storefront in place with the board
   at its Questions tab and E2 open (`ForgeView.spec.tsx`, `Screens.visual.spec.ts`). The older form with `#` before the tab reads
   as the forge with no tab (`HashRouter.spec.ts`).
2. Back in the browser history returns to Attention: a route is a hash fragment set through `window.location.hash`, which adds a
   history entry (`page/shared/HashRouter.ts`; no spec holds it).
3. After the forge's Hephaestus restarts, its board reads again without User doing anything: the board reads at the start, after
   each `board-changed` and once a lost stream is live again (`page/board/shell/BoardApp.dom.tsx`), and the bar follows each fleet
   document.
4. No token and no session code appear in the page's markup, requests, storage or address: the page's markup carries no session
   code and no frame (`ForgeView.spec.tsx`), and the board's clients send the session cookie and no Authorization header
   (`page/board/api/*Client.spec.ts`).
5. The route has no theme button (`page/shell/GaiaApp.spec.tsx`, `Screens.visual.spec.ts`).
6. Each condition shows exactly its controls: live Pause and Stop, paused Unpause (primary) and Stop, held and unreachable Stop
   only, any other neither; Open in new tab always; every control waits while a command to the forge is on its way
   (`ForgeModel.spec.ts`, `ForgeLayout.spec.tsx`, `ForgeView.spec.tsx`).
7. A forge off after a crash shows the alert with the registry's crash summary and Start; started again, it lists its crash log,
   read only when User opens it (`ForgePresenceModel.spec.ts`, `ForgePresenceLayout.spec.tsx`, `Screens.visual.spec.ts`).

## B2. Start, stop and a refusal

The Forges view (A4) with its controls in use: Stop asked under its row, a paused forge, a refusal, a forge starting, and the machine at
its limit. Every part B2 does not change is as A4.

Built in: `page/views/forges/ForgesModel.ts`, `ForgesLayout.tsx`, `ForgesView.tsx`, `page/shared/utils/ForgeCommandTextUtil.ts`,
`page/shared/utils/CommandFailureTextUtil.ts`, `page/components/Refusal.tsx`, `page/api/CommandSender.ts`, `page/shared/MachineLoadModel.ts`
(the rail's line).
Held by: `page/views/forges/ForgesModel.spec.ts`, `ForgesLayout.spec.tsx`, `page/shared/utils/ForgeCommandTextUtil.spec.ts`,
`page/api/CommandSender.spec.tsx`, `page/Screens.visual.spec.ts` (B2), fixture `page/testing/fixtures/fleet-at-limit.ts`, with the
command states set in `page/testing/ArtboardScreens.tsx`.

| Row or part | Shows | Controls and effect |
| --- | --- | --- |
| Example Storefront: the Stop dialog | Opened by the row's "Stop", in a card under the row, which is shown selected; a `ConfirmStrip` labelled "Stop Example Storefront": "Stop Hephaestus of Example Storefront? 4 agents are running." Two `ChoiceOption` cards: "Stop Hephaestus only" (chosen first) with "The 4 agents finish what they are on under Talos. Nothing new starts until this forge is started again.", and "Stop the agents, then Hephaestus" with "The 4 agents wind down first and their tickets return to the board. Then Hephaestus stops." One agent is worded in the singular. When anything waits: "2 entries keep waiting on you while it is stopped." | "Cancel" closes it. "Stop" (primary, the one place on this view Stop is primary) sends `forge-stop` with `agents: 'keep'` or `'stop-first'`, and closes the dialog once answered. While open, that row's controls are off. With no agent running, or a Hephaestus that does not answer Gaia, there is nothing to choose and Stop sends `agents: 'keep'`. A forge stopped elsewhere drops the dialog. |
| Research Wiki: paused | Neutral dot, "Paused" in the secondary ink, "1 agent finishing · starts no new job" | "Unpause" is the row's primary and sends `forge-unpause`; Stop and Open as A4. |
| Example Mobile App: a refusal | Under the row, indented: "The forge refused Stop: `hephaestus-still-live` Hephaestus did not stop within its tries." The code is mono; the sentence is the forge's own, as Gaia's server answered it. Never a red button. When Gaia itself refused or nothing answered, it reads "Gaia could not Stop: " with Gaia's code and sentence. | "Try again" (compact) sends the same command: a command naming only its forge from its kind, a Stop or a limit only as this view last sent it (no Try again otherwise). "Dismiss this refusal" removes it. |
| Design System: starting | Gaia's own `forge start` on its way: orange ring dot, "Starting" in orange, "forge start · waiting for its API", the stepper shown and off, one disabled "Starting" button. A forge that reports itself `starting` reads the same. | none |
| Head figures | registered, running, and "starting" in orange while a forge starts | as A4 |
| Note under the table | "A control stays disabled while its command is on its way. A refusal is the forge's own sentence, shown beside the control that caused it." while a command is on its way, a Stop dialog is open, a forge starts or a refusal shows | none |
| This machine at its limit | The card's border in the accent edge, an "At the limit" accent pill beside the title, "10 / 10" in orange, every slot used; only the sentence "At most the number of CPUs, which is 12 here."; then "The machine is at its limit. 3 ready tickets wait for a slot: 2 in Invoice Service, 1 in Research Wiki." (forges read in full only, in registry order; "The machine is at its limit." alone when no count waits); the fact "Tickets waiting for a machine slot" marked for attention | The stepper as A4. |
| Rail | The machine line of the shell's rail: "at the limit · 3 tickets wait" over "limit 10 of 12 CPUs" (the shell's section) | none |

**States.**

- A command on its way to a forge: every control of that row off, no other row's; that forge takes no second command meanwhile.
- A refusal: shown beside the control that caused it, until dismissed or the next command to that forge succeeds. A held forge's refused
  Update forge or Restart shows on its banner, not under its row.
- An update that answered "restart pending": A4's pending restart.
- A start Gaia sent: starting until the fleet document reports what came of it; then the forge's own condition, or Dormant with the
  refusal on the row.
- The page's session lost or controls not allowed to act: nothing is sent and the caller is told why (`CommandSender.spec.tsx`).

**Acceptance.**

1. Stop with "Stop Hephaestus only" sends `forge-stop` with `agents: 'keep'`; the other choice sends `stop-first`
   (`ForgesModel.spec.ts`, `ForgesLayout.spec.tsx`, "the Stop dialog").
2. While a command to a forge is on its way, that row's controls are disabled and the others are not (`ForgesModel.spec.ts`,
   `CommandSender.spec.tsx`).
3. A refusal stays until dismissed or until the next command to that forge succeeds (`ForgesModel.spec.ts`, `ForgesLayout.spec.tsx`,
   `CommandSender.spec.tsx`).
4. Starting ends as the forge's reported condition, `live`, once the forge reports it, or as a refusal on the row
   (`ForgesModel.spec.ts`, "a start Gaia sent").
5. The machine at its limit names the forges whose ready tickets wait, by name, and leaves out a forge not read in full
   (`ForgesModel.spec.ts`, "this machine").

## B3. Forges Gaia cannot fully read

A1 while Gaia reads a forge in part or not at all: it shows what it knows, names what it cannot vouch for, and never guesses a count.

A forge at a version this Gaia cannot talk to (the verdicts `older` and `newer`) is the versions document's, U1, and where the two differ
for such a forge the versions document wins: its callouts, its line in the side panel and the note that links to its versions. B3 holds
for an unreachable forge, a forge read through its summary only (counts only), and a forge whose version Gaia talks to but whose monitor
document is of a newer contract.

Built in: `page/views/attention/` (`AttentionModel.ts`, `AttentionLayout.tsx`, `AttentionView.tsx`), with an unreachable forge's last
reading kept by `src/services/utils/WatchReadingUtil.ts`.
Held by: `page/views/attention/AttentionModel.spec.ts`, `page/views/attention/AttentionLayout.spec.tsx`,
`page/views/attention/AttentionView.spec.tsx`, `page/testing/fixtures/fleet-degraded.spec.ts`, `page/Screens.visual.spec.ts` (B3).
Example data: `page/testing/fixtures/fleet-degraded.ts`: Invoice Service stopped answering at 13:14, Research Wiki is read through its
summary, Analytics Sandbox publishes monitor contract 6 where this Gaia reads 5, and Example Mobile App is held as on A1.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Unreachable banner | One error banner per unreachable forge, atop the view: "**Hephaestus unreachable: Invoice Service.** Gaia shows what it last reported at `13:14` and tries again." (with no reading kept: "Gaia shows nothing of it and tries again.") | "Look again" sends `fleet-look-again`, disabled while it is on its way; its refusal shows under the banners |
| Page title | "Attention" and the lead, without figures | "Resume agents stopped by an outage", as on A1 |
| Figures | Folded into one inline line atop the main column, so the side panel and Running fit the window: "4+ waiting on you" first, then `10 / 12` agents, `8` tickets ready, `5` done today, `1.08M` tokens today, `0` open incidents, each the document's own sum over the forges that report it | none |
| Waiting on you | The pill reads "4 known, more possible". A stale row, of an unreachable forge: its dot, "Unreachable" under the name in the failure ink, its other cells at reduced contrast, its meta line "as last reported 13:14 · opened 12:58", its button disabled and going nowhere. The primary and the orange edge go to the first row that can act | A live row as on A1 |
| Forges that need a look | Callouts in the order unreachable, launches held, newer, counts only (A1's table). Unreachable: the address, process and last answer. Counts only, neutral and dashed: "This forge is older than the monitor contract. Gaia reads its summary: 1 entry waits on you, 1 agent runs. Open it to see what waits." and `summary 2 · no monitor contract`. Newer contract, neutral with its dashed unreadable dot: the contract sentence and numbers | As A1's table: "Look again"; "Update forge" and "Open"; none; "Update forge" (quiet) |
| What Gaia reads of each forge | A side panel, shown only while `figures.incompleteFor` names a forge: one line per forge, its dot and name, on the right its version (a forge read in full) or the contract it publishes (`monitor 5`, `summary 2`, `no contract`), and what Gaia reads of it: "Everything, live.", "Nothing since 13:14. Its rows show as last reported.", "Counts and jobs only. No questions or reviews by name.", "Nothing. Its contract is newer than this Gaia.", "Nothing while its Hephaestus is not running.", "Nothing. Its repository is gone." A forge the figures leave out carries, for a screen reader, "The totals cannot vouch for it." Under the lines: "Gaia never guesses a count. The totals leave out the three forges it cannot read in full." | none |
| Running | Compact cards beside the side panel, each card's waiting line in its head: an unreachable forge reads "as last reported 13:14" with its chips at reduced contrast; a counts-only forge reads "counts only" and its agents alone (`1 agent`); a held forge "launches held" | The card goes to `#forge/<trackerId>` |
| Just happened | As A1 | As A1 |

The rail's count of what waits reads `4+`, and an unreachable forge's own count `2?` (`page/shell/RailModel.ts`).

**States.**

- Unreachable: the banner, stale rows, the error callout; the forge's entries stay listed as last reported, and its running card keeps
  its jobs as last reported.
- Counts only: a forge that names no token file is read through its open summary; its entries are counted, never listed by name.
- Newer contract: Gaia reads nothing of the forge and sends it nothing.
- With nothing that Gaia can read waiting, the list's place reads "Nothing that Gaia can read waits on you."
- The forge answers again: its rows are read normally, its banner and callout leave, and the first row is primary again, with no reload.

**Acceptance.**

1. No figure includes a forge that did not report it; `figures.incompleteFor` names those forges in the side panel, and the waiting
   figure and head say more is possible. (`AttentionModel.spec.ts`, `AttentionLayout.spec.tsx`, `fleet-degraded.spec.ts`)
2. A row of an unreachable forge can be read but not acted on. (`AttentionModel.spec.ts`, `AttentionLayout.spec.tsx`)
3. When the forge answers again, its rows return to normal without a reload. (`AttentionView.spec.tsx`)
4. The callouts follow the order by kind, whatever order the document lists the forges in. (`AttentionModel.spec.ts`)
5. The figures stay on one line. (By eye, `Screens.visual.spec.ts`.)

## B4. No forge yet

Attention while no forge is registered: one column that heads itself, says why nothing waits, and adds a repository and starts its forge.

Built in: `page/views/attention/NoForgeYet.tsx`, `page/views/attention/AttentionModel.ts` (`NoForgeContent`), and the form shared with
A4's dialog, `page/shared/add-repository/` (`AddRepositoryFields.tsx`, `AddRepositoryForm.ts`).
Held by: `page/views/attention/NoForgeYet.spec.tsx`, `page/views/attention/AttentionModel.spec.ts`,
`page/views/attention/AttentionView.spec.tsx`, `page/shared/add-repository/AddRepositoryFields.spec.tsx`,
`page/shared/add-repository/AddRepositoryForm.spec.ts`, `page/views/forges/AddRepositoryDialog.spec.tsx`,
`page/testing/fixtures/fleet-empty.spec.ts`, `page/Screens.visual.spec.ts` (B4, and B4 with the forge program found). Example data:
`page/testing/fixtures/fleet-empty.ts`.

The screen shows when the registry holds no forge. A fleet whose every forge is hidden is still a fleet: A1 with nothing in it, its page
title kept.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Shell | No page title. The brand bar's neutral pill "No forge registered" and "nothing runs on this machine yet"; the rail's forges group says "No forge is registered" | as the shell |
| Head | Micro-caps "Welcome to Gaia"; the display title "Nothing waits on you, because no forge is registered."; the lead "Gaia runs no agents of its own. It shows the forges on this machine, and a forge appears here the first time it is set up in a repository." | "Look again" sends `fleet-look-again`, disabled while it is on its way; its refusal shows under it with "Try again" |
| Add a repository | A card titled "Add a repository": "Repository folder", a mono field (placeholder `~/development/example-storefront`) and "Choose a folder"; "Project name" (placeholder `Example Storefront`) and the hint "Starts as the folder's name."; under a hairline the sentence "Gaia sets up the board in that repository and starts its Hephaestus." and "Add and start", the one primary button | "Choose a folder" sends `path-choose` for a folder and fills the folder; disabled while a path is being chosen. The project name follows the folder's name until User types one, and again once cleared. "Add and start" sends `forge-add` with the trimmed folder and name; it can be sent only with both filled, a forge program known and no add on its way. A refused choice or add shows in the form, only beside the button whose send it was |
| Forge program missing | Only while the settings name no forge program and Gaia found none: "Add and start" is disabled and its sentence reads "Add and start waits for the forge program. Choose it below."; under the card a dashed status line with a dashed dot: "**The forge program was not found.** Gaia can show running forges without it, but cannot start one." | "Choose the forge program" sends `path-choose` for a file, then `settings-set` of `forgeProgramPath`; a cancelled choice sends nothing more. Disabled while either is on its way; a refusal of either shows under the line |
| Forge program found | Under the card: "Forge program" and its path from `~` (`~/.bun/bin/forge`: the program Gaia runs, else the one Gaia's settings name), and once "A forge set up elsewhere appears here by itself." | none |

**States.**

- Forge program missing (`fleet-empty`) and found (`FORGE_PROGRAM_FOUND_SCREENS` in `page/testing/ArtboardScreens.tsx`).
- A forge registers: the next fleet document replaces this screen with A1, with no reload.

**Acceptance.**

1. A forge that registers while this screen shows replaces it with A1 without a reload. (`AttentionView.spec.tsx`)
2. With no forge program, "Add and start" is disabled and the status line says why. (`NoForgeYet.spec.tsx`,
   `AddRepositoryForm.spec.ts`, `AddRepositoryDialog.spec.tsx`)

## C2. Notifications and the window title

What tells User that something waits while Gaia's window is not in front: the window's title, and, once built, a notification per new
item of the kinds User chose. Built today: the window title and the "What notifies" checklist. Not built: the notifications themselves
and their permission line.

Built in: `page/shell/WindowTitle.ts` (set by `page/shell/GaiaApp.tsx`), `page/views/forges/WhatNotifiesDialog.tsx`,
`page/views/forges/GaiaPanelModel.ts`, `src/shared/constants/GaiaSettingsDefaults.ts`, `page/notifications/NotificationBoundary.ts` (the
one reach into the Notification API).
Held by: `page/shell/WindowTitle.spec.ts`, `page/views/forges/GaiaPanelModel.spec.ts`, `GaiaPanel.spec.tsx`,
`WhatNotifiesDialog.spec.tsx`, `page/Screens.visual.spec.ts` (C2 painted over A4).

| Part | Shows | Controls and effect |
| --- | --- | --- |
| The window title | `(5) Gaia · Attention`: the rail's Attention count, `4+` included, then "Gaia" and the view's title ("Attention", "Agents", "Activity", "Forges", or a forge in place by its project, its tracker id while the document does not hold it). No count when nothing waits or before the first document. | none |
| "What notifies" | Opened by the Gaia panel's "What notifies" (A4) over the Forges view: the design-system library's wide `Dialog` titled "What notifies", "5 of 7 on" at the end of its title line, following the settings. One card of seven rows with a hairline between, each a `Checkbox` with the kind's name and its line (below). | A kind sends `settings-set` for `notifications` with only its own kind turned over. "Done" (primary) closes it, as do its close button ("Close What notifies") and Escape; a click beside it does not. A refused change shows under the card with "Try again" and its dismissal. |
| Notifications off | While "Notify me while Gaia is open" is off: "\"Notify me while Gaia is open\" is off, so no kind notifies until it is on again." over the card | none |

The seven kinds, in order, with their defaults from `GAIA_SETTINGS_DEFAULTS`:

| Kind | Name | Line | Default |
| --- | --- | --- | --- |
| `escalated-questions` | Escalated questions | An incident the Assistant could not settle. | on |
| `questions` | Questions | An agent or Hephaestus asks, and work waits on the answer. | on |
| `reviews-and-merge-accepts` | Reviews and merge accepts | A ticket is ready for review, or reviewed and waiting to be accepted. | on |
| `forges-held-or-unreachable` | A forge holds its launches or stops answering | Install version changed, a failed restart, or an unreachable Hephaestus. | on |
| `quiet-agents` | A quiet agent | An agent whose log stood still for the forge's own number of sweeps. | on |
| `machine-at-agent-limit` | The machine is at its agent limit | Ready tickets wait for a machine slot. | off |
| `draft-tickets` | Draft tickets | A draft was filed and waits to be readied. | off |

"Notify me while Gaia is open" is on by default. With a settings file newer than this Gaia, every checkbox is off, as in A4.

**Not built: the notifications.** Gaia raises no notification of these kinds yet. It waits for the second spike of `docs/spikes.md`
(the permission prompt answered and a notification clicked in the app window while another application is in front), which needs the
owner at the Mac; `docs/backlog.md` holds it. When built, through `page/notifications/`, it follows these rules:

- One notification per new key, never a repeat. The key is `<trackerId>/<attention key>` for an attention entry and
  `<trackerId>/<look kind>` for a forge-level condition. The title is the forge and the kind with its id; the body is the forge's
  subject. A click brings Gaia's window forward at that item.
- What is new is a set difference between this snapshot's keys and the keys already seen; the first snapshot after a load seeds the set
  and notifies nothing.
- Only while "Notify me while Gaia is open" is on, and only for a kind switched on.
- Permission: while the browser has not granted it, a neutral dashed line with "Allow notifications" as its primary, which asks the
  browser once, from User's click. Denied, the line stays and Gaia never asks again by itself.
- The notification is drawn as an operating-system card: Gaia's mark, the title with a mono time, the body and a small foot; the one
  resting shadow in Gaia's design.

**States.**

- Nothing waits: the title without a count. More may wait than is known: `(4+)`.
- Notifications off: the off line in "What notifies".
- Settings file newer than this Gaia: every kind off, as A4 says.

**Acceptance.**

1. (Not built.) The same entry in two snapshots notifies once.
2. A kind switched off notifies nothing (not built) and still counts in the title: the title counts the rail's Attention count whatever
   the kinds (`WindowTitle.spec.ts`).
3. (Not built.) With permission denied, Gaia shows the line and never asks again by itself.
4. "What notifies" lists the seven kinds in the order above, with their lines, ticked as the settings hold them, five of seven on by
   default, and each sends only its own kind turned over (`GaiaPanelModel.spec.ts`, `WhatNotifiesDialog.spec.tsx`).
5. The window reads `(N) Gaia · <view>`, with no count when nothing waits or no document has come (`WindowTitle.spec.ts`).

## C3. Launcher splash

The page the launcher opens at once, before Gaia's page can answer, so User sees Gaia start. It is a file page,
`resources/page/loading.html`, not part of Gaia's page.

Built in: `resources/page/loading.html`, `src/features/launcher/Launcher.ts` (moves it on), `src/features/launcher/utils/` (its
addresses).
Held by: `src/features/launcher/SplashPage.spec.ts`, `src/features/launcher/Launcher.spec.ts`, `page/Screens.visual.spec.ts` (C3, at both
steps, in both themes, at 900 by 560 pixels, `SPLASH_SIZE_PIXELS` in `page/testing/ArtboardScreens.tsx`).

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Brand | Centred: Gaia's mark at 88 pixels and the wordmark "gaia" | none |
| Step line | One line, the step that is now, with a condition dot. `starting`: an orange ring dot and "Starting Gaia…". `looking`: a ring dot, "Looking for forges" and mono "3 of 5 answered" when Gaia reported the counts. `opening`: a filled orange dot, "Opening the window…" and the mono address `127.0.0.1:4790`. A later step fades in; the first shows at once. | none |
| Closing line | At the bottom, small and muted: "Closing this window stops Gaia. The forges keep running." | Closing the window stops Gaia's server, quietly, with no dialog. |

How it moves: the launcher opens the splash with Gaia's address and the theme in the query, and moves it on by its fragment (`step`,
`answered`, `registered`) through the browser's debugging pipe, since a file page cannot read Gaia's health. It starts the server and
the splash together, asks the health route until Gaia answers, shows `looking` until every forge answered or the tries run out, then
`opening`, and navigates the window to Gaia's page with a session code. When Gaia already runs, the window opens on the splash at
`opening` and the launcher moves it to the page once the window is listed.

The splash links the design-system library's `tokens.css` and then Gaia's `page/styles/tokens.css` by their files, draws in the library's
Inter files, holds no colour value of its own and reads only tokens those files define, and carries the rules of Gaia's mark itself. It
paints dark for the dark choice and for auto on a dark system, light otherwise. It tells User to run nothing.

**States.** `starting`, `looking` (with or without counts), `opening`, each in light and dark.

**Acceptance.**

1. The splash shows from the launcher's first browser start when the launcher starts the server (`Launcher.spec.ts`).
2. When Gaia's server already runs, the window opens on the splash at its last step, "Opening the window…", and moves to the page; it
   never skips the splash (`Launcher.spec.ts`).
3. No request leaves the machine: tokens and fonts are files beside it, and it reads Gaia only through the launcher
   (`SplashPage.spec.ts`).
4. It says each step's words and the closing line, and tells User to run nothing (`SplashPage.spec.ts`).
