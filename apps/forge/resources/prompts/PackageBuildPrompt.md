This job is stage 2 of ticket #{{ticketId}}: the package build of `{{packageEntity}}`. The ticket belongs to the entity
`{{homeEntity}}`. In stage 1, the builder of `{{homeEntity}}` wrote a proposal in the files of `{{packageEntity}}`. The
proposal is in the commits of the branch `{{ticketBranch}}`. To see it, run `git diff {{target}}...HEAD`.

## The rules of this stage

- You build for the package `{{packageEntity}}`. Its constitution and its gates apply. Make sure that the proposal
  agrees with them.
- Do not change the files of `{{homeEntity}}`. In a later stage, the builder of `{{homeEntity}}` makes them agree with
  your result.
- If the proposal is correct, do not commit. Write in your `handoff` that you accept the proposal as it is.
- You can change the proposal. You can also change what the package exposes, if the package needs this change.
- After your report, the Overseer runs the gates of `{{packageEntity}}`. Then it runs the gates of each entity that
  depends on `{{packageEntity}}`, other than `{{homeEntity}}`. A change in the package must not break these entities.
- If the constitution of `{{packageEntity}}` does not permit the change, do not make it. End with the outcome
  `refused`, and write the reason in `refusedReason`.

## What the package exposes

{{exposedSurfaceDefinition}} In your report, set `exposedSurfaceChanged`:

- Set it to `false` when what the package exposes is the same as in the proposal. This is also the value when you
  commit nothing.
- Set it to `true` when you changed what the package exposes. Then write in your `handoff` what changed, so that the
  builder of `{{homeEntity}}` can make its files agree.

The reviewer of `{{packageEntity}}` examines this value. When the value is `false` and the reviewer agrees, the stage
that adapts `{{homeEntity}}` does not run.

The build prompt of `{{packageEntity}}` follows.
