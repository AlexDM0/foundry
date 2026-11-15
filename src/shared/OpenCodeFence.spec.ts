/**
 * Which fence a line leaves open decides whether a heading in a ticket body is a section, so what matters is CommonMark's closing rule:
 * only the opening character, at least as long, with nothing after it, closes a fence; every other fence line inside one is text.
 */
import { describe, expect, test } from 'bun:test';

import { openCodeFenceAfter, type OpenCodeFence } from './OpenCodeFence.ts';

const BACKTICK_FENCE: OpenCodeFence = { character: '`', length: 3 };

describe('openCodeFenceAfter', () => {
  test('a fence of either character opens one of its length, and a line that is no fence changes nothing', () => {
    expect(openCodeFenceAfter('~~~~markdown', null)).toEqual({ character: '~', length: 4 });
    expect(openCodeFenceAfter('  ```ts', null)).toEqual(BACKTICK_FENCE);
    expect(openCodeFenceAfter('## Review', BACKTICK_FENCE)).toBe(BACKTICK_FENCE);
    expect(openCodeFenceAfter('``inline``', null)).toBeNull();
  });

  test('the same character, at least as long and with nothing after it but blanks, closes the fence', () => {
    expect(openCodeFenceAfter('````  \r', BACKTICK_FENCE)).toBeNull();
    expect(openCodeFenceAfter('~~~', BACKTICK_FENCE)).toBe(BACKTICK_FENCE);
    expect(openCodeFenceAfter('```ts', BACKTICK_FENCE)).toBe(BACKTICK_FENCE);
    expect(openCodeFenceAfter('```', { character: '`', length: 4 })).toEqual({ character: '`', length: 4 });
  });

  test('a backtick fence whose info string holds a backtick opens nothing', () => {
    expect(openCodeFenceAfter('``` a`b', null)).toBeNull();
  });
});
