import type { EntityRefusal }       from '../utils/EntityValidationUtil.ts';
import type { InstructionEntry }    from './Pipeline.ts';
import type { StoredRecordProblem } from './StoredRecordProblem.ts';

type FieldProblem<Code extends string> = { readonly code: Code; readonly field: string };

/** Why a stored `pipeline.json`, or a setup record's draft, is not a pipeline the board can run. */
export type PipelineProblem =
  | StoredRecordProblem
  /** `field` is the path of the record holding the key, absent at the top level. */
  | { readonly code: 'unknown-pipeline-key'; readonly field?: string; readonly key: string; readonly knownKeys: readonly string[] }
  | FieldProblem<'not-a-list-of-non-blank-texts'>
  | FieldProblem<'present-and-not-a-non-blank-text'>
  | FieldProblem<'has-no-name'>
  | FieldProblem<'not-a-non-blank-text'>
  | FieldProblem<'not-a-path-inside-the-repository'>
  | FieldProblem<'not-a-folder-inside-the-repository'>
  | FieldProblem<'has-no-run-line'>
  | FieldProblem<'present-and-not-true'>
  | FieldProblem<'holds-a-relative-folder'>
  | FieldProblem<'not-a-list-of-gate-names'>
  | FieldProblem<'not-a-known-model'>
  | FieldProblem<'not-a-known-effort'>
  | FieldProblem<'budget-with-subscription'>
  | FieldProblem<'not-a-billing-mode'>
  | FieldProblem<'not-a-positive-number'>
  | FieldProblem<'not-an-absolute-path'>
  | FieldProblem<'not-a-name'>
  | FieldProblem<'not-machine'>
  | FieldProblem<'neither-follows-nor-pinned'>
  | FieldProblem<'not-a-positive-whole-number'>
  | FieldProblem<'names-no-folder'>
  | FieldProblem<'holds-a-blank-key'>
  | FieldProblem<'not-empty-beside-entities'>
  | FieldProblem<'not-a-whole-number'>
  | { readonly code: 'not-a-repository-path'; readonly field: string; readonly path: string }
  | { readonly code: 'names-no-gate'; readonly field: string; readonly name: string }
  /** `field` is the gates the gate is one of, `gates` or `entities.<key>.gates`. */
  | { readonly code: 'gate-runs-in-no-phase'; readonly field: string; readonly gateName: string }
  | { readonly code: 'not-one-of'; readonly field: string; readonly choices: readonly string[] }
  | { readonly code: 'always-read-document'; readonly field: string; readonly rule: string; readonly role: string; readonly document: string }
  | { readonly code: 'lists-twice'; readonly field: string; readonly entry: InstructionEntry }
  | { readonly code: 'step-and-gate-share-a-name'; readonly name: string }
  | { readonly code: 'entities-refused'; readonly refusal: EntityRefusal }
  | { readonly code: 'newer-format'; readonly field: 'version'; readonly storedVersion: number; readonly readVersion: number }
  | { readonly code: 'entities-in-a-folder'; readonly projectPrefix: string };
