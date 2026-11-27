/**
 * The behaviour catalog against what the mind reads from it: names and intents are unique and clash with no gesture or emote, each role
 * belongs to one behaviour, every behaviour can be started, and the mind finds a behaviour by name, intent and role.
 */
import { expect, test } from 'bun:test';

import { EMOTE_NAMES }     from '../emotes/EmoteCatalog.ts';
import { GESTURE_INTENTS } from '../gestures/GestureCatalog.ts';
import {
  BEHAVIOUR_CATALOG,
  BEHAVIOUR_INTENTS,
  behaviourDefinitionOf,
  behaviourOfIntent,
  behaviourOfRole,
  restingBehaviourAt
} from './BehaviourCatalog.ts';
import type { WanderState } from './wander/WanderBehaviour.ts';

test('no two behaviours share a name or an intent, and no behaviour intent is a gesture\'s or an emote\'s', () => {
  expect(new Set(BEHAVIOUR_CATALOG.map((definition) => definition.name)).size).toBe(BEHAVIOUR_CATALOG.length);
  expect(new Set(BEHAVIOUR_INTENTS).size).toBe(BEHAVIOUR_INTENTS.length);
  const otherIntents: readonly string[] = [...GESTURE_INTENTS, ...EMOTE_NAMES];
  expect(BEHAVIOUR_INTENTS.filter((intent) => otherIntents.includes(intent))).toEqual([]);
});

test('each role is one behaviour\'s, and the rest gives its state at rest', () => {
  for (const role of ['rest', 'drag', 'click'] as const) expect(BEHAVIOUR_CATALOG.filter((definition) => definition.role === role)).toHaveLength(1);
  expect([behaviourOfRole('rest').name, behaviourOfRole('drag').name, behaviourOfRole('click').name]).toEqual(['wander', 'carried', 'cursor-play']);
  expect(restingBehaviourAt(1000) as WanderState).toEqual({ name: 'wander', walkToX: null, restUntilMilliseconds: 3500 });
  expect(BEHAVIOUR_CATALOG.filter((definition) => definition.atRest !== null).map((definition) => definition.name)).toEqual(['wander']);
});

test('every behaviour with an intent or a role can be started; the others are started by another behaviour', () => {
  const startedElsewhere = BEHAVIOUR_CATALOG.filter((definition) => definition.started === null).map((definition) => definition.name);
  expect(startedElsewhere).toEqual(['landing', 'stranded']);
  expect(BEHAVIOUR_CATALOG.filter((definition) => definition.started === null && (definition.intents.length > 0 || definition.role !== null))).toEqual([]);
});

test('the behaviours of the first build keep their intents, and the two that take an element come after them', () => {
  expect([...BEHAVIOUR_INTENTS]).toEqual(['wander', 'visit', 'copy', 'sleep', 'chase-bug', 'lay-bar-along']);
  expect(BEHAVIOUR_CATALOG.filter((definition) => definition.element !== 'none').map((definition) => [definition.name, definition.element])).toEqual([
    ['chase-bug', 'optional'],
    ['lay-bar-along', 'required'],
  ]);
});

test('the mind finds a behaviour by its name, its intent and its role, and refuses a name the catalog lacks', () => {
  expect(behaviourDefinitionOf('visit').name).toBe('visit');
  expect(behaviourOfIntent('chase-bug')?.name).toBe('chase-bug');
  expect(behaviourOfIntent('type')).toBeNull();
  expect(() => behaviourDefinitionOf('dance')).toThrow(RangeError);
});
