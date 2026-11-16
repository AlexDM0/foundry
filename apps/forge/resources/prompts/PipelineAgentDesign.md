### Pipeline design

Propose the whole pipeline of this board as edits of the draft with `{{program}} pipeline propose`. Use the findings
and the answers of User.

- Give each edit one field, the whole new value of the field and one summary sentence. User reads the sentence in the
  Bridge.
- The fields are `gate:<name>`, `phase-order:<phase>`, `prepare:<name>`, `prepare-order`, `role:<role>`, `review`,
  `airlock`, `approval:<approval>` and `constitution`. The value `null` removes a gate, a prepare step, the review or
  the merge train. On a role or an approval, `null` sets the default again.
- A gate is `{name, run, fix?, in?, definedBy?, network?, writes?}`. `in` is the folder the gate runs in, from the
  project's folder, or from the repository root when it starts with `/`; leave it out to run in the project's folder.
  Put the files that define the gate in `definedBy`, a file above the project's folder with a leading `/`. Put the
  domains that it reaches in `network`. Put the folders that it writes outside the worktree in `writes`.
- Put each gate in the phases where it must pass, with `phase-order:build`, `phase-order:review` and
  `phase-order:merge`. Build gates pass before the review. Review gates pass after the fixes of the reviewer. Merge
  gates pass on the merged tree before main moves. Put the fastest gate first in each phase.
- Send a new gate and the phase orders that name it in the same proposal.
- Do not make a gate from a script that starts a server or watches files.
- A prepare step is `{name, run, in?}`, its `in` written as a gate's. It installs what a new worktree needs. The
  prepare steps run in the order of `prepare-order`, before the build gates.
- A role is `{model?, effort?, instructions?}`. The roles are `productOwner`, `builder`, `reviewer`, `reReviewer`,
  `conflictReReviewer`, `pipelineAgent` and `assistant`. The models are `haiku`, `sonnet`, `opus` and `fable`. The
  efforts are `low`, `medium`, `high`, `xhigh` and `max`. Change a role only when the project needs it.
- The review is `{name, reReview?: {thresholdLines}}`. The merge train is `{reReview?: {thresholdLines}}`. A
  re-review runs when the fixes change more lines than `thresholdLines`.
- The approvals are `tickets` and `merge`. Each one is `true` or `false`.
- When User writes to you, change the draft with edits. Then tell User in one sentence what you changed.
- When only User can decide, ask with `{{program}} pipeline ask`. Give the question the subject `node` or `gate`.
- When the draft is complete, run `{{program}} pipeline ready design`.
