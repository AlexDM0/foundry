# Versions: forges at a version this Gaia cannot fully use

How the screens show a forge whose system version is not the one this Gaia is built for. The artboards U1 to U3 are pages of their
own over A1, A4 and B1; U4 is a sheet of the shared parts. The version model itself is in `docs/contracts.md`; this document holds
only what the screens draw of it. Where this document and B3 differ, this document holds for a forge at a version Gaia cannot talk
to; B3 still holds for an unreachable forge.

The example data is the fleet-versions fixture (`page/testing/fixtures/fleet-versions.ts`), painted as `VERSIONS_SCREENS` in
`page/testing/ArtboardScreens.tsx`: this Gaia is version `1.4`, built for forge `3.1`. Example Storefront is forge `3.4` and
serves clients built for forge `3.0` and later: `ahead`. Invoice Service and Research Wiki are `3.1`: `current`. Example Billing
is `1.8` (serves `1.0` and later): `older`. Analytics Sandbox is `4.1` and serves `4.0` and later: `newer`. Example Docs, in U4's
sheet and in `FLEET_VERSIONS_STATING_NO_VERSION` in Example Billing's place, states no version: `older`.

## The model

The model, the four verdicts and where each is decided are in `docs/contracts.md` ("The version model", "The verdict on a forge"):
one verdict per forge, from the forge's `GET /api/versions` and `SUPPORTED_FORGE_VERSION`, decided in
`src/shared/utils/ForgeVersionsUtil.ts` and compared by `src/shared/utils/SystemVersionUtil.ts`. What the screens need of it:

| Verdict | When (S: the forge version this Gaia is built for) | Gaia talks to it | What the screens show |
| --- | --- | --- | --- |
| `current` | The forge's `current` is S | yes | Everything. The version shows only as "forge 3.1" in the Forges row's subline and Attention's reading row. |
| `ahead` | The forge's `minimumSupported` is at or below S, its `current` above S | yes | Everything Gaia knows. Quiet: no callout, no orange, no action; a neutral line says what differs. |
| `newer` | S is below the forge's `minimumSupported` | no | That it runs, nothing of its work. Explains only: Gaia offers no update of itself and names no command. |
| `older` | The forge's `current` is below S, or the forge serves no `/api/versions` | no | That it runs, nothing of its work. Update forge, the primary action, with its steps. |

- A version compares as major, then minor: `3.10` is above `3.9`.
- A forge that serves no `/api/versions`, as every forge from before system versions, is `older`, and every screen says it "states
  no version".
- A forge Gaia cannot talk to is read from the registry alone: the server reads it at fidelity `older-contract` or
  `newer-contract`, condition `unreadable`, with no agents, attention or activity. The page shows an older forge as the condition
  `outdated`, word "Needs update", by a dashed orange dot; a newer one keeps `unreadable`, "Not readable", by a dashed faded dot.
- `ahead` never changes the condition dot or word: an ahead live forge stays "Live", and its counts stay in every total.
- A forge Gaia cannot talk to adds nothing to any total, and each total that leaves it out says so.
- The page words every version through `page/shared/utils/ForgeVersionsTextUtil.ts`; a version number is a part of its own, set in
  mono. Each verdict's mark is `VersionsVerdictMark` (`page/components/VersionsVerdictMark.tsx`): a check for `current`, a
  half-filled dot for `ahead`, a dashed faded dot for `newer`, a dashed orange dot for `older`; its word is orange only for
  `older`.

## U1. Attention

