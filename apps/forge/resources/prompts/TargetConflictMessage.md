Before the review of #{{ticketId}}, the Overseer merged the target's tip {{targetTip}} into your branch. The merge had
conflicts in these files, so the Overseer stopped the merge and put the worktree back at your branch tip:

{{conflictedFiles}}

Merge `{{targetTip}}` into your branch. Resolve each conflict yourself, commit the merge, and run every gate on the
merged tree. Then report again. This is resume {{resume}} of {{resumesAllowed}}. A return after the last resume parks
the ticket for User.
