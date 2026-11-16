/**
 * Flint's brain's director against a recording ask. What matters: a digest goes out with every move this Flint knows and no separate
 * emote, its excerpt cut to the length the brain reads; the brain's move comes back as Flint's intent; every other answer, a move off the
 * list included, is refused, so Flint's rule director moves that time; and no ask goes out while the page is hidden or Flint sleeps.
 */
import { describe, expect, test } from 'bun:test';

import type { PerceptionDigest } from 'flint/SpriteHabitat';
import { SPRITE_INTENTS }        from 'flint/SpriteHabitat';

import { FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS }              from '../../src/shared/constants/OverseerLimits.ts';
import type { FlintBrainAsk, FlintBrainDigestDocument }      from '../api/FlintBrainClient.ts';
import { FlintBrainDirector, type FlintBrainFallbackReason } from './FlintBrainDirector.ts';

const DIGEST: PerceptionDigest = {
  habitatKind:       'chat',
  description:       'Example conversation',
  suggestions:       [{ when: 'agent-is-writing', respond: 'type', note: 'The agent writes its answer.' }],
  recentCues:        ['agent-is-writing'],
  newCues:           ['agent-is-writing'],
  content:           { facts: { turns: 3 }, excerpt: 'Example answer' },
  lastIntent:        'wave',
  isAsleep:          false,
  visitTargetKind:   null,
  copyIsOffered:     false,
  quietMilliseconds: 1200,
};

interface RecordingAsk {
  readonly asked: FlintBrainDigestDocument[];
  readonly ask:   (digest: FlintBrainDigestDocument) => Promise<FlintBrainAsk>;
}

function recordingAsk(answer: FlintBrainAsk): RecordingAsk {
  const asked: FlintBrainDigestDocument[] = [];
  return {
    asked,
    ask: (digest) => {
      asked.push(digest);
      return Promise.resolve(answer);
    },
  };
}

const PAGE_SHOWN = (): boolean => false;

async function fallbackReasonOf(answer: Promise<unknown> | unknown): Promise<FlintBrainFallbackReason | 'answered'> {
  try {
    await answer;
    return 'answered';
  } catch (thrown) {
    return (thrown as { reason: FlintBrainFallbackReason }).reason;
  }
}

describe('the brain\'s director', () => {
  test('asks with the digest and every move this Flint knows, no separate emote, and takes the brain\'s move', async () => {
    const recording = recordingAsk({ verdict: 'answered', intent: 'merge', emote: null });
    const director = FlintBrainDirector.create({ ask: recording.ask, documentIsHidden: PAGE_SHOWN });
    expect(await director.nextIntent(DIGEST)).toBe('merge');
    expect(recording.asked).toEqual([{ ...DIGEST, intents: SPRITE_INTENTS, emotes: [] }]);
  });

  test('cuts the excerpt to its last characters the brain reads, and leaves out an excerpt the habitat gave none of', () => {
    const longExcerpt = `${'x'.repeat(10)}${'y'.repeat(FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS)}`;
    const cut = FlintBrainDirector.digestDocumentOf({ ...DIGEST, content: { facts: {}, excerpt: longExcerpt } });
    expect(cut.content?.excerpt).toBe('y'.repeat(FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS));
    expect(FlintBrainDirector.digestDocumentOf({ ...DIGEST, content: { facts: { turns: 1 } } }).content).toEqual({ facts: { turns: 1 } });
    expect(FlintBrainDirector.digestDocumentOf({ ...DIGEST, content: null }).content).toBeNull();
  });

  test('refuses every answer that is no move of the list, so the rule director moves that time', async () => {
    const answers: readonly FlintBrainAsk[] = [
      { verdict: 'not-asked', reason: 'too-soon' },
      { verdict: 'refused', refusal: 'unauthorized' },
      { verdict: 'no-session' },
      { verdict: 'unreachable' },
      { verdict: 'answered', intent: 'take-over-the-board', emote: null },
    ];
    const directorAnswering = (answer: FlintBrainAsk) => FlintBrainDirector.create({ ask: recordingAsk(answer).ask, documentIsHidden: PAGE_SHOWN });
    const reasons = await Promise.all(answers.map((answer) => fallbackReasonOf(directorAnswering(answer).nextIntent(DIGEST))));
    expect(reasons).toEqual(['not-asked', 'refused', 'no-session', 'unreachable', 'off-list-answer']);
  });

  test('asks nothing while the page is hidden or Flint sleeps', async () => {
    const recording = recordingAsk({ verdict: 'answered', intent: 'merge', emote: null });
    const hidden = FlintBrainDirector.create({ ask: recording.ask, documentIsHidden: () => true });
    const shown = FlintBrainDirector.create({ ask: recording.ask, documentIsHidden: PAGE_SHOWN });
    expect([await fallbackReasonOf(hidden.nextIntent(DIGEST)), await fallbackReasonOf(shown.nextIntent({ ...DIGEST, isAsleep: true }))]).toEqual(['page-hidden', 'asleep']);
    expect(recording.asked).toEqual([]);
  });
});