Attention (A1) over the five forges, two of them at a version this Gaia cannot talk to.
Built in: `page/views/attention/` (`AttentionModel.ts`, `AttentionLayout.tsx`), `page/shell/BrandStatusModel.ts`,
`page/shell/RailModel.ts`, `page/components/Callout.tsx`.
Held by: `page/views/attention/AttentionModel.spec.ts` and `AttentionLayout.spec.tsx` ("forges at a version this Gaia cannot talk
to (U1)"), `page/shell/BrandStatusModel.spec.ts`, `page/shell/RailModel.spec.ts`, `page/shell/Rail.spec.tsx`, the `U1-attention`
screen of `page/Screens.visual.spec.ts`.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Brand bar sentence | "1 needs a forge update · 1 not readable by this Gaia"; `ahead` and `current` add nothing. The pill "5 forges running". | None. |
| "Forges that need a look · 2" | Two callouts, older first, then newer (below). | Older: "Update forge" (primary), sending `forge-update`. Newer: none. |
| Older callout | Warn tone, `outdated` dot, the forge's name and "Older than this Gaia.", the sentence and the versions line, numbers in mono. | "Update forge" and its steps (see Update forge steps). |
| Newer callout | Neutral dashed tone, `unreadable` dot, the forge's name and "Newer than this Gaia.", the sentence and the versions line. | None: no update of Gaia, no command. |
| Figures | "5+" waiting on you, "8+ / 12" agents, then 9, 5, 1.02M, 0; the Waiting-on-you pill "5 known, more possible". | None. |
| "What Gaia reads of each forge" | One row per forge: its name, the version on the right (orange only for `older`), and what Gaia reads (below). | None. |
| Readings note | "Gaia never guesses a count. The totals leave out Example Billing and Analytics Sandbox." | "Versions" goes to `#forges`. |
| Running | Cards only for the forges whose agents Gaia reads, then "Example Billing and Analytics Sandbox run too. This Gaia cannot read their agents." | As A1. |
| Rail | Attention "5+", Agents "8+"; the older forge's row by its dashed orange dot, the newer one's by its dashed faded dot, neither with a count. Each row's title: "Live · forge 3.4, ahead of this Gaia", "Live", "Live", "Older than this Gaia · update the forge", "Newer than this Gaia". | A row of a forge Gaia cannot talk to goes to its Forges row (`#forges?forge=<trackerId>`), not in place. |

**States.** The older callout follows Update forge (see Update forge steps). A forge that states no version gets the older callout
with its own sentence and versions line. An `ahead` or `current` forge has no callout.

## U2. Forges

Forges (A4) with each forge's version under its condition, and the versions pair of one forge open under its row.
Built in: `page/views/forges/` (`ForgesModel.ts`, `ForgesLayout.tsx`, `ForgesView.tsx`, `GaiaPanelModel.ts`, `GaiaPanel.tsx`),
`page/shared/VersionsPair.tsx`, `page/shared/VersionsText.tsx`.
Held by: `page/views/forges/ForgesModel.spec.ts` and `ForgesLayout.spec.tsx` ("a forge at another version than this Gaia is built
for (U2)"), `GaiaPanelModel.spec.ts`, `GaiaPanel.spec.tsx`, the four `U2-forges-*` screens of `page/Screens.visual.spec.ts` (each
pair open, and none).

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Title figures | "5 registered", "5 running", "2 not read"; "not read" counts the forges at a version this Gaia cannot talk to, and is absent without one. | None. |
| Condition cell | Older: "Needs update" in orange by the `outdated` dot. Newer: "Not readable" in the secondary ink by the `unreadable` dot. Ahead and current: their own condition ("Live"). | None. |
| Version subline | Under the condition: `current` a plain "forge 3.1"; any other a disclosure "1.8 · older", "4.1 · newer", "3.4 · ahead", and "older" alone for a forge that states no version. | The disclosure, named "1.8 · older, Example Billing, its version beside this Gaia’s", with `aria-expanded`, shows that row's versions pair, or hides it; one row's pair shows at a time. |
| Versions pair | Under its row, expanded and not selected, a region named "Example Billing, its version beside this Gaia’s": the versions pair (see States and exact copy) and one sentence. | None. |
| Agents and Waiting cells | "not read" for a forge Gaia cannot talk to. | None. |
| Row controls | Older: "Update forge" (primary), "Stop" disabled. Newer: "Pause" and "Stop" disabled. Each disabled control is titled with both versions. Neither has "Open". Ahead: every control of its condition, "Open" among them. | Update forge sends `forge-update`, with its steps under the row. |
| Ahead quiet line | Under the ahead row, no edge: "Forge 3.4 is ahead of this Gaia, built for 3.1. All Gaia shows works; what 3.4 added shows in its Bridge." It hides while that row's pair shows. | None. |
| Versions note | Under the table, while any row can open its versions: the explanation (see States and exact copy). | None. |
| This machine | Its figure as a floor while a forge is not counted, and "Example Billing and Analytics Sandbox are not counted: this Gaia cannot read their agents." | As A4. |
| Gaia panel | Under the label "This Gaia": "version" `1.4`, "built for forge" `3.1`, "address" `127.0.0.1:4790`. No package version and no contract Gaia reads. | As A4. |

**States.** Every pair closed (`U2-forges-none`), or one pair open: Example Billing, Analytics Sandbox or Example Storefront. A
current forge opens no pair. The Update forge steps under the older row (see Update forge steps).

## U3. A forge in place

B1 for a forge at another version: its bar names the version, and for a forge Gaia cannot talk to the area holds a notice in place
of the board. Rows link a forge Gaia cannot talk to to Forges, not here; the address still opens it here.
Built in: `page/views/forge/` (`ForgeModel.ts`, `ForgeLayout.tsx`, `ForgeView.tsx`), `page/shared/VersionsPair.tsx`.
Held by: `page/views/forge/ForgeModel.versions.spec.ts`, `ForgeLayout.versions.spec.tsx`, `ForgeModel.runningVersions.spec.tsx`
(no such line for a forge Gaia cannot talk to), `ForgeView.spec.tsx` (Open in new tab), the six `U3-forge-*` screens of
`page/Screens.visual.spec.ts`.

| Part | Shows | Controls and effect |
| --- | --- | --- |
| Bar status | Newer: "Not readable" by the `unreadable` dot. Older: "Needs update" in orange by the `outdated` dot. Ahead: its own condition. The line names the version (see States and exact copy); for a forge Gaia cannot talk to it is the version clause alone, for an ahead forge the agents and what waits, then the clause. The line's title is the clause's whole sentence. | None. |
| Bar controls, newer | "Pause" and "Stop" disabled, each titled with both versions, then "Open in new tab". | Open in new tab opens Gaia's own route in a new tab, as for any forge; it never opens the forge's own page and sends no command. |
| Bar controls, older | Update forge at its step (see Update forge steps), "Stop" disabled and titled with both versions, then "Open in new tab". | Update forge sends `forge-update`; Open in new tab as above. |
| Bar controls, ahead | Every control of its condition, as in B1, and the running versions line. | As B1. |
| Running versions line | Absent for a forge Gaia cannot talk to, which it can restart neither way. | None. |
| Area, newer or older | A dashed area holding the notice: the verdict's mark and word, a heading, a sentence and the versions pair. The older word is orange. No board is mounted and the notice has no button. | None. |
| Area, ahead | The board, read in full. | As B1. |

**States.** Newer (`U3-forge-newer`), older at each Update forge step (`U3-forge-older`, `-pending`, `-done`, `-refused`), ahead
(`U3-forge-ahead`). A refused Update forge shows in the bar, beside where Update forge was, and not under it as well; any other
refusal still shows under the bar.

## States and exact copy

The copy below is the code's, in `page/shared/utils/ForgeVersionsTextUtil.ts` unless named, with the fixture's numbers. U4's parts
sheet is `page/testing/VersionsPartsSheet.tsx`: the versions pair at each verdict, the verdicts' marks and words, the condition
words with their dots, and a callout's versions line.

Verdict words: "Current", "Ahead of this Gaia", "Newer than this Gaia", "Older than this Gaia". Condition words (`ForgeTextUtil`):
"Needs update" for `outdated`, "Not readable" for `unreadable`.

Callouts (U1):

| Callout | Word | Sentence | Versions line |
| --- | --- | --- | --- |
| older | "Older than this Gaia." | "This forge is older than the forge this Gaia is built for. Gaia shows nothing of its work and sends it no command until the forge is updated. Its agents keep running." | "forge `1.8` · this Gaia is built for forge `3.1`" |
| older, no version | "Older than this Gaia." | "This forge states no version, so it is older than the forge this Gaia is built for. Gaia shows nothing of its work and sends it no command until the forge is updated. Its agents keep running." | "forge states no version · this Gaia is built for forge `3.1`" |
| newer | "Newer than this Gaia." | "This forge no longer serves clients built for forge 3.1, as this Gaia is. Gaia sees that it runs, shows nothing of its work and sends it no command. A newer Gaia shows it." | "forge `4.1` · serves clients built for forge `4.0` and later · this Gaia is built for forge `3.1`" |

"What Gaia reads of each forge" (U1):

| Forge | Right | Reading |
| --- | --- | --- |
| Example Storefront (`ahead`) | "forge `3.4` · ahead" | "All this Gaia knows. What 3.4 added shows in its Bridge." |
| Invoice Service, Research Wiki (`current`) | "forge `3.1`" | "Everything, live." |
| Example Billing (`older`), in orange | "forge `1.8` · older" | "That it runs. Nothing of its work until the forge is updated." |
| Analytics Sandbox (`newer`) | "forge `4.1` · newer" | "That it runs. Nothing of its work." |

A forge that states no version reads "states no version · older" on the right.

Versions pair (U2 under a row, U3 in the notice, U4): a list of three rows.

| Row | Copy |
| --- | --- |
| The forge's name | "forge `1.8` · serves clients built for forge `1.0` and later"; a forge that states no version: "states no version" |
| "This Gaia" | "version `1.4` · built for forge `3.1`" |
| "Verdict" | The mark and word, then the reason: older "`1.8` is below `3.1`, the forge this Gaia is built for"; older, no version, "a forge that states no version is older than `3.1`"; newer "it no longer serves clients built for `3.1`"; ahead "it is above `3.1` and still serves clients built for `3.1`"; current "the forge this Gaia is built for" (U4 only: Forges opens no pair for it). |

Sentence under the open pair (U2): older "Gaia shows that Example Billing runs. It shows nothing of its work and sends it no
command until the forge is updated; its agents keep running." Newer "Gaia shows that Analytics Sandbox runs. It shows nothing of
its work and sends it no command. A newer Gaia shows it here." Ahead "Gaia reads all it knows of Example Storefront and shows its
board. What forge 3.4 added since 3.1 shows only in its Bridge; a newer Gaia shows it here too. Nothing waits on you."

Versions note under the Forges table: "Each forge states its version and the oldest forge version a client may be built for and
still be served. This Gaia is built for exactly one forge version. A forge older than that, or one that states no version, needs a
forge update; a forge that no longer serves clients built for it needs a newer Gaia. In between, Gaia reads the forge in full and
says quietly what is newer."

Bar line and its title (U3):

| Forge | Line | Title |
| --- | --- | --- |
| ahead | "`4 / 5` agents · `2` wait on you · forge `3.4`, its newest parts only in its Bridge" | "Example Storefront is forge 3.4; this Gaia is built for 3.1. Everything Gaia shows works; what 3.4 added shows in its Bridge. A newer Gaia shows it here too." |
| newer | "forge `4.1` · newer than this Gaia, built for `3.1`" | "Analytics Sandbox is forge 4.1 and serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1, so they cannot talk." |
| older | "forge `1.8` · older than this Gaia, built for `3.1`" | "Example Billing is forge 1.8; this Gaia is built for forge 3.1, so they cannot talk until the forge is updated." |
| older, no version | "states no version · older than this Gaia" | "Example Docs states no version; this Gaia is built for forge 3.1, so they cannot talk until the forge is updated." |
| current | no version clause | the whole reading, as B1 |

Notice in place of the board (U3), each followed by the versions pair:

| Forge | Word | Heading | Sentence |
| --- | --- | --- | --- |
| newer | "Newer than this Gaia." | "This Gaia cannot show Analytics Sandbox in place" | "Analytics Sandbox no longer serves clients built for forge 3.1, as this Gaia is, so this Gaia cannot talk to it: it shows nothing of its work and sends it no command. The forge runs on its own. A newer Gaia shows it here." |
| older | "Older than this Gaia." (orange) | "Example Billing is older than this Gaia" | "This Gaia is built for forge 3.1, and Example Billing is 1.8. Update the forge to show it here; its agents keep running." A forge that states no version: "..., and Example Docs states no version. ..." |

The area's name is "Analytics Sandbox: Gaia cannot talk to this forge".

Titles of a control Gaia cannot send (U2 rows, U3 bar): older "Example Billing is forge 1.8; this Gaia is built for forge 3.1.";
older, no version, "Example Docs states no version; this Gaia is built for forge 3.1."; newer "Analytics Sandbox serves clients
built for forge 4.0 and later; this Gaia is built for forge 3.1."

Forges subline and quiet line (U2): "forge 3.1" (current), "3.4 · ahead", "1.8 · older", "4.1 · newer", "older" (no version); the
ahead quiet line "Forge 3.4 is ahead of this Gaia, built for 3.1. All Gaia shows works; what 3.4 added shows in its Bridge."

Brand bar sentence (`BrandStatusModel.ts`): "1 needs a forge update · 1 not readable by this Gaia". Rail titles (`RailModel.ts`):
"Older than this Gaia · update the forge", "Newer than this Gaia", and for an ahead forge its condition word, then "· forge 3.4,
ahead of this Gaia".

## Update forge steps

Update forge is offered for an `older` forge, as the primary action, and on the Forges row of a forge Gaia talks to whose installed
code is newer than its Hephaestus runs (`docs/design/screens.md`, "Which buttons a row shows"); Gaia runs it through the forge
program. Its step follows the forge's command state, alike in the U1 callout, the U2 row and the U3 bar. The words are `UPDATE_FORGE_TEXT` in
`ForgeVersionsTextUtil.ts` and `RESTART_PENDING` in `page/shared/utils/ForgeCommandTextUtil.ts`.

| Step | U1 callout | U2 row | U3 bar |
| --- | --- | --- | --- |
| idle | "Update forge", primary. | "Update forge", primary. | "Update forge", primary, before Stop (disabled). |
| pending | The callout's status by a `starting` ring: "Updating the forge… its agents keep running"; its one button disabled as "Updating". | Under the row by a `starting` ring: "Updating the forge…"; the button disabled as "Updating". | In Update forge's place, by a `starting` ring: "Updating the forge…". Every control waits. |
| done | The callout's sentence becomes "This forge stays older than the forge this Gaia is built for until its Hephaestus restarts."; under it the pending step: "**Updated; restart pending.** Its Hephaestus runs the old code, and this Gaia reads none of it, until it restarts.", "Restart" secondary, and a dismiss. | Under the row, without an edge: "**Updated; restart pending.** Gaia reads it after the restart.", "Restart" the row's one primary, Update forge stepping back to quiet. | In Update forge's place: "**Updated; restart pending.** Gaia reads it after the restart.", "Restart" primary, and an icon button "Dismiss the pending restart". |
| refused | Under the callout, the forge's code and sentence as `Refusal` draws them, with "Try again" and a dismiss. | Under the row, likewise; Try again sends the same update. | In one line in Update forge's place, its whole sentence in its title: "The forge refused Update: `repository-busy`. Another forge command holds the repository."; "Try again" and an icon button "Dismiss this refusal". A refusal Gaia gave leads "Gaia could not update the forge: ". |

Restart sends `forge-restart`. The refusal is the forge's own sentence, shown verbatim (`VERSIONS_UPDATE_REFUSAL` in
`ArtboardScreens.tsx`). Once the forge restarts, its watch follows it afresh and asks its `/api/versions` again, and the callout,
row and bar take the new verdict's form without a reload.

