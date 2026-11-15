/** How a figure looks. What matters: only a value that waits on User or stands at a limit takes the accent tone, and words pass unchanged. */
import { describe, expect, test } from 'bun:test';

import { FigureLookUtil } from './FigureLookUtil.ts';

describe('a figure\'s look', () => {
  test('a value that calls for attention takes the accent tone, and any other value no tone at all', () => {
    expect([FigureLookUtil.toneOf(true), FigureLookUtil.toneOf(false), FigureLookUtil.toneOf(undefined)]).toEqual([{ tone: 'accent' }, {}, {}]);
  });

  test('the page head\'s figures keep their values and words, in order, the tone only where attention is set', () => {
    expect(FigureLookUtil.pageHeadFiguresOf([
      { value: '5', label: 'waiting on you', attention: true },
      { value: '10 / 12', label: 'agents' },
      { value: '3', label: 'starting', attention: false },
    ])).toEqual([
      { value: '5', label: 'waiting on you', tone: 'accent' },
      { value: '10 / 12', label: 'agents' },
      { value: '3', label: 'starting' },
    ]);
  });
});
