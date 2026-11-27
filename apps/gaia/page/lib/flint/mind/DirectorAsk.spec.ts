/**
 * When the director is asked and what it is told: its timing and what holds it back, how long a brain session lasts, that a brain never
 * answers while Flint sleeps, and what the digest tells.
 */
import { describe, expect, test } from 'bun:test';

import type { Director }                        from '../SpriteHabitat.ts';
import { INITIAL_MIND_STATE }                   from '../SpriteMind.ts';
import { sleepStateFallingAsleep, SLEEP_AWAKE } from '../sleep/SleepSequence.ts';
import {
  brainAnswers,
  brainSessionAt,
  brainSessionOf,
  directorIsDue,
  perceptionDigestOf
} from './DirectorAsk.ts';

const BRAIN: Director = { nextIntent: () => 'wave' };

describe('when the director is asked', () => {
  test('every three seconds, and at once when a cue waits', () => {
    expect(directorIsDue(INITIAL_MIND_STATE, 2999)).toBe(false);
    expect(directorIsDue(INITIAL_MIND_STATE, 3000)).toBe(true);
    expect(directorIsDue({ ...INITIAL_MIND_STATE, directorInbox: ['agent-is-writing'] }, 10)).toBe(true);
  });

  test('never while Flint is carried or plays, nor while an intent waits', () => {
    const carried = { ...INITIAL_MIND_STATE, behaviour: { name: 'carried' as const, startedAtMilliseconds: 0, cameFromHabitatId: null } };
    expect(directorIsDue(carried, 9000)).toBe(false);
    const playing = { ...INITIAL_MIND_STATE, behaviour: { name: 'cursor-play' as const, pointerMovedAtMilliseconds: 0, nextGrabAtMilliseconds: 0 } };
    expect(directorIsDue(playing, 9000)).toBe(false);
    expect(directorIsDue({ ...INITIAL_MIND_STATE, pendingIntent: { intent: 'wave', visitTargetId: null } }, 9000)).toBe(false);
  });
});

describe('the brain', () => {
  test('a session lasts its maximum time, and a time that is not positive gives none', () => {
    const session = brainSessionOf(BRAIN, 120000, 5000);
    expect(brainSessionAt(session, 124999)).toBe(session);
    expect(brainSessionAt(session, 125000)).toBeNull();
    expect(brainSessionOf(BRAIN, 0, 0)).toBeNull();
    expect(brainSessionOf(BRAIN, Number.NaN, 0)).toBeNull();
  });

  test('a brain never answers while Flint sleeps', () => {
    const session = brainSessionOf(BRAIN, 1000, 0);
    expect(brainAnswers(session, INITIAL_MIND_STATE)).toBe(true);
    expect(brainAnswers(session, { ...INITIAL_MIND_STATE, sleep: sleepStateFallingAsleep(SLEEP_AWAKE, 0) })).toBe(false);
    expect(brainAnswers(null, INITIAL_MIND_STATE)).toBe(false);
  });
});

test('the digest tells the habitat, the new and recent cues, the quiet, the visit target and the offered copy', () => {
  const state = {
    ...INITIAL_MIND_STATE, directorInbox: ['agent-is-done'], recentCues: ['agent-is-writing', 'agent-is-done'], quietSinceMilliseconds: 1000, lastIntent: 'type' as const,
  };
  const digest = perceptionDigestOf({
    state,
    habitat:             { kind: 'chat', description: 'The chat.', suggestions: [{ when: 'agent-is-done', respond: 'happy' }] },
    content:             null,
    visitTargetKind:     'agent-panel',
    copyIsOffered:       true,
    elapsedMilliseconds: 4000,
  });
  expect(digest).toEqual({
    habitatKind:       'chat',
    description:       'The chat.',
    suggestions:       [{ when: 'agent-is-done', respond: 'happy' }],
    recentCues:        ['agent-is-writing', 'agent-is-done'],
    newCues:           ['agent-is-done'],
    content:           null,
    lastIntent:        'type',
    isAsleep:          false,
    visitTargetKind:   'agent-panel',
    copyIsOffered:     true,
    quietMilliseconds: 3000,
  });
});