## Rules

- The verdict is per forge, never per endpoint, from the forge's `current` and `minimumSupported` and the one forge version this
  Gaia is built for. There is no Gaia minimum forge version and no `behind` verdict.
- A forge is spoken of in forge's own terms ("serves clients built for forge 4.0 and later"); Gaia's facts are its own version and
  the forge version it is built for.
- A forge that serves no `/api/versions` is `older` and says "states no version".
- Gaia never offers to update itself and no screen names a command; a newer forge gets an explanation only.
- Update forge appears only for `older`, as the primary action.
- Neutral dashed means Gaia cannot talk and Gaia is the one behind; orange means an Update forge waits on User; crimson only for a
  refusal.
- `ahead` is quiet: no callout, no orange, no action, no change to the condition dot or word, the brand bar sentence or the
  totals; a neutral line says what differs.
- `current` names its version only in the Forges subline and Attention's reading row.
- A forge Gaia cannot talk to adds nothing to any total, and the totals that leave it out say so; a count is never guessed.
- A control Gaia cannot send (`newer`, `older`) is disabled, with a title naming both versions.
- "Open" (in place) only for a forge Gaia talks to. Attention's callouts and the Forges rows offer no Open in new tab; the bar's
  Open in new tab opens Gaia's own route, never a page of the forge's.
