import type { StoredFileProblem } from './StoredFileProblem.ts';

/** What a ticket's and an epic's frontmatter share going wrong; `field` is the frontmatter key, `storedValue` its raw value. */
export type FrontmatterProblem =
  | StoredFileProblem<'first-line-not-a-fence'>
  | StoredFileProblem<'no-closing-fence'>
  | StoredFileProblem<'not-a-key-value-line'> & { readonly lineText: string }
  | StoredFileProblem<'quoted-value-unclosed'> & { readonly field: string; readonly storedValue: string }
  | StoredFileProblem<'quoted-value-not-text'> & { readonly field: string }
  | StoredFileProblem<'key-missing'> & { readonly field: string };
