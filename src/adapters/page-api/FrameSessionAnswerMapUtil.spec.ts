/**
 * The frame session verdict mapped out to the page contract. What matters: every answer carries `frameSessionVersion`, only `done`
 * carries a frame address, a forge's refusal passes its code through unchanged and its sentence too, unless it names a command (D10), and
 * Gaia's own refusal carries its code only.
 */
import { describe, expect, test } from 'bun:test';

import { FrameSessionAnswerMapUtil } from './FrameSessionAnswerMapUtil.ts';

const FRAME_URL = 'http://127.0.0.1:4951/?embedded=gaia#session=0123456789abcdef';

describe('a frame session verdict mapped out', () => {
  test('carries the frame address at done', () => {
    expect(FrameSessionAnswerMapUtil.answerDocumentOf({ verdict: 'opened', frameUrl: FRAME_URL })).toEqual({
      frameSessionVersion: 1, outcome: 'done', frameUrl: FRAME_URL, refusal: null, text: null,
    });
  });

  test('passes a forge\'s refusal code and a sentence that names no command through unchanged', () => {
    const verdict = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'example-refusal', text: 'The Example Storefront forge refused this.',
    } as const;
    expect(FrameSessionAnswerMapUtil.answerDocumentOf(verdict)).toEqual({
      frameSessionVersion: 1, outcome: 'refused', frameUrl: null, refusal: 'example-refusal', text: 'The Example Storefront forge refused this.',
    });
  });

  test('words a forge\'s refusal whose sentence names a command in Gaia\'s words, by its code', () => {
    const verdict = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'unauthorized', text: 'The Overseer may have restarted: open the board again with `forge open`.',
    } as const;
    expect(FrameSessionAnswerMapUtil.answerDocumentOf(verdict)).toEqual({
      frameSessionVersion: 1, outcome: 'refused', frameUrl: null, refusal: 'unauthorized', text: 'The Overseer did not accept Gaia\'s token. It may have restarted.',
    });
  });

  test('carries Gaia\'s own refusal as its code only, which the page words', () => {
    expect(FrameSessionAnswerMapUtil.answerDocumentOf({ verdict: 'refused', refusedBy: 'gaia', refusal: 'token-unreadable' })).toEqual({
      frameSessionVersion: 1, outcome: 'refused', frameUrl: null, refusal: 'token-unreadable', text: null,
    });
  });

  test('names unreachable and not-supported as their outcome with nothing else', () => {
    for (const verdict of ['unreachable', 'not-supported'] as const) {
      expect(FrameSessionAnswerMapUtil.answerDocumentOf({ verdict })).toEqual({
        frameSessionVersion: 1, outcome: verdict, frameUrl: null, refusal: null, text: null,
      });
    }
  });
});
