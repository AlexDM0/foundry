/**
 * Lay the bar along a row, `08-more-behaviours.md`, on the pure mind frame by frame. What matters: Flint walks along its floor to below
 * the bar's left end at the walk speed; its floor rises to the bar's bottom edge at the body rate, with no jump; it walks to the right end
 * with the hand and eyes of `lay-bar` and without its row line and bar, at the bar's width over a time of 110 units a second clamped
 * between 1500 and 6000 ms; the shimmer is a page shape from the bar's left end to 18 behind Flint, its four segments with the opacity of
 * their age and the 6 nearest Flint in the body colour; at the right end Flint is happy, the shimmer fades out in 400 ms, the floor goes
 * back at the body rate and Flint rests. The bar is clamped to the habitat's box on all sides, so its height is never negative; a bar
 * narrower than 40 is only risen to, and a bar with no part inside the box is not laid. A drag, a new intent, or a habitat or element that
 * is gone ends it, and Flint, up on the bar, then comes down at the body rate, not in one frame; a second lay started up there goes down
 * the same way. Under reduced motion Flint is placed at the right end on the bottom edge, happy, with no shimmer. With no element it does
 * not start.
 */
import { describe, expect, test } from 'bun:test';

import { targetPoseOfMind }                                from '../../SpriteMind.ts';
import { EASING_RATES_PER_SECOND }                         from '../../constants/Easing.ts';
import type { Shape }                                      from '../../drawing/Shape.ts';
import type { PerceivedTarget, PlaceBox }                  from '../../mind/Perception.ts';
import type { MindRun }                                    from '../../testing/MindRun.ts';
import { createMindRun, FRAME_MILLISECONDS, perceptionOf } from '../../testing/MindRun.ts';
import { AnimationCurveUtil }                              from '../../utils/AnimationCurveUtil.ts';
import type { LayBarAlongState }                           from './LayBarAlongBehaviour.ts';
import { layMillisecondsOf }                               from './LayBarAlongBehaviour.ts';

/** A wide home: Flint is placed in its middle, at 600, on its floor at 700. */
const WIDE_HOME: PlaceBox = Object.freeze({
  leftX: 100, rightX: 1100, topY: 400, floorY: 700,
});
const BAR_BOX: PlaceBox = Object.freeze({
  leftX: 300, rightX: 640, topY: 640, floorY: 650,
});
const BAR: PerceivedTarget = Object.freeze({ kind: 'on-the-page', box: BAR_BOX });

function layOf(run: MindRun): LayBarAlongState {
  const { behaviour } = run.state();
  if (behaviour.name !== 'lay-bar-along') throw new Error(`Flint ${behaviour.name}s, it does not lay a bar`);
  return behaviour as LayBarAlongState;
}

function laying(target: PerceivedTarget = BAR, reducedMotion = false): MindRun {
  const run = createMindRun(undefined, perceptionOf({ home: WIDE_HOME, target, reducedMotion }));
  run.frame();
  run.give('lay-bar-along');
  run.frame();
  return run;
}

function untilStep(run: MindRun, step: LayBarAlongState['step']): MindRun {
  run.runUntil(() => layOf(run).step === step);
  return run;
}

function pageShapesOf(run: MindRun): readonly Shape[] {
  return targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).page.shapes;
}

describe('the go and the rise', () => {
  test('Flint walks along its floor to below the left end of the bar at the walk speed', () => {
    const run = laying();
    const before = run.state().motion.positionX;
    expect([run.frame().motion.walkDirection, run.state().motion.floorY]).toEqual([-1, 700]);
    expect(before - run.state().motion.positionX).toBeCloseTo(220 * FRAME_MILLISECONDS / 1000, 10);
    untilStep(run, 'rise');
    expect([run.state().motion.positionX, run.state().motion.walkDirection]).toEqual([300, 0]);
  });

  test('the floor rises to the bar\'s bottom edge at the body rate, with no jump', () => {
    const run = untilStep(laying(), 'rise');
    const before = run.state().motion.floorY;
    const after = run.frame().motion.floorY;
    expect(after - before).toBeCloseTo((650 - before) * AnimationCurveUtil.easingFractionOf(EASING_RATES_PER_SECOND.BODY, FRAME_MILLISECONDS), 10);
    expect(run.state().motion.jump.height).toBe(0);
    untilStep(run, 'lay');
    expect(run.state().motion.floorY).toBe(650);
  });
});

