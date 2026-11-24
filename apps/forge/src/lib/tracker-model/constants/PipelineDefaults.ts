/**
 * What a pipeline means where it says nothing: each role's instruction list, the ticket documents the builder and the reviewer read, and
 * the step of a re-review threshold in lines.
 */
import type { DocumentReadingRule, InstructionEntry, PipelineAgentRole } from '../@types/Pipeline.ts';
import type { TicketDocumentKind }                                       from '../@types/TicketDocument.ts';

/** Also the lowest threshold a pipeline may store. */
export const RE_REVIEW_THRESHOLD_STEP_LINES = 50;

/** The list a role reads when its `instructions` are absent: an explicit list, even an empty one, replaces it. */
export const DEFAULT_INSTRUCTIONS_OF_ROLE: Readonly<Record<PipelineAgentRole, readonly InstructionEntry[]>> = Object.freeze({
  productOwner:       [{ kind: 'default-brief', role: 'productOwner' }],
  specAgent:          [{ kind: 'constitution' }, { kind: 'default-brief', role: 'specAgent' }],
  planAgent:          [{ kind: 'constitution' }, { kind: 'default-brief', role: 'planAgent' }],
  builder:            [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }],
  reviewer:           [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }],
  reReviewer:         [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'reReviewer' }],
  conflictReReviewer: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'conflictReReviewer' }],
  pipelineAgent:      [{ kind: 'constitution' }, { kind: 'default-brief', role: 'pipelineAgent' }],
  assistant:          [{ kind: 'default-brief', role: 'assistant' }],
});

/** The roles that read a ticket's documents; a re-reviewer and a conflict re-reviewer read the reviewer's rule. */
export type DocumentReadingRole = 'builder' | 'reviewer';

/** What each reading role reads where its `documents` are absent; the reviewer always reads the spec. */
export const DEFAULT_DOCUMENTS_OF_ROLE: Readonly<Record<DocumentReadingRole, Readonly<Record<TicketDocumentKind, DocumentReadingRule>>>> = Object.freeze({
  builder:  Object.freeze({ spec: 'always', plan: 'always' }),
  reviewer: Object.freeze({ spec: 'always', plan: 'if-person-approved' }),
});
