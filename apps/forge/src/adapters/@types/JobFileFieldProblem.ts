import type { StoredFileProblem } from '../../shared/@types/StoredFileProblem.ts';

/** What a field of a file Hephaestus keeps in a job's folder must hold, as the check its ingestion makes; `JobFileShapeUtil` words it. */
export type JobFileFieldExpectation =
  | 'text'
  | 'text-or-null'
  | 'true'
  | 'an-object'
  | 'a-list'
  | 'a-list-of-text'
  | 'a-list-of-paths'
  | 'a-list-of-entity-keys'
  | 'an-entity-key'
  | 'a-commit'
  | 'a-round'
  | 'a-line-count-or-null'
  | 'a-record-of-commits'
  | 'a-record-of-phase-hashes'
  | 'true-or-false'
  | 'a-path'
  | 'a-path-or-null'
  | 'an-exit-code-or-null'
  | 'a-count'
  | 'a-child-instance'
  | 'a-red-handoff-kind'
  | 'a-gate-phase'
  | 'a-step-outcome'
  | 'a-cache-report'
  | 'a-step-kind'
  | 'a-step-ending'
  | 'a-run-time';

/** A field of a job file whose stored value is not what the field must hold, the field named from the document's root (`gates[0].run`). */
export type JobFileFieldProblem = StoredFileProblem<'field-is-not'> & { readonly field: string; readonly expected: JobFileFieldExpectation };
