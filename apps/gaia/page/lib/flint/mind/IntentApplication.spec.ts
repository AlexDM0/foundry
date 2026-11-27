/**
 * How an intent changes the mind: which behaviours take an intent and which drop it, how gestures and emotes lay over the rest, what
 * `wander` keeps, which intents end the quiet, how a one-at-a-time behaviour refuses itself, and which intents are given an element.
 */
import { describe, expect, test } from 'bun:test';

import type { SpriteIntent }       from '../SpriteHabitat.ts';
import { INITIAL_MIND_STATE }      from '../SpriteMind.ts';
import { BEHAVIOUR_CATALOG }       from '../behaviours/BehaviourCatalog.ts';
import type { CarriedState }       from '../behaviours/carried/CarriedBehaviour.ts';
import type { CopyState }          from '../behaviours/copy/CopyBehaviour.ts';
import type { WanderState }        from '../behaviours/wander/WanderBehaviour.ts';
import { sleepStateFallingAsleep } from '../sleep/SleepSequence.ts';
import {
  AGENTS,
  CHAT,
  createMindRun,
  perceptionOf
} from '../testing/MindRun.ts';
import {
  behaviourTakesIntents,
  elementUseOf,
  intentIsRefused,
  mindStateWithIntentApplied
} from './IntentApplication.ts';
import type { SpriteMindState } from './MindState.ts';

const WALKING_LEFT: WanderState = { name: 'wander', walkToX: 950, restUntilMilliseconds: 0 };

/** Placed in the middle of the home at 0 ms, walking to the left, quiet since 1000 ms. */
const AT_HOME: SpriteMindState = {
  ...INITIAL_MIND_STATE,
  isPlaced:               true,
  motion:                 { ...INITIAL_MIND_STATE.motion, positionX: 1000, floorY: 700 },
  behaviour:              WALKING_LEFT,
  quietSinceMilliseconds: 1000,
};

function applied(state: SpriteMindState, intent: SpriteIntent, visitTargetId: string | null = null, perception = perceptionOf()): SpriteMindState {
  return mindStateWithIntentApplied({ ...state, pendingIntent: { intent, visitTargetId } }, { intent, visitTargetId }, perception, 5000);
}

describe('a gesture the ended behaviour aimed', () => {
  const grabbing = {
    intent: 'grab', startedAtMilliseconds: 4900, target: { x: 40, y: -10 }, verdict: null
  } as const;

  test('an intent that ends a behaviour which aims its own gestures ends the gesture it aimed', () => {
    const owners = BEHAVIOUR_CATALOG.filter((definition) => definition.aimsItsOwnGestures && definition.intentWhileRunning === 'ends-it');
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) {
      const ended = applied({ ...AT_HOME, behaviour: { name: owner.name }, gesture: grabbing }, 'happy');
      expect([ended.behaviour.name, ended.gesture, ended.emote?.name]).toEqual(['wander', null, 'happy']);
    }
  });

  test('an intent that ends a behaviour which does not aim its gestures keeps the running gesture', () => {
    const ended = applied({ ...AT_HOME, behaviour: { name: 'lay-bar-along' }, gesture: grabbing }, 'happy');
    expect([ended.behaviour.name, ended.gesture]).toEqual(['wander', grabbing]);
  });
});

describe('who takes an intent', () => {
  test('only the wander, the sleep, the copy, the chase and the lay take an intent', () => {
    const names = BEHAVIOUR_CATALOG.map((definition) => definition.name);
    expect(names.filter(behaviourTakesIntents)).toEqual(['wander', 'copy', 'sleep', 'chase-bug', 'lay-bar-along']);
  });

  test('an intent given in any other behaviour is dropped', () => {
    const carriedState: CarriedState = { name: 'carried', startedAtMilliseconds: 0, cameFromHabitatId: null };
    const carried: SpriteMindState = { ...AT_HOME, behaviour: carriedState };
    expect(applied(carried, 'type')).toEqual({ ...carried, pendingIntent: null });
  });

  test('the wave after a pop-in\'s own wave is skipped once', () => {
    const greeted = applied({ ...AT_HOME, arrivalGreeting: 'wave' }, 'wave');
    expect([greeted.gesture, greeted.arrivalGreeting]).toEqual([null, null]);
    expect(applied(greeted, 'wave').gesture?.intent).toBe('wave');
  });
});

describe('gestures and emotes', () => {
  test('a gesture stops the wander\'s walk on the frame it is given', () => {
    const run = createMindRun(AT_HOME);
    run.give('type-busy');
    const typing = run.frame();
    expect([typing.gesture?.intent, (typing.behaviour as WanderState).walkToX, typing.motion.walkDirection]).toEqual(['type-busy', null, 0]);
  });

  test('a gesture leaves a copy for the wander', () => {
    const copyState: CopyState = { name: 'copy', habitatId: 'agents' };
    const copying: SpriteMindState = { ...AT_HOME, livesIn: 'agents', behaviour: copyState };
    expect(applied(copying, 'merge').behaviour.name).toBe('wander');
  });

  test('an emote shows over a running gesture, and the gesture goes on', () => {
    const happy = applied(applied(AT_HOME, 'review'), 'happy');
    expect([happy.emote?.name, happy.gesture?.intent]).toEqual(['happy', 'review']);
  });
});

describe('the idle intents', () => {
  test('wander only wakes a sleeping Flint; the sleep hands Flint to the rest on its own frame', () => {
    const sleeping: SpriteMindState = { ...AT_HOME, behaviour: { name: 'sleep' }, sleep: sleepStateFallingAsleep(AT_HOME.sleep, 0) };
    const woken = applied(sleeping, 'wander');
    expect([woken.behaviour.name, woken.sleep.phase, woken.gesture]).toEqual(['sleep', 'waking', null]);
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
    expect(applied(inAgents, 'copy', null, offered).behaviour as CopyState).toEqual({ name: 'copy', habitatId: 'agents' });
  });
});

describe('the behaviours a host starts with an element', () => {
  test('a chase refuses a second chase, while it runs and while its intent waits; the lay takes a new lay', () => {
    const chasing = { ...AT_HOME, behaviour: { name: 'chase-bug' } };
    expect(intentIsRefused(chasing, 'chase-bug')).toBe(true);
    expect(intentIsRefused({ ...AT_HOME, pendingIntent: { intent: 'chase-bug', visitTargetId: null } }, 'chase-bug')).toBe(true);
    expect(intentIsRefused(AT_HOME, 'chase-bug')).toBe(false);
    expect(intentIsRefused({ ...AT_HOME, behaviour: { name: 'lay-bar-along' } }, 'lay-bar-along')).toBe(false);
  });

  test('a grab may take an element, the chase may, the lay must, and every other intent takes none', () => {
    expect(['grab', 'chase-bug', 'lay-bar-along', 'type', 'happy', 'visit'].map(elementUseOf)).toEqual(['optional', 'optional', 'required', 'none', 'none', 'none']);
  });

  test('any intent ends a chase, which goes to the rest before the intent is carried out', () => {
    const chasing = { ...AT_HOME, behaviour: { name: 'chase-bug' } };
    expect(applied(chasing, 'happy').behaviour.name).toBe('wander');
    expect(applied(chasing, 'type').behaviour.name).toBe('wander');
    expect(applied(chasing, 'chase-bug').behaviour.name).toBe('chase-bug');
  });
});
