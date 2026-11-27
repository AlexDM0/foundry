import type { FrontmatterProblem }    from './FrontmatterProblem.ts';
import type { RecordFileReadProblem } from './RecordFileReadProblem.ts';
import type { StoredFileProblem }     from './StoredFileProblem.ts';

/** The vocabularies a ticket's frontmatter values come from. */
export type TicketFrontmatterVocabulary = 'ticket-type' | 'ticket-priority' | 'ticket-size' | 'agent-model' | 'agent-effort';

type TicketValueProblem<Code extends string> = StoredFileProblem<Code> & { readonly field: string; readonly storedValue: string };

/** Why a ticket file could not be read; `field` is the frontmatter key, `storedValue` its raw value, line numbers count from 1. */
export type TicketFileProblem =
  | RecordFileReadProblem
  | FrontmatterProblem
  | StoredFileProblem<'heading-in-frontmatter'> & { readonly lineNumber: number; readonly lineText: string }
  | StoredFileProblem<'one-hash-line-before-prose'> & { readonly lineNumber: number; readonly lineText: string; readonly proseLineNumber: number }
  | StoredFileProblem<'line-indented'> & { readonly lineText: string }
  | StoredFileProblem<'key-unusable'> & { readonly field: string }
  | TicketValueProblem<'task-not-a-safe-whole-number'>
  | TicketValueProblem<'task-quoted'>
  | TicketValueProblem<'not-a-whole-number'>
  | TicketValueProblem<'value-unknown'> & { readonly vocabulary: TicketFrontmatterVocabulary }
  | TicketValueProblem<'status-unknown'>
  | TicketValueProblem<'id-not-a-ticket-number'>
  | StoredFileProblem<'value-null'> & { readonly field: string }
  | TicketValueProblem<'releases-group-not-true-or-null'>
  | TicketValueProblem<'names-a-non-ticket-number'>
  | TicketValueProblem<'names-a-non-epic-key'>
  | TicketValueProblem<'names-a-non-public-domain'>
  | StoredFileProblem<'entity-blank'> & { readonly field: string }
  | TicketValueProblem<'content-hash-malformed'>;
