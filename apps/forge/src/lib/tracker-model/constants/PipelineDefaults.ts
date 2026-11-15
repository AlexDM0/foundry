/** What a pipeline means where it says nothing: each role's instruction list, and the step of a re-review threshold in lines. */
import type { InstructionEntry, PipelineAgentRole } from '../@types/Pipeline.ts';

/** Also the lowest threshold a pipeline may store. */
export const RE_REVIEW_THRESHOLD_STEP_LINES = 50;

/** The list a role reads when its `instructions` are absent: an explicit list, even an empty one, replaces it. */
export const DEFAULT_INSTRUCTIONS_OF_ROLE: Readonly<Record<PipelineAgentRole, readonly InstructionEntry[]>> = Object.freeze({
  productOwner:       [{ kind: 'default-brief', role: 'productOwner' }],
  builder:            [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }],
  reviewer:           [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }],
  reReviewer:         [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'reReviewer' }],
  conflictReReviewer: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'conflictReReviewer' }],
  pipelineAgent:      [{ kind: 'default-brief', role: 'pipelineAgent' }],
  assistant:          [{ kind: 'default-brief', role: 'assistant' }],
});
