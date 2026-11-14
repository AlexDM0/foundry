/**
 * The reflexes that run before any intent. What matters: on its first floor Flint stands in the middle, and a stored habitat on the page
 * takes Flint in while it may still move there; any cue wakes Flint and ends the quiet, but only the cues of the habitat it lives in wait
 * for the director, up to the limit of recent cues; a habitat that leaves the page or becomes too small sends Flint home to rest, while
 * sleep, which stands at home, a visit, a drag, a landing or a stranding goes on; a drag carries Flint and its drop lands or strands it;
 * and a click starts cursor play only where a click interrupts.
 */
import { describe, expect, test } from 'bun:test';

import { INITIAL_MIND_STATE }      from '../SpriteMind.ts';
import { DIRECTOR }                from '../constants/Mind.ts';
import { sleepStateFallingAsleep } from '../sleep/SleepSequence.ts';
import {
  AGENTS,
  CHAT,
  CHAT_BOX,
  HOME_BOX,
  perceptionOf
} from '../testing/MindRun.ts';
import type { SpriteMindState } from './MindState.ts';
import {
  mindStateAfterCues,
  mindStateAfterHappenings,
  mindStateKeepingItsPlace,
  mindStatePlaced
} from './Reflexes.ts';

const AT_HOME: SpriteMindState = {
  ...INITIAL_MIND_STATE,
  isPlaced: true,
  motion:   { ...INITIAL_MIND_STATE.motion, positionX: 1000, floorY: HOME_BOX.floorY },
};

const IN_CHAT: SpriteMindState = {
  ...AT_HOME, livesIn: 'chat', mayRestoreStoredHabitat: false, motion: { ...AT_HOME.motion, positionX: 400, floorY: CHAT_BOX.floorY },
};

describe('placing', () => {
  test('on its first floor Flint stands in the middle of it', () => {
    expect(mindStatePlaced(INITIAL_MIND_STATE, perceptionOf()).motion).toMatchObject({ positionX: 1000, floorY: HOME_BOX.floorY });
    expect(mindStatePlaced(INITIAL_MIND_STATE, perceptionOf({ home: null })).isPlaced).toBe(false);
  });

  test('a stored habitat on the page takes Flint in, in the middle of its floor, once', () => {
    const restored = mindStatePlaced(AT_HOME, perceptionOf({ storedHabitatId: 'chat' }));
    expect([restored.livesIn, restored.motion.positionX, restored.motion.floorY, restored.mayRestoreStoredHabitat]).toEqual(['chat', 400, CHAT_BOX.floorY, false]);
  });

  test('a Flint that may no longer move there, or lives elsewhere, stays where it is', () => {
    const moved = { ...AT_HOME, mayRestoreStoredHabitat: false };
    expect(mindStatePlaced(moved, perceptionOf({ storedHabitatId: 'chat' }))).toBe(moved);
    const inAgents = { ...AT_HOME, livesIn: 'agents' };
    expect(mindStatePlaced(inAgents, perceptionOf({ storedHabitatId: 'chat' }))).toBe(inAgents);
  });
});

describe('cues', () => {
  test('no cue changes nothing', () => {
    expect(mindStateAfterCues(IN_CHAT, perceptionOf(), 5000)).toBe(IN_CHAT);
  });

  test('a cue of another habitat wakes Flint and ends the quiet, and does not wait for the director', () => {
    const sleeping = { ...IN_CHAT, behaviour: { name: 'sleep' } as const, sleep: sleepStateFallingAsleep(IN_CHAT.sleep, 0) };
    const heard = mindStateAfterCues(sleeping, perceptionOf({ cues: [{ habitatId: 'agents', cue: 'agent-works' }] }), 5000);
    expect([heard.behaviour.name, heard.sleep.phase, heard.quietSinceMilliseconds, heard.directorInbox]).toEqual(['sleep', 'waking', 5000, []]);
  });

  test('the cues of the habitat Flint lives in wait for the director, and the recent cues keep only the newest', () => {
    const cues = Array.from({ length: DIRECTOR.RECENT_CUE_LIMIT + 2 }, (_unused, i) => ({ habitatId: 'chat', cue: `cue-${i}` }));
    const heard = mindStateAfterCues(IN_CHAT, perceptionOf({ cues }), 5000);
    expect(heard.directorInbox).toHaveLength(DIRECTOR.RECENT_CUE_LIMIT + 2);
    expect(heard.recentCues).toEqual(cues.slice(2).map((cue) => cue.cue));
  });
});

