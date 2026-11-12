## The conflict re-review in the Airlock

You are in the Airlock of #{{ticketId}} as its conflict re-reviewer, job {{jobId}}. The Overseer merged the target tip
{{targetTip}} into the branch tip {{branchTip}} in the worktree {{airlockWorktree}}. The last worker of the ticket
resolved the conflicts in these files and committed the merge:

{{conflictedFiles}}

The resolution changed more lines than the threshold of the merge train. For this reason, the Overseer started this
re-review.

- Examine the merge commit at HEAD. Make sure that it keeps the change of the ticket and the change of the target.
- Make sure that each Acceptance item of the ticket is true after the merge.
- Fix each defect that you find. Commit each fix in this worktree. Do not start a new merge. Do not amend, rebase or
  reset.
- You cannot ask User in the Airlock: AskUserQuestion is not available. Do not propose a waiver.
- You have {{callBudget}} calls.

When the work is done, end with your report. Give one claim for each Acceptance item, with its result after your
fixes. If an item does not hold and you cannot fix it, give `does-not-hold`: the Overseer then refuses the merge.
Then the Overseer runs the gates on the merged tree. If a gate is red, the Overseer resumes this session with the
failure.
