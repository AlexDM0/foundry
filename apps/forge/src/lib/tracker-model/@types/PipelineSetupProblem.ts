import type { PipelineProblem }     from './PipelineProblem.ts';
import type { StoredRecordProblem } from './StoredRecordProblem.ts';

/** Why a stored `pipeline-setup.json` cannot be read; its billing and agent are read as `pipeline.json` stores them, with their problems. */
export type PipelineSetupProblem =
  | StoredRecordProblem
  | PipelineProblem
  | { readonly code: 'neither-null-nor-a-text'; readonly field: string }
  | { readonly code: 'not-a-list-of-texts'; readonly field: string }
  | { readonly code: 'not-a-draft-field'; readonly field: string }
  | { readonly code: 'not-an-entity-key'; readonly field: 'openedAtEntity' }
  | { readonly code: 'has-an-empty-entity-key'; readonly field: 'entities' }
  | { readonly code: 'not-a-setup-id'; readonly field: 'setupId'; readonly storedValue: unknown }
  /** The draft's own problem, or null when the draft is of an older version. */
  | { readonly code: 'draft-not-a-pipeline'; readonly field: 'draft'; readonly draftProblem: PipelineProblem | null };

/** Why a stored `constitution-sources.json` cannot be read; its annotations are read as the setup record stores them. */
export type ConstitutionSourcesProblem =
  | PipelineSetupProblem
  | { readonly code: 'not-a-blob-id'; readonly field: 'blob' };