describe('the lay', () => {
  test('the lay takes the width over 110 units a second, clamped between 1500 and 6000 ms', () => {
    expect([40, 165, 340, 660, 1000].map(layMillisecondsOf)).toEqual([1500, 1500, 340 / 110 * 1000, 6000, 6000]);
  });

  test('Flint walks from the left end to the right end in the lay time, facing right, on the bar\'s bottom edge', () => {
    const run = untilStep(laying(), 'lay');
    const startedAt = run.elapsedMilliseconds();
    expect(layOf(run).layMilliseconds).toBeCloseTo(340 / 110 * 1000, 10);
    run.runFor(1000);
    const progress = (run.elapsedMilliseconds() - startedAt) / layOf(run).layMilliseconds;
    expect(run.state().motion.positionX).toBeCloseTo(300 + (340 * progress), 5);
    expect([run.state().motion.facing, run.state().motion.walkDirection, run.state().motion.floorY]).toEqual([1, 1, 650]);
    untilStep(run, 'end');
    expect(run.elapsedMilliseconds() - startedAt).toBeGreaterThanOrEqual(layOf(run).layMilliseconds);
    expect(run.state().motion.positionX).toBe(640);
  });

  test('Flint shows the hand and the eyes of lay-bar, without its row line and its bar', () => {
    const run = untilStep(laying(), 'lay');
    run.runFor(200);
    const pose = targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false);
    expect([pose.farHand?.cornerCount, pose.farHand?.centreX, pose.eyes.height, pose.eyes.shift]).toEqual([4, -21, 6, 6]);
    expect(pose.props.layBar.shown).toBe(0);
  });

  test('the shimmer lies from the bar\'s left end to 18 behind Flint, the 6 nearest Flint in the body colour at 70%', () => {
    const run = untilStep(laying(), 'lay');
    run.runFor(400);
    const shapes = pageShapesOf(run);
    const head = shapes.find((shape) => shape.key === 'head');
    const flintX = run.state().motion.positionX;
    expect(shapes.map((shape) => shape.key)).toEqual(['segment-0', 'segment-1', 'segment-2', 'segment-3', 'head']);
    expect(head).toMatchObject({ kind: 'path', fill: 'body' });
    expect(head?.kind === 'path' ? head.pathData : '').toContain(`H${(flintX - 18 - 3).toFixed(2).replace(/\.?0+$/, '')}`);
    expect(shapes.slice(0, 4).every((shape) => shape.fill === 'emberLight')).toBe(true);
  });

  test('each segment has the opacity of its age: 50% when fresh, none 800 ms after Flint passed it', () => {
    const run = untilStep(laying(), 'lay');
    run.runFor(1600);
    const opacities = pageShapesOf(run).map((shape) => shape.opacity ?? 1);
    const segments = opacities.slice(0, 4);
    expect(segments.every((opacity, i) => i === 0 || opacity > (segments[i - 1] ?? 0))).toBe(true);
    expect(Math.max(...segments)).toBeLessThan(0.5);
    expect(Math.min(...segments)).toBeGreaterThanOrEqual(0);
    expect(opacities.at(-1)).toBeLessThan(0.7);
  });

  test('a shimmer is not drawn before Flint is 18 past the left end', () => {
    const run = untilStep(laying(), 'lay');
    expect(pageShapesOf(run)).toEqual([]);
  });
});

