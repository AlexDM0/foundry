/**
 * "What the plan names". What matters: each entry stands under its folder with its change mark and reference, each folder under the
 * folder that holds it in the plan's order, a top folder with no file of its own lending its name to each of its folders as roots, an
 * ambiguous one under each candidate's folder, a no-match one nowhere in the tree, and the files one reference changes alike in one
 * folder folded into one row; the legend counts each change; the unresolved places carry their reason and hint; the source line says
 * what was read and how long it took; and the reference marks know which places are unresolved and what words they quote.
 */
import { describe, expect, test } from 'bun:test';

import { PLAN_EFFECT_READING } from '../../testing/TicketDocumentsFixture.ts';
import { EffectTreeModel }     from './EffectTreeModel.ts';

describe('the effect pane', () => {
  const pane = EffectTreeModel.paneOf(PLAN_EFFECT_READING);

  test('lists each place under its folder in the plan\'s order, an ambiguous one under each candidate\'s folder and a no-match one nowhere', () => {
    expect(pane.rows.map((row) => (row.kind === 'folder' ? `${row.depth} ${row.name}` : `${row.depth} ${row.sigil} ${row.name} ${row.reference}`))).toEqual([
      '0 apps/storefront/src/',
      '1 theme/',
      '2 + ThemeResolver.ts 1',
      '1 utils/',
      '2 ? networkUtil.ts 2',
      '1 pages/account/',
      '2 ~ every page 4',
      '1 legacy/',
      '2 − light-only.css 5',
      '0 packages/contracts/',
      '1 ~ profile.ts 3',
      '0 packages/shared/utils/',
      '1 ? networkUtil.ts 2',
    ]);
  });

  test('folds the files one reference changes alike in one folder into one row that counts them', () => {
    const folded = pane.rows.find((row) => row.kind === 'entry' && row.reference === 4);
    expect(folded?.kind === 'entry' ? [folded.name, folded.fileCount] : null).toEqual(['every page', '7 files']);
    const single = pane.rows.find((row) => row.kind === 'entry' && row.reference === 1);
    expect(single?.kind === 'entry' ? single.fileCount : 'folded').toBeNull();
  });

  test('nests a folder under the folder that holds it, never under the folder drawn before it, and draws a lone chain of folders as one row', () => {
    const entryAt = (reference: number, path: string) => ({
      reference, path, change: 'adds' as const, detail: '', unresolvedReason: null, candidates: [],
    });
    const rows = EffectTreeModel.rowsOf([
      entryAt(1, 'web/src/theme/deep/resolver.ts'),
      entryAt(2, 'web/src/legacy/old.css'),
      entryAt(3, 'web/src/index.ts'),
      entryAt(4, 'README.md'),
      entryAt(5, 'docs/guide.md'),
      entryAt(6, 'docs/images/flow.png'),
    ]);
    expect(rows.map((row) => `${row.depth} ${row.name}`)).toEqual([
      '0 docs/',
      '1 images/',
      '2 flow.png',
      '1 guide.md',
      '0 web/src/',
      '1 theme/deep/',
      '2 resolver.ts',
      '1 legacy/',
      '2 old.css',
      '1 index.ts',
      '0 README.md',
    ]);
  });

  test('counts each change in the legend by the places the plan names, a folded row once', () => {
    expect(pane.legend.map((item) => `${item.sigil} ${item.word} ${item.count}`)).toEqual(['+ adds 1', '~ changes 2', '− removes 1', '? unresolved 2']);
    expect(pane.rows.filter((row) => row.kind === 'entry' && row.change === 'changes')).toHaveLength(2);
  });

  test('gives each unresolved place its reason and hint, words that are no path in quotes', () => {
    expect(pane.unresolved.map((item) => [item.reference, item.named, item.reason, item.hint])).toEqual([
      [2, 'utils/networkUtil.ts', 'Could be either of 2 files in the tree.', 'Name the full path in the plan.'],
      [6, '“the settings page”', 'No matching file or folder.', 'Say where it lives, or that it is new.'],
    ]);
  });

  test('says what the reading read and how long it took, and what a reading on its way or failed says', () => {
    expect(pane.sourceLine).toBe('From plan v2 and the file tree only. No code read. 1.4s');
    expect(EffectTreeModel.paneOf({ ...PLAN_EFFECT_READING, state: 'reading' }).sourceLine).toBe('Reading plan v2 against the file tree. No code read.');
    expect(EffectTreeModel.paneOf({ ...PLAN_EFFECT_READING, state: 'failed' }).rows).toEqual([]);
  });
});

describe('the reference marks', () => {
  test('stand on each reference\'s last line, know which places are unresolved and carry the words they quote', () => {
    expect(EffectTreeModel.referenceMarksOf(PLAN_EFFECT_READING).map((mark) => [mark.reference, mark.unresolved])).toEqual([
      [1, false], [2, true], [3, false], [4, false], [5, false], [6, true],
    ]);
    expect(EffectTreeModel.referenceMarksOf(PLAN_EFFECT_READING).filter((mark) => mark.unresolved).map((mark) => mark.quote)).toEqual([
      'utils/networkUtil.ts', 'the settings page',
    ]);
    expect(EffectTreeModel.referenceMarksOf(null)).toEqual([]);
  });
});
