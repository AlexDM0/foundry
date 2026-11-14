/**
 * The mind on each frame, pure, with no page: the reflexes, the intents and the target pose. What matters: Flint starts in the middle of
 * its home, or in the habitat the host stored; any cue wakes it, and only the cues of its own habitat wait for the director; a habitat
 * that leaves the page or becomes too small sends Flint home; a click starts cursor play and a drag carries Flint, and both win over the
 * director; an intent starts its gesture, emote or behaviour, keeps a gesture that already runs, and is dropped while a reflex or a
 * visit runs; the pop-in's wave stands for the arrival's wave; an emote shows over a running gesture; sleep goes home; Flint blinks only
 * while it does nothing else; and the place Flint stands on is what the sensors watch.
 */
import { describe, expect, test } from 'bun:test';

import { mindStateAfterDirectorAsked, standingPlaceOf, targetPoseOfMind } from './SpriteMind.ts';
import { INITIAL_MIND_STATE }                                             from './mind/MindState.ts';
import {
  AGENTS,
  CHAT,
  createMindRun,
  HOME_BOX
} from './testing/MindRun.ts';

describe('placement', () => {
  test('Flint is placed in the middle of its home, standing on its floor', () => {
    const run = createMindRun();
    expect(run.frame().motion).toMatchObject({ positionX: 1000, floorY: 700 });
    expect(run.state().livesIn).toBeNull();
  });

  test('a stored habitat on the page takes Flint in, in its middle, until Flint first moves on its own', () => {
    const run = createMindRun();
    run.frame();
    run.frame({ storedHabitatId: 'chat' });
    expect([run.state().livesIn, run.state().motion.positionX, run.state().motion.floorY]).toEqual(['chat', 400, 500]);
    const moved = createMindRun();
    moved.frame();
    moved.give('wave');
    moved.frame();
    expect(moved.frame({ storedHabitatId: 'chat' }).livesIn).toBeNull();
  });

  test('a habitat that leaves the page, or becomes smaller than the minimum, sends Flint home', () => {
    const run = createMindRun();
    run.frame({ storedHabitatId: 'chat' });
    expect(run.frame({ habitats: [{ ...CHAT, isRoomy: false }, AGENTS] }).livesIn).toBeNull();
    expect(run.state().motion.floorY).toBe(HOME_BOX.floorY);
    const gone = createMindRun();
    gone.frame({ storedHabitatId: 'chat' });
    expect(gone.frame({ habitats: [AGENTS] }).livesIn).toBeNull();
  });
});

describe('cues', () => {
  test('a cue of the habitat Flint lives in waits for the director; a cue elsewhere only wakes Flint and ends the quiet', () => {
    const run = createMindRun();
    run.frame({ storedHabitatId: 'chat' });
    run.frame({ cues: [{ habitatId: 'chat', cue: 'agent-is-writing' }, { habitatId: 'agents', cue: 'agent-appears' }] });
    expect(run.state().directorInbox).toEqual(['agent-is-writing']);
    expect(run.state().recentCues).toEqual(['agent-is-writing']);
    expect(run.state().quietSinceMilliseconds).toBe(run.elapsedMilliseconds());
    expect(mindStateAfterDirectorAsked(run.state(), run.elapsedMilliseconds()).directorInbox).toEqual([]);
  });

  test('any cue wakes a sleeping Flint', () => {
    const run = createMindRun();
    run.frame();
    run.give('sleep');
    expect(run.frame().behaviour.name).toBe('sleep');
    run.frame({ cues: [{ habitatId: 'agents', cue: 'agent-appears' }] });
    expect([run.state().behaviour.name, run.state().sleep.phase]).toEqual(['wander', 'waking']);
  });

  test('the recent cues keep only the last eight', () => {
    const run = createMindRun();
    run.frame({ storedHabitatId: 'chat' });
    for (let i = 0; i < 10; i++) run.frame({ cues: [{ habitatId: 'chat', cue: `cue-${i}` }] });
    expect(run.state().recentCues).toEqual(['cue-2', 'cue-3', 'cue-4', 'cue-5', 'cue-6', 'cue-7', 'cue-8', 'cue-9']);
  });
});

describe('the pointer reflexes', () => {
  test('a click starts cursor play with a surprised emote, and wakes a sleeping Flint', () => {
    const run = createMindRun();
    run.frame();
    run.give('sleep');
    run.frame();
    run.frame({ happenings: [{ kind: 'clicked' }], pointer: { x: 1000, y: 680, hasMoved: false } });
    expect([run.state().behaviour.name, run.state().emote?.name, run.state().sleep.phase]).toEqual(['cursor-play', 'surprised', 'waking']);
  });

  test('a click during a visit is ignored, but a drag carries Flint off', () => {
    const run = createMindRun();
    run.frame();
    run.give('visit', 'chat');
    run.frame();
    expect(run.frame({ happenings: [{ kind: 'clicked' }] }).behaviour.name).toBe('visit');
    expect(run.frame({ happenings: [{ kind: 'drag-started' }], pointer: { x: 300, y: 300, hasMoved: true } }).behaviour.name).toBe('carried');
  });
});

