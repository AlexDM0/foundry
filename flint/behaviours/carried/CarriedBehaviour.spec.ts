/**
 * Carried, and the drop. What matters: Flint hangs with its top tip just below the pointer, with no hover; a drop on a roomy habitat
 * falls to its bottom edge, lands with the squash, looks around, and then lives there and hears `arrived`; a drop on no habitat, or on
 * a small one, shows the Doubt emote where Flint was let go and then goes back around the corner of the habitat it came from, or home.
 */
import { describe, expect, test } from 'bun:test';

import { targetPoseOfMind } from '../../SpriteMind.ts';
import {
  AGENTS,
  CHAT,
  createMindRun,
  perceptionOf
} from '../../testing/MindRun.ts';
import { JumpMotionUtil } from '../../utils/JumpMotionUtil.ts';

function carriedRun(): ReturnType<typeof createMindRun> {
  const run = createMindRun(undefined, perceptionOf({ pointer: { x: 300, y: 250, hasMoved: true } }));
  run.frame({ storedHabitatId: 'agents' });
  run.frame({ happenings: [{ kind: 'drag-started' }] });
  return run;
}

describe('carried', () => {
  test('Flint hangs with its top tip just below the pointer, with no hover, and comes from where it lived', () => {
    const run = carriedRun();
    const pose = targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false);
    expect([pose.body.positionX, pose.body.floorY - 50, pose.body.hover]).toEqual([300, 252, 0]);
    expect(pose.exactFields).toContain('hover');
    expect(run.state().behaviour).toMatchObject({ name: 'carried', cameFromHabitatId: 'agents' });
  });
});

describe('a drop on a roomy habitat', () => {
  test('Flint falls to its bottom edge, lands with the squash, looks around, and then lives there and hears arrived', () => {
    const run = carriedRun();
    run.frame({ happenings: [{ kind: 'dropped', habitatId: 'chat' }] });
    expect([run.state().behaviour.name, run.state().motion.floorY, JumpMotionUtil.isAirborne(run.state().motion.jump)]).toEqual(['landing', 500, true]);
    run.runUntil((state) => !JumpMotionUtil.isAirborne(state.motion.jump));
    expect(run.state().motion.jump.landingRemainingMilliseconds).toBeGreaterThan(0);
    run.frame();
    const glances = [0, 400, 400].map((milliseconds) => {
      run.runFor(milliseconds);
      return targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).eyes.shift;
    });
    expect(glances).toEqual([-2, 6, 2]);
    const arrived = run.runUntil((state) => state.behaviour.name !== 'landing');
    expect([arrived.livesIn, arrived.directorInbox, arrived.arrivalGreeting]).toEqual(['chat', ['arrived'], null]);
  });

  test('under reduced motion Flint is on the floor at once', () => {
    const run = carriedRun();
    run.frame({ happenings: [{ kind: 'dropped', habitatId: 'chat' }], reducedMotion: true });
    expect(JumpMotionUtil.isAirborne(run.state().motion.jump)).toBe(false);
  });
});

describe('a drop on no habitat', () => {
  test('Flint shows the Doubt emote where it was let go, then goes back around the corner of the habitat it came from', () => {
    const run = carriedRun();
    run.frame({ happenings: [{ kind: 'dropped', habitatId: null }] });
    expect([run.state().behaviour.name, run.state().emote?.name, run.state().motion.positionX]).toEqual(['stranded', 'doubt', 300]);
    run.runUntil((state) => state.behaviour.name !== 'stranded');
    expect(run.state().behaviour).toMatchObject({ name: 'visit', habitatId: 'agents', step: 'wait' });
  });

  test('a drop on a small habitat strands Flint too, and with no habitat to go back to it goes home', () => {
    const run = createMindRun(undefined, perceptionOf({ habitats: [{ ...CHAT, isRoomy: false }, AGENTS], pointer: { x: 300, y: 250, hasMoved: true } }));
    run.frame();
    run.frame({ happenings: [{ kind: 'drag-started' }] });
    run.frame({ happenings: [{ kind: 'dropped', habitatId: 'chat' }] });
    expect(run.state().behaviour.name).toBe('stranded');
    run.runUntil((state) => state.behaviour.name !== 'stranded');
    expect([run.state().behaviour.name, run.state().livesIn, run.state().motion.floorY]).toEqual(['wander', null, 700]);
  });
});
