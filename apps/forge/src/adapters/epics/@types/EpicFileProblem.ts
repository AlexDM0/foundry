import type { FrontmatterProblem }    from '../../../shared/@types/FrontmatterProblem.ts';
import type { RecordFileReadProblem } from '../../../shared/@types/RecordFileReadProblem.ts';
import type { StoredFileProblem }     from '../../../shared/@types/StoredFileProblem.ts';

/** Why an epic file could not be read; `field` is the frontmatter key, `storedValue` its raw value. */
export type EpicFileProblem =
  | RecordFileReadProblem
  | FrontmatterProblem
  | StoredFileProblem<'not-an-epic-key'> & { readonly field: 'key'; readonly storedValue: string }
  | StoredFileProblem<'not-a-colour-slot'> & { readonly field: 'slot'; readonly storedValue: string; readonly firstSlot: number; readonly lastSlot: number };
