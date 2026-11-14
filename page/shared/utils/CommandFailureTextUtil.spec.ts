/**
 * The words of a refusal. What matters (SCREENS, rules for every screen): a forge's refusal shows the forge's own code and sentence,
 * unedited; an outcome the forge did not word, and a send no server answered, are worded by Gaia and never left blank.
 */
import { describe, expect, test } from 'bun:test';

import { CommandFailureTextUtil } from './CommandFailureTextUtil.ts';

describe('a refusal\'s code and sentence', () => {
  test('are the forge\'s own when it refused, and Gaia\'s when nothing answered for it', () => {
    const refused = {
      answerVersion: 3, outcome: 'refused', refusal: 'update-in-progress', text: 'An update already runs in this repository.'
    } as const;
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-update', result: { verdict: 'answered', answer: refused } }))
      .toEqual({ refusedBy: 'forge', code: 'update-in-progress', sentence: 'An update already runs in this repository.' });
    const notSupported = {
      answerVersion: 3, outcome: 'not-supported', refusal: null, text: null
    } as const;
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-restart', result: { verdict: 'answered', answer: notSupported } }))
      .toEqual({ refusedBy: 'gaia', code: 'not-supported', sentence: 'This forge does not take this command from Gaia.' });
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-start', result: { verdict: 'server-unreachable' } }))
      .toEqual({ refusedBy: 'gaia', code: 'server-unreachable', sentence: 'Gaia\'s server could not be reached.' });
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-start', result: { verdict: 'answer-not-understood' } }))
      .toEqual({ refusedBy: 'gaia', code: 'answer-not-understood', sentence: 'Gaia\'s server gave an answer this page does not understand.' });
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-start', result: { verdict: 'session-lost' } }))
      .toEqual({ refusedBy: 'gaia', code: 'session-lost', sentence: 'Gaia\'s server no longer knows this window.' });
  });
});

describe('who refused', () => {
  test('a forge refused only an answered refusal of a command Gaia asked a forge to carry; Gaia\'s own commands are refused by Gaia', () => {
    const refused = {
      answerVersion: 3, outcome: 'refused', refusal: 'settings-unwritable', text: null
    } as const;
    const refusedByOf = (kind: 'forge-add' | 'settings-set' | 'path-choose' | 'fleet-look-again') => (
      CommandFailureTextUtil.refusalTextOf({ kind, result: { verdict: 'answered', answer: refused } }).refusedBy
    );
    expect(['forge-add', 'settings-set', 'path-choose', 'fleet-look-again'].map((kind) => refusedByOf(kind as Parameters<typeof refusedByOf>[0])))
      .toEqual(['forge', 'gaia', 'gaia', 'gaia']);
    const unreachable = {
      answerVersion: 3, outcome: 'unreachable', refusal: null, text: null
    } as const;
    expect(CommandFailureTextUtil.refusalTextOf({ kind: 'forge-stop', result: { verdict: 'answered', answer: unreachable } }).refusedBy).toBe('gaia');
  });
});