- One primary per area: Update forge, or the pending step's Restart, never both live at once.
- The bar's version clause comes after the agents and what waits, and carries its whole sentence in its title.
- Every screen is drawn in both themes.

## Acceptance

1. With the fleet-versions fixture, Attention shows "Forges that need a look · 2" with two callouts in the order older, newer,
   with the copy above, and the brand bar sentence "1 needs a forge update · 1 not readable by this Gaia"
   (`AttentionModel.spec.ts`, `BrandStatusModel.spec.ts`).
2. No versions sentence offers to update Gaia (Gaia's own update is the brand bar's button, `docs/design/screens.md`), names a command, speaks of an oldest Gaia or a Gaia minimum, or says "talks to forge"
   (`ForgeVersionsTextUtil.spec.ts`); a newer forge's dot, word, callout, disclosure and verdict carry no orange
   (`AttentionModel.spec.ts`, `ForgesModel.spec.ts`, `VersionsVerdictMark.spec.tsx`).
3. Given a Gaia built for forge `2.3`: a forge whose minimum is `2.4` or `3.0` is `newer`, even by a minor; a forge at `2.2`, `1.9`
   or `0.9` is `older`; a forge with no `/api/versions` is `older`; `2.3` is `current`; `2.4` serving `2.3` and later and `3.1`
   serving `1.0` and later are `ahead` (`src/shared/utils/ForgeVersionsUtil.spec.ts`). A version compares as major, then minor
   (`src/shared/utils/SystemVersionUtil.spec.ts`).
