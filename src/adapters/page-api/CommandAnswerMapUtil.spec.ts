/**
 * The command answer the page reads: every verdict maps to its outcome at the known `answerVersion`, a forge's refusal keeps its code and
 * its sentence unchanged, Gaia's own refusal carries its code with no sentence, a chosen path is a done answer's text, and a command Gaia
 * could not read answers not-supported with the reason as its code.
 */
import { describe, expect, test } from 'bun:test';

import { CommandAnswerMapUtil } from './CommandAnswerMapUtil.ts';

describe('the command answer of a verdict', () => {
  test('maps done, nothing to do, unreachable and not supported to their outcome with no refusal', () => {
    expect([
      CommandAnswerMapUtil.commandAnswerOf({ verdict: 'done' }),
      CommandAnswerMapUtil.commandAnswerOf({ verdict: 'nothing-to-do' }),
      CommandAnswerMapUtil.commandAnswerOf({ verdict: 'unreachable' }),
      CommandAnswerMapUtil.commandAnswerOf({ verdict: 'not-supported' }),
    ]).toEqual([
      {
        answerVersion: 1, outcome: 'done', refusal: null, text: null
      },
      {
        answerVersion: 1, outcome: 'nothing-to-do', refusal: null, text: null
      },
      {
        answerVersion: 1, outcome: 'unreachable', refusal: null, text: null
      },
      {
        answerVersion: 1, outcome: 'not-supported', refusal: null, text: null
      },
    ]);
  });

  test('answers a chosen path as done, with the path as its text', () => {
    expect(CommandAnswerMapUtil.commandAnswerOf({ verdict: 'path-chosen', path: '/Users/example/Development/example-storefront' })).toEqual({
      answerVersion: 1,
      outcome:       'done',
      refusal:       null,
      text:          '/Users/example/Development/example-storefront',
    });
  });

  test('passes a forge\'s refusal code and sentence through unchanged', () => {
    const refusal = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'overseer-held', text: 'The Overseer is held by an install change.'
    } as const;
    expect(CommandAnswerMapUtil.commandAnswerOf(refusal)).toEqual({
      answerVersion: 1,
      outcome:       'refused',
      refusal:       'overseer-held',
      text:          'The Overseer is held by an install change.',
    });
  });

  test('carries Gaia\'s own refusal as its code, with no sentence', () => {
    expect(CommandAnswerMapUtil.commandAnswerOf({ verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' })).toEqual({
      answerVersion: 1,
      outcome:       'refused',
      refusal:       'command-in-flight',
      text:          null,
    });
  });
});

describe('the command answer of a command Gaia could not read', () => {
  test('is not supported, with the reason as its code', () => {
    expect([
      CommandAnswerMapUtil.unreadableCommandAnswerOf({ verdict: 'other-version', commandVersion: 2 }),
      CommandAnswerMapUtil.unreadableCommandAnswerOf({ verdict: 'malformed', invalidKeys: ['trackerId'] }),
    ]).toEqual([
      {
        answerVersion: 1, outcome: 'not-supported', refusal: 'other-version', text: null
      },
      {
        answerVersion: 1, outcome: 'not-supported', refusal: 'malformed', text: null
      },
    ]);
  });
});
