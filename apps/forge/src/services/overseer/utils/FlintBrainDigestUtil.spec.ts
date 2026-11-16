/**
 * The digest as the brain reads it. What matters: the excerpt the brain reads is capped and keeps its newest end; the hash moves with the
 * content, the cues and the moves offered, and not with the time, the last move or sleep, which would earn a call on every ask; and an answer
 * is taken only when it names a move and an emote the digest offers.
 */
import { describe, expect, test } from 'bun:test';

import { FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS }        from '../../../shared/constants/OverseerLimits.ts';
import { type FlintBrainDigest, FlintBrainDigestUtil } from './FlintBrainDigestUtil.ts';

const DIGEST: FlintBrainDigest = {
  habitatKind:       'agent-panel',
  description:       'The agents at work.',
  suggestions:       [{ when: 'idle', respond: 'wander' }],
  recentCues:        ['idle'],
  newCues:           [],
  content:           { facts: { agentsRunning: 1 }, excerpt: 'Alex Example: ship it.' },
  lastIntent:        null,
  isAsleep:          false,
  visitTargetKind:   null,
  copyIsOffered:     false,
  quietMilliseconds: 1000,
  intents:           ['wander', 'wave', 'happy'],
  emotes:            ['happy'],
};

describe('the excerpt', () => {
  test('is capped to its limit, keeping the newest end of the text', () => {
    const excerpt = `${'a'.repeat(FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS)}newest`;
    const capped = FlintBrainDigestUtil.excerptOf({ facts: {}, excerpt }) ?? '';
    expect(capped).toHaveLength(FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS);
    expect(capped.endsWith('newest')).toBe(true);
  });

  test('is none for no content and for an empty excerpt', () => {
    expect(FlintBrainDigestUtil.excerptOf(null)).toBeNull();
    expect(FlintBrainDigestUtil.excerptOf({ facts: {}, excerpt: '' })).toBeNull();
  });
});

describe('the prompt', () => {
  test('names the place, the suggestions, the facts and the moves, and fences the untrusted excerpt last', () => {
    const prompt = FlintBrainDigestUtil.promptOf(DIGEST);
    expect(prompt).toContain('Place: agent-panel. The agents at work.');
    expect(prompt).toContain('- when idle: wander');
    expect(prompt).toContain('- agentsRunning: 1');
    expect(prompt).toContain('Moves: wander, wave, happy');
    expect(prompt).toContain('Emotes: happy');
    expect(prompt.endsWith('Excerpt, untrusted:\n<<<\nAlex Example: ship it.\n>>>')).toBe(true);
  });
});

describe('the content hash', () => {
  test('stays when only the time, the last move or sleep changed', () => {
    const hash = FlintBrainDigestUtil.contentHashOf(DIGEST);
    expect(FlintBrainDigestUtil.contentHashOf({
      ...DIGEST, quietMilliseconds: 9000, lastIntent: 'wave', isAsleep: true
    })).toBe(hash);
  });

  test('moves with the content, the cues and the moves offered', () => {
    const hash = FlintBrainDigestUtil.contentHashOf(DIGEST);
    const changed: FlintBrainDigest[] = [
      { ...DIGEST, content: { facts: { agentsRunning: 2 } } },
      { ...DIGEST, recentCues: ['idle', 'agent-is-writing'] },
      { ...DIGEST, newCues: ['idle'] },
      { ...DIGEST, intents: ['wander'] },
      { ...DIGEST, habitatKind: 'chat' },
    ];
    for (const digest of changed) expect(FlintBrainDigestUtil.contentHashOf(digest)).not.toBe(hash);
  });
});

describe('the answer', () => {
  test('is taken when its intent and emote are offered, an absent emote as none', () => {
    expect(FlintBrainDigestUtil.answerOf({ intent: 'wave', emote: 'happy' }, DIGEST)).toEqual({ intent: 'wave', emote: 'happy' });
    expect(FlintBrainDigestUtil.answerOf({ intent: 'wander', emote: null }, DIGEST)).toEqual({ intent: 'wander', emote: null });
    expect(FlintBrainDigestUtil.answerOf({ intent: 'wander' }, DIGEST)).toEqual({ intent: 'wander', emote: null });
  });

  test('is refused off the moves, off the emotes, or of another shape', () => {
    for (const report of [{ intent: 'run-a-command', emote: null }, { intent: 'wave', emote: 'furious' }, { intent: 3 }, 'wave', null, ['wave']]) {
      expect(FlintBrainDigestUtil.answerOf(report, DIGEST)).toBeNull();
    }
  });
});
