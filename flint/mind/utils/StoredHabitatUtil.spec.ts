/**
 * The stored habitat's own contract. What matters: a kind and the home go round with the version in front; a value of another version,
 * or no value, reads as nothing stored.
 */
import { expect, test } from 'bun:test';

import { StoredHabitatUtil } from './StoredHabitatUtil.ts';

test('a kind and the home go round, with the version in front', () => {
  expect(StoredHabitatUtil.storedValueOf('chat')).toBe('1:chat');
  expect(StoredHabitatUtil.storedHabitatOf(StoredHabitatUtil.storedValueOf('chat'))).toEqual({ kind: 'chat' });
  expect(StoredHabitatUtil.storedHabitatOf(StoredHabitatUtil.storedValueOf(null))).toEqual({ kind: null });
});

test('a value of another version, or no value, reads as nothing stored', () => {
  expect(StoredHabitatUtil.storedHabitatOf('2:chat')).toBeNull();
  expect(StoredHabitatUtil.storedHabitatOf('chat')).toBeNull();
  expect(StoredHabitatUtil.storedHabitatOf(null)).toBeNull();
});
