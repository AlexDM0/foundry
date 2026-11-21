/**
 * The entity grouping several views share. What matters: the groups come apps, packages, root, whatever the order of the items, and each
 * keeps the items' own order; an item of no kind and an empty group are left out; each kind has its words; the filter ignores case and
 * spaces around it, keeps everything while empty, and keeps an item when any of its texts holds it.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardEntityKind } from '../../@types/board/BoardVocabulary.ts';
import { EntityGroupUtil }      from './EntityGroupUtil.ts';

const KIND_BY_KEY: Readonly<Record<string, BoardEntityKind>> = {
  'root': 'root', 'example-ui': 'package', 'web': 'app', 'admin': 'app'
};

function kindOf(key: string): BoardEntityKind | null {
  return Object.hasOwn(KIND_BY_KEY, key) ? KIND_BY_KEY[key] ?? null : null;
}

describe('EntityGroupUtil.groupsOf', () => {
  test('groups apps, then packages, then the root, each keeping the order given', () => {
    expect(EntityGroupUtil.groupsOf(['root', 'example-ui', 'web', 'admin'], kindOf)).toEqual([
      { groupKind: 'app', label: 'Apps', items: ['web', 'admin'] },
      { groupKind: 'package', label: 'Packages', items: ['example-ui'] },
      { groupKind: 'root', label: 'Root', items: ['root'] },
    ]);
  });

  test('leaves out an item of no kind and every empty group', () => {
    expect(EntityGroupUtil.groupsOf(['example-unknown', 'web'], kindOf)).toEqual([{ groupKind: 'app', label: 'Apps', items: ['web'] }]);
    expect(EntityGroupUtil.groupsOf([], kindOf)).toEqual([]);
  });
});

describe('EntityGroupUtil.kindTextOf', () => {
  test('words each kind', () => {
    expect((['app', 'package', 'root'] as const).map(EntityGroupUtil.kindTextOf)).toEqual(['app', 'package', 'every other path']);
  });
});

describe('EntityGroupUtil.matchesFilter', () => {
  test('keeps everything while the filter is empty or only spaces', () => {
    expect(EntityGroupUtil.matchesFilter(['web'], '')).toBe(true);
    expect(EntityGroupUtil.matchesFilter(['web'], '   ')).toBe(true);
  });

  test('keeps an item when any of its texts holds the filter, whatever the case', () => {
    expect(EntityGroupUtil.matchesFilter(['example-ui', 'package'], ' PACK ')).toBe(true);
    expect(EntityGroupUtil.matchesFilter(['example-ui', 'package'], 'web')).toBe(false);
  });
});