4. A forge that serves no `/api/versions` shows the older callout, row and bar with "states no version", Update forge primary
   (`AttentionModel.spec.ts`, `ForgesModel.spec.ts`, `ForgeModel.versions.spec.ts`).
5. Opening a row's disclosure in Forges shows the versions pair and its sentence and sets `aria-expanded` to true; a current row
   has no disclosure (`ForgesLayout.spec.tsx`).
6. Update forge goes idle, pending (its control disabled while on its way), then done (the pending step with Restart) or refused
   (the forge's code and sentence until dismissed), in the callout, the row and the bar alike (`AttentionLayout.spec.tsx`,
   `ForgesModel.spec.ts`, `ForgesLayout.spec.tsx`, `ForgeModel.versions.spec.ts`, `ForgeLayout.versions.spec.tsx`). After the
   restart Gaia asks the forge's `/api/versions` again (`src/services/ForgeWatch.spec.ts`), and the screens follow the new verdict
   without a reload.
7. In place, a newer or older forge mounts no board: the area holds the notice and the versions pair, with no button
   (`ForgeModel.versions.spec.ts`, `ForgeLayout.versions.spec.tsx`).
8. Every text pair holds 4.5:1 in both themes, among them the orange text on its tint, the secondary ink on the wash beside the
   pair and the mono numbers in ink on the orange tint (`architecture/StyleContract.spec.ts`).
9. An ahead forge shows no callout in Attention, keeps its condition word ("Live") and its counts in every total, offers no action
   for its version anywhere, and its reading row says "forge 3.4 · ahead" in the secondary ink (`AttentionModel.spec.ts`,
   `AttentionLayout.spec.tsx`, `ForgesModel.spec.ts`).
10. The bar of an ahead forge keeps its agents and what waits, ends its line with the quiet version clause, and carries the whole
    sentence in its title (`ForgeModel.versions.spec.ts`, `ForgeVersionsTextUtil.spec.ts`).
11. The Gaia panel shows this Gaia's version and the one forge version it is built for, and no package version and no oldest forge
    (`GaiaPanelModel.spec.ts`).
