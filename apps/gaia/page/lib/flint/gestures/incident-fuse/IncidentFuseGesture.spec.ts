/**
 * Incident fuse. What matters: the 7.6-second loop burns the fuse in a straight line to
 * 6000 with a pulsing flame, while Flint watches it with no hands, its eyes going from -3 to 0, and looks at the user for 400 ms every 2
 * seconds; from 4200 (a burn of 0.7) its eyes dart between 5 and 7, it shivers and the sweat beads show; at 6000 the flame goes out in
 * smoke; the stamp of Make a ticket rises, falls onto the envelope's seal, seals it with a jolt and lifts away; the props fade from 7200,
 * and fade in again over the first 300 ms of the next cycle, so they never show at once;
 * reduced motion holds the fuse half burned; the part does not depend on the facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }           from '../../SpriteGeometry.ts';
import type { GestureInput }     from '../GestureDefinition.ts';
import { INCIDENT_FUSE_GESTURE } from './IncidentFuseGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, facing: Facing = 1) => INCIDENT_FUSE_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));
const fuseAt = (elapsedMilliseconds: number) => partAt(elapsedMilliseconds).props?.incidentFuse;

test('incident fuse is one loop that reduced motion holds at 3000', () => {
  expect(INCIDENT_FUSE_GESTURE.intents['incident-fuse']).toMatchObject({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 3000 });
});

describe('the burn', () => {
  test('0 to 6000: the fuse burns in a straight line under a pulsing flame; Flint watches it with no hands', () => {
    const part = partAt(1500);
    expect(fuseAt(1500)).toMatchObject({
      shown: 1, cycleOpacity: 1, burn: 0.25, smokeProgress: 0, sealShown: false, offsetY: 0,
    });
    expect(fuseAt(1500)?.flameScale).toBeCloseTo(1 + (0.2 * Math.sin(1500 / 40)));
    expect(part.nearHand).toBeNull();
    expect(part.farHand).toBeNull();
    expect(part.eyes).toEqual({ height: 6, shift: 6, lift: -2.25 });
    expect(part.emoteMark).toBeUndefined();
    expect(part.body).toBeUndefined();
  });

  test('every 2 seconds Flint looks at the user for 400 ms', () => {
    expect([1999, 2000, 2399, 2400].map((moment) => partAt(moment).eyes?.shift)).toEqual([6, 1, 1, 6]);
  });

  test('from 4200, a burn of 0.7, the eyes dart between 5 and 7 each 170 ms, Flint shivers, and the sweat beads show', () => {
    expect(partAt(4199).emoteMark).toBeUndefined();
    expect([4200, 4370, 4540].map((moment) => partAt(moment).eyes?.shift)).toEqual([5, 7, 5]);
    expect(partAt(5000).body?.addedShake).toBeCloseTo(0.6 * Math.sin(5000 / 22));
    const beads = partAt(4700).emoteMark;
    expect(beads?.name).toBe('sweat-beads');
    expect(beads?.opacity).toBe(1);
    expect(beads?.name === 'sweat-beads' ? beads.details.beads.filter((bead) => bead.opacity > 0) : []).toHaveLength(3);
    expect(partAt(5920).emoteMark?.opacity).toBeCloseTo(0.5);
  });
});

describe('the default move', () => {
  test('6000: the flame goes out in three puffs of smoke that drift apart and fade in 300 ms', () => {
    expect(fuseAt(6000)).toMatchObject({ burn: 1, flameScale: 0 });
    expect(fuseAt(6150)?.smokeProgress).toBeCloseTo(0.5);
    expect(partAt(6150).emoteMark).toBeUndefined();
  });

  test('the stamp rises above the seal at (37, -17), falls onto it, seals it with a jolt and lifts 10 away', () => {
    expect(partAt(6100).nearHand).toEqual({
      cornerCount: 4, centreX: 37, centreY: -54, radius: 6, turnDegrees: 45, placement: 'eased',
    });
    expect(partAt(6260).nearHand?.centreY).toBeCloseTo(-35.5);
    expect(partAt(6320).nearHand).toMatchObject({ centreY: -17, placement: 'exact-position' });
    expect(fuseAt(6320)).toMatchObject({ sealShown: true, offsetY: 1.5 });
    expect(fuseAt(6450)?.offsetY).toBe(0);
    expect(partAt(6525).nearHand?.centreY).toBeCloseTo(-22);
    expect(partAt(6700).nearHand).toBeNull();
    expect(partAt(6400).eyes).toEqual({ height: 6, shift: 6 });
  });

  test('7200 to 7600: the props fade out', () => {
    expect(fuseAt(7400)?.cycleOpacity).toBeCloseTo(0.5);
    expect(fuseAt(7400)?.sealShown).toBe(true);
  });

  test('the props fade in over the first 300 ms of each cycle', () => {
    expect([fuseAt(7600)?.cycleOpacity, fuseAt(7750)?.cycleOpacity, fuseAt(7900)?.cycleOpacity]).toEqual([0, 0.5, 1]);
  });
});

test('the loop repeats every 7.6 seconds', () => {
  for (const moment of [1500, 4600, 6260, 7400]) expect(partAt(7600 + moment)).toEqual(partAt(moment));
});

test('reduced motion holds the fuse half burned, Flint watching the flame', () => {
  const part = partAt(INCIDENT_FUSE_GESTURE.intents['incident-fuse'].stillMomentMilliseconds);
  expect(part.props?.incidentFuse?.burn).toBe(0.5);
  expect(part.eyes).toEqual({ height: 6, shift: 6, lift: -1.5 });
});

test('facing left gives the same part', () => {
  for (const moment of [1500, 4600, 6320]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});
