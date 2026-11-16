/**
 * The brain's sentences in the monitor snapshot. What matters: the usage limit's refusal names its reset; an end names how long the brain
 * ran; and no sentence names a command or a flag, since nobody runs one.
 */
import { describe, expect, test } from 'bun:test';

import type { FlintBrainRefusal } from '../@types/FlintBrainRun.ts';
import { FlintBrainWordingUtil }  from './FlintBrainWordingUtil.ts';

const STARTED_AT = '2026-11-16T10:00:00.000Z';
const ENDED_AT = '2026-11-16T10:01:00.000Z';

const REFUSALS: readonly FlintBrainRefusal[] = [
  { code: 'no-flint' },
  { code: 'brain-already-running' },
  { code: 'brain-not-running' },
  { code: 'overseer-paused' },
  { code: 'usage-limit-holds', resetsAt: '2026-11-16T14:05:00.000Z' },
  { code: 'brain-failed-to-start' },
];

describe('the brain\'s sentences', () => {
  test('the usage limit\'s refusal names its reset time', () => {
    expect(FlintBrainWordingUtil.refusalSentenceOf({ code: 'usage-limit-holds', resetsAt: '2026-11-16T14:05:00.000Z' })).toContain('2026-11-16T14:05:00.000Z');
  });

  test('an end names how long the brain ran, in minutes and seconds', () => {
    expect(FlintBrainWordingUtil.endedSentenceOf('time', '2026-11-16T10:00:00.000Z', '2026-11-16T10:02:00.000Z')).toContain('2:00');
    expect(FlintBrainWordingUtil.endedSentenceOf('stopped', '2026-11-16T10:00:00.000Z', '2026-11-16T10:00:42.400Z')).toContain('0:42');
  });

  test('no sentence names a command or a flag', () => {
    const sentences = [
      ...REFUSALS.map((refusal) => FlintBrainWordingUtil.refusalSentenceOf(refusal)),
      ...(['time', 'stopped', 'usage-limit', 'failed'] as const).map((reason) => FlintBrainWordingUtil.endedSentenceOf(reason, STARTED_AT, ENDED_AT)),
      FlintBrainWordingUtil.startingSentence(),
      FlintBrainWordingUtil.runningSentence(),
    ];
    for (const sentence of sentences) expect(sentence).not.toMatch(/`|--|\bforge (?:start|stop|oversee|init|update)\b/u);
  });
});