describe('the end', () => {
  test('at the right end Flint is happy, the shimmer fades out in 400 ms, the floor goes back at the body rate, and Flint rests', () => {
    const run = untilStep(untilStep(laying(), 'lay'), 'end');
    expect([run.state().emote?.name, run.state().gesture]).toEqual(['happy', null]);
    const fresh = pageShapesOf(run).map((shape) => shape.opacity ?? 1);
    run.runFor(200);
    const fading = pageShapesOf(run).map((shape) => shape.opacity ?? 1);
    fading.forEach((opacity, i) => expect(opacity).toBeCloseTo((fresh[i] ?? 0) * (1 - ((200 + FRAME_MILLISECONDS) / 400)), 1));
    expect(run.state().motion.floorY).toBeGreaterThan(650);
    run.runFor(200);
    expect(pageShapesOf(run)).toEqual([]);
    run.runUntil((state) => state.behaviour.name !== 'lay-bar-along');
    expect([run.state().behaviour.name, run.state().motion.floorY]).toEqual(['wander', 700]);
  });

  test('a bar narrower than 40 is not walked: Flint goes below its middle, rises, is happy, and comes back down', () => {
    const run = laying({ kind: 'on-the-page', box: { ...BAR_BOX, rightX: 339 } });
    untilStep(run, 'rise');
    expect(run.state().motion.positionX).toBe(319.5);
    untilStep(run, 'end');
    expect([run.state().motion.floorY, run.state().emote?.name, layOf(run).leftShimmer, pageShapesOf(run)]).toEqual([650, 'happy', null, []]);
  });

  test('the part of the bar outside the habitat\'s box is not walked: both ends are clamped to it', () => {
    const run = laying({ kind: 'on-the-page', box: { ...BAR_BOX, leftX: 20, rightX: 1300 } });
    expect([layOf(run).bar.leftX, layOf(run).bar.rightX]).toEqual([100, 1100]);
  });

  test('a bar that reaches above the habitat\'s box is clamped at its top, so its height is never negative', () => {
    const run = laying({ kind: 'on-the-page', box: { ...BAR_BOX, topY: 380, floorY: 420 } });
    expect([layOf(run).bar.topY, layOf(run).bar.bottomY]).toEqual([400, 420]);
  });

  test('a bar wholly beside the habitat\'s box, or wholly below its floor, is not laid', () => {
    expect(laying({ kind: 'on-the-page', box: { ...BAR_BOX, leftX: 1200, rightX: 1300 } }).state().behaviour.name).toBe('wander');
    expect(laying({ kind: 'on-the-page', box: { ...BAR_BOX, topY: 720, floorY: 730 } }).state().behaviour.name).toBe('wander');
    expect(laying({ kind: 'on-the-page', box: { ...BAR_BOX, topY: 360, floorY: 400 } }).state().behaviour.name).toBe('wander');
  });

  test('a bar that leaves the habitat\'s box while it is laid ends the lay, and the shimmer fades out', () => {
    const run = untilStep(laying(), 'lay');
    run.runFor(600);
    run.perceive({ target: { kind: 'on-the-page', box: { ...BAR_BOX, topY: 720, floorY: 730 } } });
    expect(run.frame().behaviour.name).toBe('wander');
    expect(targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).page.shapes).toEqual([]);
  });
});

describe('what ends it', () => {
  test('a drag ends it, and the shimmer fades out in 400 ms', () => {
    const run = untilStep(laying(), 'lay');
    run.runFor(600);
    expect(targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).page.fadeOutMilliseconds).toBe(400);
    run.frame({ happenings: [{ kind: 'drag-started' }], pointer: { x: 400, y: 500, hasMoved: true } });
    expect(run.state().behaviour.name).toBe('carried');
  });

  test('a new intent ends it and is carried out', () => {
    const run = untilStep(laying(), 'lay');
    run.give('doubt');
    expect([run.frame().behaviour.name, run.state().emote?.name]).toEqual(['wander', 'doubt']);
  });

  test('an element that is gone ends it, and so does a habitat that is gone', () => {
    const run = untilStep(laying(), 'rise');
    expect(run.frame({ target: { kind: 'gone' } }).behaviour.name).toBe('wander');
    const homeless = untilStep(laying(), 'lay');
    expect(homeless.frame({ home: null }).behaviour.name).toBe('wander');
  });

  test('a lay ended up on the bar, by an intent or by an element that is gone, brings Flint down at the body rate', () => {
    for (const end of [(run: MindRun) => run.give('happy'), (run: MindRun) => run.perceive({ target: { kind: 'gone' } })]) {
      const run = untilStep(laying(), 'lay');
      end(run);
      const ended = run.frame();
      expect(ended.behaviour.name).toBe('wander');
      expect(ended.motion.floorY).toBeLessThan(660);
      run.runFor(1500);
      expect(run.state().motion.floorY).toBe(700);
    }
  });

  test('a lay that ends while Flint comes back down, and a second lay started up on the bar, bring Flint down at the body rate', () => {
    const descending = untilStep(untilStep(laying(), 'lay'), 'end');
    descending.perceive({ target: { kind: 'gone' } });
    expect(descending.frame().motion.floorY).toBeLessThan(660);
    const again = untilStep(laying(), 'lay');
    again.runFor(1000);
    again.give('lay-bar-along');
    again.frame();
    expect([layOf(again).step, again.state().motion.floorY < 660]).toEqual(['go', true]);
    untilStep(again, 'rise');
  });

  test('with no element it does not start', () => {
    expect(laying({ kind: 'none' }).state().behaviour.name).toBe('wander');
  });
});

describe('under reduced motion', () => {
  test('Flint is placed at the bar\'s right end, on its bottom edge, happy, with no shimmer; after the emote it rests on its floor', () => {
    const run = laying(BAR, true);
    expect([run.state().motion.positionX, run.state().motion.floorY, run.state().emote?.name, layOf(run).step]).toEqual([640, 650, 'happy', 'end']);
    expect(targetPoseOfMind(run.state(), run.elapsedMilliseconds(), true).page.shapes).toEqual([]);
    run.runUntil((state) => state.behaviour.name !== 'lay-bar-along');
    expect(run.frame().motion.floorY).toBe(700);
  });
});