describe('keeping its place', () => {
  test('a habitat that leaves the page, or becomes too small, sends Flint home and clears what waited', () => {
    const working = {
      ...IN_CHAT,
      directorInbox: ['agent-is-done'],
      gesture:       {
        intent: 'type', startedAtMilliseconds: 0, target: null, verdict: null
      } as const
    };
    for (const habitats of [[AGENTS], [{ ...CHAT, isRoomy: false }, AGENTS]]) {
      const home = mindStateKeepingItsPlace(working, perceptionOf({ habitats }), 5000);
      expect([home.livesIn, home.behaviour.name, home.gesture, home.directorInbox, home.motion.floorY]).toEqual([null, 'wander', null, [], HOME_BOX.floorY]);
    }
  });

  test('a sleeping Flint, which stands at home, sleeps on', () => {
    const sleeping = { ...IN_CHAT, behaviour: { name: 'sleep' } as const };
    expect(mindStateKeepingItsPlace(sleeping, perceptionOf({ habitats: [AGENTS] }), 5000).behaviour.name).toBe('sleep');
  });

  test('at home, and during a visit, a drag, a landing or a stranding, Flint stays where it is', () => {
    expect(mindStateKeepingItsPlace(AT_HOME, perceptionOf({ habitats: [] }), 5000)).toBe(AT_HOME);
    const carried = { ...IN_CHAT, behaviour: { name: 'carried', startedAtMilliseconds: 0, cameFromHabitatId: 'chat' } as const };
    expect(mindStateKeepingItsPlace(carried, perceptionOf({ habitats: [] }), 5000)).toBe(carried);
  });
});

describe('the pointer', () => {
  test('a drag carries Flint and ends the quiet; a second drag start changes nothing', () => {
    const carried = mindStateAfterHappenings(IN_CHAT, perceptionOf({ happenings: [{ kind: 'drag-started' }] }), 5000);
    expect([carried.behaviour.name, carried.quietSinceMilliseconds]).toEqual(['carried', 5000]);
    expect(mindStateAfterHappenings(carried, perceptionOf({ happenings: [{ kind: 'drag-started' }] }), 6000)).toBe(carried);
  });

  test('a drop on a roomy habitat lands there; a drop on none strands Flint; a drop without a drag changes nothing', () => {
    const carried = mindStateAfterHappenings(IN_CHAT, perceptionOf({ happenings: [{ kind: 'drag-started' }] }), 5000);
    const onAgents = mindStateAfterHappenings(carried, perceptionOf({ happenings: [{ kind: 'dropped', habitatId: 'agents' }] }), 6000);
    const onNothing = mindStateAfterHappenings(carried, perceptionOf({ happenings: [{ kind: 'dropped', habitatId: null }] }), 6000);
    expect([onAgents.behaviour.name, onNothing.behaviour.name]).toEqual(['landing', 'stranded']);
    expect(mindStateAfterHappenings(IN_CHAT, perceptionOf({ happenings: [{ kind: 'dropped', habitatId: 'agents' }] }), 6000)).toBe(IN_CHAT);
  });

  test('a click starts cursor play with a surprised emote where a click interrupts, and is ignored during a visit', () => {
    const playing = mindStateAfterHappenings(IN_CHAT, perceptionOf({ happenings: [{ kind: 'clicked' }] }), 5000);
    expect([playing.behaviour.name, playing.emote?.name]).toEqual(['cursor-play', 'surprised']);
    const onVisit = {
      ...IN_CHAT,
      behaviour: {
        name: 'visit', habitatId: 'agents', edgeSide: 1, edgeX: 850, step: 'go', stepStartedAtMilliseconds: 0, offsetUnits: 40
      } as const
    };
    expect(mindStateAfterHappenings(onVisit, perceptionOf({ happenings: [{ kind: 'clicked' }] }), 5000)).toBe(onVisit);
  });
});
