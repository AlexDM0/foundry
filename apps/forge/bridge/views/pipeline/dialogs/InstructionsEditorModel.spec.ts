/**
 * The instruction list's model. What matters: the constitution is `constitution.md` and "drafted" before Apply and the pipeline's path
 * after it, with an Edit link and no Open; a brief takes the file name and text the facts resolved, and a role's own brief in a re-review
 * list says whose it is; a removed constitution comes back at the top; an added path goes last, once; and only the roles that may read the
 * constitution are offered it.
 */
import { describe, expect, test } from 'bun:test';

import type { InstructionEntry, Pipeline } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { ResolvedInstructionEntry }   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { InstructionsEditorModel }         from './InstructionsEditorModel.ts';

const EDIT_HREF = '#pipeline/setup/constitution';

const MINIMAL_DRAFT: Pipeline = {
  version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] },
};

const REVIEWER_BRIEF: ResolvedInstructionEntry = {
  entry: { kind: 'default-brief', role: 'reviewer' }, fileName: 'reviewer.md', readByRoles: ['reviewer'], text: 'Example reviewer brief.', textIsCut: true,
};

const RE_REVIEW_ENTRIES: InstructionEntry[] = [
  { kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'reReviewer' },
];

describe('the rows', () => {
  test('before Apply the constitution is constitution.md, drafted, with an Edit link', () => {
    const constitution = InstructionsEditorModel.constitutionPlaceOf(MINIMAL_DRAFT, EDIT_HREF);
    const [row] = InstructionsEditorModel.rowsOf([{ kind: 'constitution' }], 'builder', constitution, []);
    expect(row).toMatchObject({
      fileName: 'constitution.md', roleText: 'constitution · drafted', editHref: EDIT_HREF, text: null
    });
  });

  test('after Apply it is the path the pipeline names', () => {
    const constitution = InstructionsEditorModel.constitutionPlaceOf({ ...MINIMAL_DRAFT, constitution: { path: 'CONSTITUTION.md' } }, EDIT_HREF);
    const [row] = InstructionsEditorModel.rowsOf([{ kind: 'constitution' }], 'builder', constitution, []);
    expect(row).toMatchObject({ fileName: 'CONSTITUTION.md', roleText: 'constitution' });
  });

  test('a brief takes the resolved file name and text, and a re-review list says whose its own brief is', () => {
    const constitution = InstructionsEditorModel.constitutionPlaceOf(MINIMAL_DRAFT, EDIT_HREF);
    const rows = InstructionsEditorModel.rowsOf(RE_REVIEW_ENTRIES, 'reReviewer', constitution, [REVIEWER_BRIEF]);
    expect(rows.map((row) => [row.fileName, row.roleText, row.text])).toEqual([
      ['constitution.md', 'constitution · drafted', null],
      ['reviewer.md', 'default', 'Example reviewer brief.'],
      ['reReviewer.md', 'only the re-reviewer', null],
    ]);
    expect(rows[1]?.textIsCut).toBe(true);
    expect(rows.map((row) => row.removeLabel)).toEqual(['Remove constitution.md', 'Remove reviewer.md', 'Remove reReviewer.md']);
  });

  test('the conflict re-reviewer\'s own brief is only this re-review\'s, and an added file says so', () => {
    const constitution = InstructionsEditorModel.constitutionPlaceOf(null, EDIT_HREF);
    const rows = InstructionsEditorModel.rowsOf(
      [{ kind: 'default-brief', role: 'conflictReReviewer' }, { kind: 'file', path: 'docs/example-brief.md' }],
      'conflictReReviewer',
      constitution,
      [],
    );
    expect(rows.map((row) => [row.fileName, row.roleText])).toEqual([['conflictReReviewer.md', 'only this re-review'], ['docs/example-brief.md', 'added']]);
  });
});

describe('changing the list', () => {
  test('a removed entry leaves the others in order', () => {
    expect(InstructionsEditorModel.withoutEntryAt(RE_REVIEW_ENTRIES, 0)).toEqual(RE_REVIEW_ENTRIES.slice(1));
  });

  test('the constitution comes back at the top, once', () => {
    const withoutConstitution = RE_REVIEW_ENTRIES.slice(1);
    expect(InstructionsEditorModel.withConstitution(withoutConstitution)).toEqual(RE_REVIEW_ENTRIES);
    expect(InstructionsEditorModel.withConstitution(RE_REVIEW_ENTRIES)).toEqual(RE_REVIEW_ENTRIES);
    expect(InstructionsEditorModel.includesConstitution(withoutConstitution)).toBe(false);
  });

  test('an added path goes last, trimmed; a blank or a repeated one changes nothing', () => {
    const added = InstructionsEditorModel.withFile([], '  docs/example-brief.md ');
    expect(added).toEqual([{ kind: 'file', path: 'docs/example-brief.md' }]);
    expect(InstructionsEditorModel.withFile(added, 'docs/example-brief.md')).toEqual(added);
    expect(InstructionsEditorModel.withFile(added, '   ')).toEqual(added);
  });

  test('the constitution is offered to the builder, the reviewer and the two re-reviewers only', () => {
    expect((['productOwner', 'builder', 'reviewer', 'reReviewer', 'conflictReReviewer'] as const).map(InstructionsEditorModel.offersConstitution))
      .toEqual([false, true, true, true, true]);
  });
});
