/**
 * The command answer the page reads: every verdict maps to its outcome at the known `answerVersion`, an update whose Baton pass was not
 * taken answers restart pending, a forge's refusal keeps its code and its sentence unless the sentence names a command (D10), Gaia's own
 * refusal carries its code with no sentence, a chosen path is a done answer's text, and a command Gaia could not read answers not-supported
 * with the reason as its code. Each refusal of Flint's brain recorded at control 2 reaches the page with its code and its sentence.
 */
import { describe, expect, test } from 'bun:test';

import { recordedFlintBrainAnswersOf } from '../../testing/RecordedAnswers.ts';

import { PageAnswerMapUtil } from './PageAnswerMapUtil.ts';

describe('the command answer of a verdict', () => {
  test('maps done, nothing to do, unreachable, not supported and restart pending to their outcome with no refusal', () => {
    expect([
      PageAnswerMapUtil.commandAnswerOf({ verdict: 'done' }),
      PageAnswerMapUtil.commandAnswerOf({ verdict: 'nothing-to-do' }),
      PageAnswerMapUtil.commandAnswerOf({ verdict: 'unreachable' }),
      PageAnswerMapUtil.commandAnswerOf({ verdict: 'not-supported' }),
      PageAnswerMapUtil.commandAnswerOf({ verdict: 'restart-pending' }),
    ]).toEqual([
      {
        answerVersion: 3, outcome: 'done', refusal: null, text: null
      },
      {
        answerVersion: 3, outcome: 'nothing-to-do', refusal: null, text: null
      },
      {
        answerVersion: 3, outcome: 'unreachable', refusal: null, text: null
      },
      {
        answerVersion: 3, outcome: 'not-supported', refusal: null, text: null
      },
      {
        answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null
      },
    ]);
  });

  test('answers a chosen path as done, with the path as its text', () => {
    expect(PageAnswerMapUtil.commandAnswerOf({ verdict: 'path-chosen', path: '/Users/example/Development/example-storefront' })).toEqual({
      answerVersion: 3,
      outcome:       'done',
      refusal:       null,
      text:          '/Users/example/Development/example-storefront',
    });
  });

  test('passes a forge\'s refusal code and a sentence that names no command through unchanged', () => {
    const refusal = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'overseer-held', text: 'The Overseer is held by an install change.'
    } as const;
    expect(PageAnswerMapUtil.commandAnswerOf(refusal)).toEqual({
      answerVersion: 3,
      outcome:       'refused',
      refusal:       'overseer-held',
      text:          'The Overseer is held by an install change.',
    });
  });

  test('words a forge\'s refusal whose sentence names a command in Gaia\'s words, by its code, and keeps the code', () => {
    const refusal = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'launches-held-by-install-change', text: 'The install version changed: run `forge update`.'
    } as const;
    expect(PageAnswerMapUtil.commandAnswerOf(refusal)).toEqual({
      answerVersion: 3,
      outcome:       'refused',
      refusal:       'launches-held-by-install-change',
      text:          'The install version changed. Nothing launches until this forge is updated.',
    });
  });

  test('drops a sentence of an unknown code that names a command, so the page words the refusal from its outcome', () => {
    const refusal = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'arguments-refused', text: 'It is a bare repository. Run `forge init` in a checkout of it.'
    } as const;
    expect(PageAnswerMapUtil.commandAnswerOf(refusal)).toEqual({
      answerVersion: 3, outcome: 'refused', refusal: 'arguments-refused', text: null
    });
  });

  test('carries Gaia\'s own refusal as its code, with no sentence', () => {
    expect(PageAnswerMapUtil.commandAnswerOf({ verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' })).toEqual({
      answerVersion: 3,
      outcome:       'refused',
      refusal:       'command-in-flight',
      text:          null,
    });
  });
});

describe('the command answer of a command of Flint\'s brain', () => {
  test('carries each recorded refusal of the forge to the page with its code and its sentence', () => {
    const refusals = (['brain-refused', 'no-flint'] as const).flatMap((situation) => recordedFlintBrainAnswersOf(situation))
      .filter(({ callShape }) => callShape === 'POST /api/v1/commands with bearer')
      .flatMap(({ answer }) => (answer.verdict === 'answered' ? [JSON.parse(answer.bodyText) as { refusal: string; text: string }] : []));
    expect(refusals.map(({ refusal }) => refusal)).toEqual(['usage-limit-holds', 'no-flint']);
    for (const { refusal, text } of refusals) {
      expect(PageAnswerMapUtil.commandAnswerOf({
        verdict: 'refused', refusedBy: 'forge', refusal, text,
      })).toEqual({
        answerVersion: 3, outcome: 'refused', refusal, text,
      });
    }
  });

});

describe('the command answer of a command Gaia could not read', () => {
  test('is not supported, with the reason as its code', () => {
    expect([
      PageAnswerMapUtil.unreadableCommandAnswerOf({ verdict: 'other-version', commandVersion: 1 }),
      PageAnswerMapUtil.unreadableCommandAnswerOf({ verdict: 'malformed', invalidKeys: ['trackerId'] }),
    ]).toEqual([
      {
        answerVersion: 3, outcome: 'not-supported', refusal: 'other-version', text: null
      },
      {
        answerVersion: 3, outcome: 'not-supported', refusal: 'malformed', text: null
      },
    ]);
  });
});