describe('intents', () => {
  test('a gesture intent starts its gesture in that mood, and the same intent keeps the running gesture', () => {
    const run = createMindRun();
    run.frame();
    run.give('type-busy');
    const started = run.frame().gesture;
    expect([started?.name, started?.mood]).toEqual(['type', 'busy']);
    run.runFor(500);
    run.give('type-busy');
    expect(run.frame().gesture?.startedAtMilliseconds).toBe(started?.startedAtMilliseconds);
  });

  test('a mood the gesture does not have falls back to normal', () => {
    const run = createMindRun();
    run.frame();
    run.give('merge');
    expect(run.frame().gesture?.mood).toBe('normal');
  });

  test('an emote shows over a gesture that has no end of its own, and the gesture goes on', () => {
    const run = createMindRun();
    run.frame();
    run.give('type');
    run.frame();
    run.give('happy');
    expect([run.frame().emote?.name, run.state().gesture?.name]).toEqual(['happy', 'type']);
  });

  test('an emote ends after its time', () => {
    const run = createMindRun();
    run.frame();
    run.give('doubt');
    run.frame();
    expect(run.runFor(1400).emote?.name).toBe('doubt');
    expect(run.runFor(200).emote).toBeNull();
  });

  test('sleep goes home and sleeps there; wander only wakes Flint', () => {
    const run = createMindRun();
    run.frame({ storedHabitatId: 'chat' });
    run.give('sleep');
    run.frame();
    expect([run.state().livesIn, run.state().behaviour.name, run.state().sleep.phase, run.state().motion.floorY]).toEqual([null, 'sleep', 'asleep', 700]);
    run.give('wander');
    expect(run.frame().behaviour.name).toBe('wander');
  });

  test('an intent given while Flint is carried is dropped', () => {
    const run = createMindRun();
    run.frame({ happenings: [{ kind: 'drag-started' }], pointer: { x: 300, y: 300, hasMoved: true } });
    run.give('wave');
    expect([run.frame().gesture, run.state().pendingIntent, run.state().lastIntent]).toEqual([null, null, null]);
  });

  test('the first wave after a pop-in is skipped, since the pop-in waved; the next one waves', () => {
    const run = createMindRun();
    run.frame();
    run.change((state) => ({ ...state, greetedOnArrival: true }));
    run.give('wave');
    expect([run.frame().gesture, run.state().greetedOnArrival]).toEqual([null, false]);
    run.give('wave');
    expect(run.frame().gesture?.name).toBe('wave');
  });

  test('a visit with no target, or to where Flint lives, changes nothing; copy with nothing to copy changes nothing', () => {
    const run = createMindRun();
    run.frame({ storedHabitatId: 'chat' });
    run.give('visit', null);
    expect(run.frame().behaviour.name).toBe('wander');
    run.give('visit', 'chat');
    expect(run.frame().behaviour.name).toBe('wander');
    run.give('copy');
    expect([run.frame().behaviour.name, run.state().lastIntent]).toEqual(['wander', 'copy']);
  });

  test('an intent other than wander or sleep ends the quiet', () => {
    const run = createMindRun();
    run.frame();
    run.runFor(1000);
    run.give('wander');
    expect(run.frame().quietSinceMilliseconds).toBe(0);
    run.give('idea');
    expect(run.frame().quietSinceMilliseconds).toBe(run.elapsedMilliseconds());
  });
});

describe('the target pose', () => {
  test('Flint blinks only while it does nothing else', () => {
    const run = createMindRun();
    run.frame();
    const idle = { ...run.state(), behaviour: { name: 'wander' as const, walkToX: null, restUntilMilliseconds: Infinity } };
    expect(targetPoseOfMind(idle, 4050, false).eyes.height).toBe(1);
    run.give('point');
    run.frame();
    expect(targetPoseOfMind(run.state(), 4050, false).eyes.height).not.toBe(1);
  });

  test('under reduced motion the hover holds at its rest height', () => {
    const run = createMindRun();
    run.frame();
    expect(targetPoseOfMind(run.state(), 1234, true).body.hover).toBe(6);
  });
});

describe('the place Flint stands on', () => {
  test('is its home, its habitat, the habitat it visits, or the air while it is carried', () => {
    expect(standingPlaceOf(INITIAL_MIND_STATE)).toEqual({ kind: 'home' });
    const run = createMindRun();
    run.frame({ storedHabitatId: 'chat' });
    expect(standingPlaceOf(run.state())).toEqual({ kind: 'habitat', habitatId: 'chat' });
    run.give('visit', 'agents');
    run.frame();
    expect(standingPlaceOf(run.state())).toEqual({ kind: 'habitat', habitatId: 'agents' });
    run.frame({ happenings: [{ kind: 'drag-started' }], pointer: { x: 10, y: 10, hasMoved: true } });
    expect(standingPlaceOf(run.state())).toEqual({ kind: 'in-the-air' });
  });
});
