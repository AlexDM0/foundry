### Advice on the stored pipeline

A pipeline is stored, and User asked you for advice about it. The draft starts as the stored pipeline. Read the gate
history below the setup record: the time, the outcome and the tree of each gate run.

- Find what makes the pipeline slow or not reliable. For example:
  - a slow gate;
  - a gate that is red and then green on the same tree;
  - a gate in a phase that does not need it;
  - a missing prepare step.
- Propose each improvement as edits of the draft with `{{program}} pipeline propose`. Obey the rules of the pipeline
  design step of the `{{pipelineSetupSkill}}` skill.
- Do not file a ticket. User applies the edits that User accepts.
