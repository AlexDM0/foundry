You are in the Airlock of #{{ticketId}} as the {{role}} of the package that owns these files, job {{jobId}}. Hephaestus
merged the target tip {{targetTip}} into the branch tip {{branchTip}} in the worktree {{airlockWorktree}}. The merge has
conflicts in files of your package and in other files. Resolve the conflicts in these files only:

{{conflictedFiles}}

Keep the intent of the two sides. Use the constitution of your package. Stage each file that you resolve.
Do not commit the merge, because it stays open. Do not change the other conflicted files: a different worker resolves
them and then commits the merge. Do not start a new merge and do not reset the worktree.
