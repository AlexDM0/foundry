/**
 * How an intent changes the mind. What matters: only the wander, the sleep and the copy take an intent, and an intent given in any other
 * behaviour is dropped; the wave after a pop-in's own wave is skipped once; a gesture stops the wander's walk and leaves a copy; an emote
 * shows over a running gesture; `wander` only wakes Flint and keeps a stored habitat that has not registered yet, which any other intent
 * gives up; the idle intents keep the quiet and the others end it; and a visit or a copy that cannot start here changes nothing but is
 * remembered.
 */
import { describe, expect, test } from 'bun:test';

import type { SpriteIntent }                                 from '../SpriteHabitat.ts';
import { sleepStateFallingAsleep }                           from '../sleep/SleepSequence.ts';
import { AGENTS, CHAT, perceptionOf }                        from '../testing/MindRun.ts';
import { behaviourTakesIntents, mindStateWithIntentApplied } from './IntentApplication.ts';
import type { BehaviourName, SpriteMindState }               from './MindState.ts';
import { INITIAL_MIND_STATE }                                from './MindState.ts';

/** Placed in the middle of the home at 0 ms, walking to the left, quiet since 1000 ms. */
const AT_HOME: SpriteMindState = {
  ...INITIAL_MIND_STATE,
  isPlaced:               true,
  motion:                 { ...INITIAL_MIND_STATE.motion, positionX: 1000, floorY: 700 },
  behaviour:              { name: 'wander', walkToX: 950, restUntilMilliseconds: 0 },
  quietSinceMilliseconds: 1000,
};

function applied(state: SpriteMindState, intent: SpriteIntent, visitTargetId: string | null = null, perception = perceptionOf()): SpriteMindState {
  return mindStateWithIntentApplied({ ...state, pendingIntent: { intent, visitTargetId } }, { intent, visitTargetId }, perception, 5000);
}

describe('who takes an intent', () => {
  test('only the wander, the sleep and the copy take an intent', () => {
    const names: BehaviourName[] = ['wander', 'sleep', 'copy', 'visit', 'cursor-play', 'carried', 'dropped', 'stranded'];
    expect(names.filter(behaviourTakesIntents)).toEqual(['wander', 'sleep', 'copy']);
  });

  test('an intent given in any other behaviour is dropped', () => {
    const carried: SpriteMindState = { ...AT_HOME, behaviour: { name: 'carried', startedAtMilliseconds: 0, cameFromHabitatId: null } };
    expect(applied(carried, 'type')).toEqual({ ...carried, pendingIntent: null });
  });

  test('the wave after a pop-in\'s own wave is skipped once', () => {
    const greeted = applied({ ...AT_HOME, greetedOnArrival: true }, 'wave');
    expect([greeted.gesture, greeted.greetedOnArrival]).toEqual([null, false]);
    expect(applied(greeted, 'wave').gesture?.name).toBe('wave');
  });
});

describe('gestures and emotes', () => {
  test('a gesture stops the wander\'s walk', () => {
    const typing = applied(AT_HOME, 'type-busy');
    expect([typing.gesture?.name, typing.gesture?.mood, typing.behaviour]).toEqual(['type', 'busy', { name: 'wander', walkToX: null, restUntilMilliseconds: 0 }]);
  });

  test('a gesture leaves a copy for the wander', () => {
    const copying: SpriteMindState = { ...AT_HOME, livesIn: 'agents', behaviour: { name: 'copy', habitatId: 'agents' } };
    expect(applied(copying, 'merge').behaviour.name).toBe('wander');
  });

  test('an emote shows over a running gesture, and the gesture goes on', () => {
    const happy = applied(applied(AT_HOME, 'review'), 'happy');
    expect([happy.emote?.name, happy.gesture?.name]).toEqual(['happy', 'review']);
  });
});

describe('the idle intents', () => {
  test('wander only wakes a sleeping Flint', () => {
    const sleeping: SpriteMindState = { ...AT_HOME, behaviour: { name: 'sleep' }, sleep: sleepStateFallingAsleep(AT_HOME.sleep, 0) };
    const woken = applied(sleeping, 'wander');
    expect([woken.behaviour.name, woken.sleep.phase, woken.gesture]).toEqual(['wander', 'waking', null]);
  });

  test('wander keeps a stored habitat that has not registered yet; any other intent gives it up', () => {
    expect(applied(AT_HOME, 'wander').mayRestoreStoredHabitat).toBe(true);
    expect(applied(AT_HOME, 'type').mayRestoreStoredHabitat).toBe(false);
    expect(applied(AT_HOME, 'sleep').mayRestoreStoredHabitat).toBe(false);
  });

  test('wander and sleep keep the quiet; any other intent ends it', () => {
    expect(applied(AT_HOME, 'wander').quietSinceMilliseconds).toBe(1000);
    expect(applied(AT_HOME, 'sleep').quietSinceMilliseconds).toBe(1000);
    expect(applied(AT_HOME, 'thinking').quietSinceMilliseconds).toBe(5000);
  });
});

describe('a behaviour that cannot start here', () => {
  test('a visit to no target, to a habitat that is too small, or to where Flint lives changes nothing but is remembered', () => {
    const small = perceptionOf({ habitats: [{ ...CHAT, isRoomy: false }, AGENTS] });
    const inChat: SpriteMindState = { ...AT_HOME, livesIn: 'chat' };
    for (const [state, targetId, perception] of [[AT_HOME, null, perceptionOf()], [AT_HOME, 'chat', small], [inChat, 'chat', perceptionOf()]] as const) {
      const remembered = applied(state, 'visit', targetId, perception);
      expect([remembered.behaviour.name, remembered.livesIn, remembered.lastIntent]).toEqual(['wander', state.livesIn, 'visit']);
    }
  });

  test('a visit to a roomy habitat starts', () => {
    expect(applied(AT_HOME, 'visit', 'chat').behaviour).toMatchObject({ name: 'visit', habitatId: 'chat' });
  });

  test('a copy where nothing is offered to copy changes nothing but is remembered; where something is, it starts', () => {
    const inAgents: SpriteMindState = { ...AT_HOME, livesIn: 'agents' };
    const nothing = applied(inAgents, 'copy');
    expect([nothing.behaviour.name, nothing.lastIntent]).toEqual(['wander', 'copy']);
    const offered = perceptionOf({ habitats: [CHAT, { ...AGENTS, copyTarget: { centreX: 700, intent: 'type' } }] });
    expect(applied(inAgents, 'copy', null, offered).behaviour).toEqual({ name: 'copy', habitatId: 'agents' });
  });
});
