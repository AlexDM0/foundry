/**
 * Reading a CSS time, against its own contract. What matters: seconds and milliseconds both come back in milliseconds, a list counts its
 * first entry as a computed style writes one time per animation, and anything that is no time is `null`, so each caller picks its fallback.
 */
import { describe, expect, test } from 'bun:test';

import { CssDurationUtil } from './CssDurationUtil.ts';

describe('a CSS time in milliseconds', () => {
  test('reads seconds and milliseconds', () => {
    expect(['220ms', '0.22s', '5s', '.5s', ' 0s ', '0ms'].map(CssDurationUtil.millisecondsOf)).toEqual([220, 220, 5000, 500, 0, 0]);
  });

  test('counts the first entry of a list', () => {
    expect(CssDurationUtil.millisecondsOf('0.3s, 1s')).toBe(300);
  });

  test('is null for anything that is no time', () => {
    expect(['', 'auto', '5', '-1s', 'var(--motion-leave)', '2min'].map(CssDurationUtil.millisecondsOf)).toEqual([null, null, null, null, null, null]);
  });
});
