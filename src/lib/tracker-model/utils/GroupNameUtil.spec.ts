/**
 * The portable group-name rule. The name becomes the branch and folder `group-<name>`, so what matters is that the answer never depends on
 * the host: upper case, NTFS characters and a trailing dot fail everywhere, and only a stored group of another case is a twin, never itself.
 */
import { expect, test } from 'bun:test';

import { GroupNameUtil } from './GroupNameUtil.ts';

test('a group is lower-case words of letters and digits joined by single hyphens', () => {
  for (const name of ['code-lifecycle', 'post-refactor', 'spec-view', 'q4-2026']) expect(GroupNameUtil.groupNameIsWellFormed(name), name).toBe(true);
  for (const name of ['', 'Code-Lifecycle', 'code_lifecycle', 'code.', 'code ', '-code', 'code--lifecycle', 'a"b', 'a|b', 'a<b', 'a>b', 'a:b', 'a?b', 'a*b']) {
    expect(GroupNameUtil.groupNameIsWellFormed(name), name).toBe(false);
  }
});

test('a twin is an existing group equal under case folding but not the same text', () => {
  expect(GroupNameUtil.caseFoldedTwinOf('example-shop', ['code-lifecycle', 'Example-Shop'])).toBe('Example-Shop');
  expect(GroupNameUtil.caseFoldedTwinOf('example-shop', ['example-shop', 'code-lifecycle'])).toBeNull();
  expect(GroupNameUtil.caseFoldedTwinOf('example-shop', [])).toBeNull();
});
