/**
 * The words of a refusal. What matters (SCREENS, rules for every screen): a forge's refusal shows the forge's own code and sentence,
 * unedited; an outcome the forge did not word, and a send no server answered, are worded by Gaia and never left blank.
 */
import { describe, expect, test } from 'bun:test';

import { CommandFailureTextUtil } from './CommandFailureTextUtil.ts';

describe('a refusal\'s code and sentence', () => {
  test('are the forge\'s own when it refused, and Gaia\'s when nothing answered for it', () => {
    const refused = {
      answerVersion: 1, outcome: 'refused', refusal: 'update-in-progress', text: 'An update already runs in this repository.'
    } as const;
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-update', result: { verdict: 'answered', answer: refused } }))
      .toEqual({ code: 'update-in-progress', sentence: 'An update already runs in this repository.' });
    const notSupported = {
      answerVersion: 1, outcome: 'not-supported', refusal: null, text: null
    } as const;
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-restart', result: { verdict: 'answered', answer: notSupported } }))
      .toEqual({ code: 'not-supported', sentence: 'This forge does not take this command from Gaia.' });
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-start', result: { verdict: 'server-unreachable' } }))
      .toEqual({ code: 'server-unreachable', sentence: 'Gaia\'s server could not be reached.' });
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-start', result: { verdict: 'answer-not-understood' } }))
      .toEqual({ code: 'answer-not-understood', sentence: 'Gaia\'s server gave an answer this page does not understand.' });
  });
});
