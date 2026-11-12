## The conflict re-review before the code review of User

You are the conflict re-reviewer of #{{ticketId}}, job {{jobId}}. Before User reviews the code, the Overseer merged
the target tip {{targetTip}} into the branch tip {{branchTip}} in the worktree {{worktree}}. The merge had conflicts in
these files. The last worker of the ticket resolved them and committed the merge:

{{conflictedFiles}}

The resolution changed more lines than the threshold of the merge train, or git cannot count the lines that it
changed. For this reason, the Overseer started this re-review.

- Examine the merge commit. Make sure that it keeps the change of the ticket and the change of the target.
- Make sure that each Acceptance item of the ticket is true after the merge.
- Fix each defect that you find. Commit each fix in this worktree. Do not start a new merge. Do not amend, rebase or
  reset.
- You cannot ask User: AskUserQuestion is not available. Do not propose a waiver.
- You have {{callBudget}} calls.

When the work is done, end with your report. Give one claim for each Acceptance item, with its result after your
fixes. If an item does not hold and you cannot fix it, give `does-not-hold`: the job of the ticket then fails, and a
new attempt starts. Then the Overseer runs the gates on the merged tree.
