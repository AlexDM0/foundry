/**
 * Every local store name is joined onto a directory the tool resolved itself, so a name carrying a separator or a parent segment would
 * reach outside the tracker.
 */
import { expect, test } from 'bun:test';

import { LOCAL_STORE_FILES } from './LocalStoreFiles.ts';

test('every name is a bare name, so joining one onto a directory cannot escape it', () => {
  const names = Object.values(LOCAL_STORE_FILES);
  expect(names.length, 'the scan found the local store names').toBeGreaterThan(5);
  for (const name of names) {
    expect(name.length, 'a name is never empty').toBeGreaterThan(0);
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
    expect(name.includes('..'), `"${name}" has no parent-directory segment`).toBe(false);
  }
});

test('every name is distinct, so no two records share a file', () => {
  const names = Object.values(LOCAL_STORE_FILES);
  expect(new Set(names).size).toBe(names.length);
});
