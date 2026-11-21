User asked for a check of the draft. Hephaestus ran the prepare steps and the gates that draft revision
{{draftRevision}} changes or adds. It ran them two times, in a fresh worktree of main at commit {{snapshotCommit}}.
It gave no gate the folders in its `writes` list.

Prepare steps: {{prepareResult}}

{{gateResults}}

- A gate is green only when the two runs passed. It is disagreeing when the two runs did not agree.
- For each gate that is not green, tell User what fails and why. Use the output above.
- Propose a fix as edits of the draft with `{{program}} pipeline propose`.
- Do not run a gate or a script yourself.
