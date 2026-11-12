/** The wall clock answers the stamp every injected `now` hands on: an ISO 8601 instant in UTC that parses back to a time. */
import { describe, expect, test } from 'bun:test';

import { stampOfNow } from './Clock.ts';

describe('the wall clock', () => {
  test('answers an ISO 8601 instant in UTC that parses back to a time', () => {
    const stamp = stampOfNow();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(stamp))).toBe(false);
  });
});
