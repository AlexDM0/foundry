/**
 * Chase the bug, `08-more-behaviours.md`, on the pure mind frame by frame. What matters: the bug comes from the bottom centre of the
 * element, clamped to the floor, and falls with the gravity of the jump; with no element it starts 60 ahead of Flint on the floor; a run
 * goes away from Flint to 60 to 140 from it as the seeded sequence says, and past a wall it turns and runs past Flint; the runs go at 260,
 * then 85% of the last; a resting bug runs when Flint comes within 40 or after 900 ms, and after 12 s it runs no more. Flint is surprised,
 * walks after the bug with narrowed eyes, jumps when it changes side close by, and grabs within the catch distance with the pause of
 * cursor play; a miss shows the Annoyed emote once. The grab that catches holds the bug between the closed hands, as a prop that moves
 * with Flint, for 600 ms with its wiggle twice as fast; the hands stay closed on it while the line links it to the element for 600 ms and
 * until it has shrunk away; it becomes a ticket that starts on the floor, rises and fades in 700 ms, with the Happy emote; then Flint rests.
 * A Flint that a behaviour left above its floor comes down at the body rate. A drag, a new intent, or a habitat or element that is gone
 * ends the chase and its grab. Under reduced motion the bug rests 30 ahead and is caught in one grab, and the ticket does not rise. A
 * second chase is refused.
 */
import { describe, expect, test } from 'bun:test';

import type { Point }                                      from '../../SpriteGeometry.ts';
import { targetPoseOfMind }                                from '../../SpriteMind.ts';
import { JUMP }                                            from '../../constants/Motion.ts';
import type { Shape }                                      from '../../drawing/Shape.ts';
import type { SpriteMindState }                            from '../../mind/MindState.ts';
import type { PerceivedTarget, PlaceBox }                  from '../../mind/Perception.ts';
import { SeededSequenceUtil }                              from '../../mind/utils/SeededSequenceUtil.ts';
import { BugShapeUtil }                                    from '../../props/shapes/BugShapeUtil.ts';
import type { MindRun }                                    from '../../testing/MindRun.ts';
import { createMindRun, FRAME_MILLISECONDS, perceptionOf } from '../../testing/MindRun.ts';
import { JumpMotionUtil }                                  from '../../utils/JumpMotionUtil.ts';
import type { ChaseBugState }                              from './ChaseBugBehaviour.ts';
import { bugAfterFrame, chaseBugPartOf }                   from './ChaseBugBehaviour.ts';

/** A wide home, so the chase has room: Flint is placed in its middle, at 600, on its floor at 700. */
const WIDE_HOME: PlaceBox = Object.freeze({
  leftX: 100, rightX: 1100, topY: 300, floorY: 700,
});
const ELEMENT_BOX: PlaceBox = Object.freeze({
  leftX: 700, rightX: 900, topY: 560, floorY: 580,
});
const ELEMENT: PerceivedTarget = Object.freeze({ kind: 'on-the-page', box: ELEMENT_BOX });
/** The bug at 150%: its centre stands its scaled radius above the floor. */
const BUG_ON_FLOOR_Y = 700 - (2.2 * 1.5);
const BUG_REACH_UNITS = (2.2 + 1.6) * 1.5;
/** The lowest corner of the mini sheet is this far below its centre: the paper's lowest point 18 below its centre, at the scale 0.55. */
const MINI_SHEET_LOWEST_BELOW_CENTRE_UNITS = 18 * 0.55;

function chaseOf(state: SpriteMindState): ChaseBugState {
  if (state.behaviour.name !== 'chase-bug') throw new Error(`Flint ${state.behaviour.name}s, it does not chase`);
  return state.behaviour as ChaseBugState;
}

function withChase(state: SpriteMindState, changes: Partial<ChaseBugState>): SpriteMindState {
  const chase: ChaseBugState = { ...chaseOf(state), ...changes };
  return { ...state, behaviour: chase };
}

function chasing(target: PerceivedTarget = ELEMENT, reducedMotion = false): MindRun {
  const run = createMindRun(undefined, perceptionOf({ home: WIDE_HOME, target, reducedMotion }));
  run.frame();
  run.give('chase-bug');
  run.frame();
  return run;
}

function pageShapesNow(run: MindRun): readonly Shape[] {
  return targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).page.shapes;
}

/** A chase at a step, with the bug where it is given and Flint standing at 600, for the bug's own frames. */
function chaseState(changes: Partial<ChaseBugState>): ChaseBugState {
  return {
    name:                       'chase-bug',
    startedAtMilliseconds:      0,
    step:                       'chase',
    stepStartedAtMilliseconds:  0,
    bugX:                       630,
    bugY:                       BUG_ON_FLOOR_Y,
    bugFallSpeedUnitsPerSecond: 0,
    bugMotion:                  'resting',
    bugFacing:                  1,
    runPoints:                  [],
    runSpeedUnitsPerSecond:     260,
    runCount:                   0,
    restStartedAtMilliseconds:  0,
    elementAnchor:              null,
    bugSide:                    1,
    nextGrabAtMilliseconds:     0,
    hasBeenAnnoyed:             false,
    handsClosedAt:              null,
    liftUnits:                  0,
    ...changes,
  };
}

const STANDING: SpriteMindState = createMindRun(undefined, perceptionOf({ home: WIDE_HOME })).frame();

function bugFrame(chase: ChaseBugState, elapsedMilliseconds: number, flintX = 600): ReturnType<typeof bugAfterFrame> {
  const state = { ...STANDING, motion: { ...STANDING.motion, positionX: flintX } };
  return bugAfterFrame(state, chase, WIDE_HOME, perceptionOf({ home: WIDE_HOME }), { elapsedMilliseconds, deltaMilliseconds: FRAME_MILLISECONDS });
}

describe('the start', () => {
  test('the bug leaves the bottom centre of the element and falls with the gravity of the jump; Flint is surprised and turns to it', () => {
    const run = chasing();
    const started = chaseOf(run.state());
    expect([started.bugX, started.bugMotion, run.state().emote?.name, run.state().motion.facing]).toEqual([800, 'falling', 'surprised', 1]);
    const fallSpeedAfterFrames = (frames: number): number => JUMP.GRAVITY_UNITS_PER_SECOND_SQUARED * frames * FRAME_MILLISECONDS / 1000;
    run.frame();
    expect(chaseOf(run.state()).bugFallSpeedUnitsPerSecond).toBeCloseTo(fallSpeedAfterFrames(2), 5);
    run.runUntil((state) => chaseOf(state).bugMotion !== 'falling');
    expect(chaseOf(run.state()).bugY).toBeCloseTo(BUG_ON_FLOOR_Y, 5);
  });

  test('the bug of an element beyond the floor starts clamped sideways to it', () => {
    const run = chasing({ kind: 'on-the-page', box: { ...ELEMENT_BOX, leftX: 1150, rightX: 1250 } });
    expect(chaseOf(run.state()).bugX).toBeCloseTo(1100 - BUG_REACH_UNITS, 5);
  });

  test('with no element, the bug starts 60 ahead of Flint, on the floor, and runs at once', () => {
    const started = chaseOf(chasing({ kind: 'none' }).state());
    expect([started.bugY, started.bugMotion, started.elementAnchor, started.runCount]).toEqual([BUG_ON_FLOOR_Y, 'running', null, 1]);
    expect(started.bugX).toBe(660);
  });

  test('an element already gone, or no floor, starts no chase', () => {
    expect(chasing({ kind: 'gone' }).state().behaviour.name).toBe('wander');
    const homeless = createMindRun(undefined, perceptionOf({ home: null, target: ELEMENT }));
    homeless.give('chase-bug');
    expect(homeless.frame().behaviour.name).toBe('wander');
  });
});

describe('the runs of the bug', () => {
  test('a run goes away from Flint to the distance the seeded sequence gives, between 60 and 140', () => {
    const ran = bugFrame(chaseState({ bugX: 630 }), 2000);
    const seed = SeededSequenceUtil.nextSeedOf(STANDING.sequenceSeed);
    const distance = 60 + (SeededSequenceUtil.fractionOf(seed) * 80);
    expect([ran.chase.bugMotion, ran.chase.runPoints, ran.mind.sequenceSeed]).toEqual(['running', [600 + distance], seed]);
    expect(distance).toBeGreaterThanOrEqual(60);
    expect(distance).toBeLessThanOrEqual(140);
  });

  test('a run that would pass a wall goes to the wall, turns, and runs past Flint to the other side', () => {
    const ran = bugFrame(chaseState({ bugX: 1070 }), 2000, 1050);
    const distance = 60 + (SeededSequenceUtil.fractionOf(SeededSequenceUtil.nextSeedOf(STANDING.sequenceSeed)) * 80);
    expect(ran.chase.runPoints).toEqual([1100 - BUG_REACH_UNITS, 1050 - distance]);
  });

  test('the runs go at 260 units per second, then each at 85% of the last, so from the third Flint walks faster', () => {
    let chase = chaseState({ bugX: 630 });
    const speeds: number[] = [];
    for (let elapsedMilliseconds = 0; speeds.length < 4; elapsedMilliseconds += FRAME_MILLISECONDS) {
      const flintX = chase.bugX - 30;
      const before = chase.runCount;
      ({ chase } = bugFrame(chase, elapsedMilliseconds, flintX));
      if (chase.runCount > before) speeds.push(chase.runSpeedUnitsPerSecond);
    }
    expect(speeds.map((speed) => Math.round(speed * 100) / 100)).toEqual([260, 221, 187.85, 159.67]);
  });

  test('the running bug moves at its run speed, facing the way it runs, and rests at the end of its run', () => {
    const running = chaseState({
      bugMotion: 'running', runPoints: [700], runSpeedUnitsPerSecond: 260, bugFacing: -1
    });
    const stepped = bugFrame(running, 100).chase;
    expect(stepped.bugX - 630).toBeCloseTo(260 * FRAME_MILLISECONDS / 1000, 10);
    expect(stepped.bugFacing).toBe(1);
    const arrived = bugFrame({ ...running, bugX: 699 }, 100).chase;
    expect([arrived.bugX, arrived.bugMotion, arrived.restStartedAtMilliseconds]).toEqual([700, 'resting', 100]);
  });

  test('a resting bug runs again when Flint is nearer than 40, or once it has rested 900 ms', () => {
    const resting = chaseState({ bugX: 700, restStartedAtMilliseconds: 1000 });
    expect(bugFrame(resting, 1100, 640).chase.bugMotion).toBe('resting');
    expect(bugFrame(resting, 1100, 661).chase.bugMotion).toBe('running');
    expect(bugFrame({ ...resting, bugX: 650 }, 1899, 600).chase.bugMotion).toBe('resting');
    expect(bugFrame({ ...resting, bugX: 650 }, 1900, 600).chase.bugMotion).toBe('running');
  });

  test('a bug already as far as its run would take it rests again: a run never goes towards Flint', () => {
    const far = bugFrame(chaseState({ bugX: 900, restStartedAtMilliseconds: 0 }), 2000);
    expect([far.chase.bugMotion, far.chase.runCount, far.chase.restStartedAtMilliseconds]).toEqual(['resting', 0, 2000]);
  });

  test('after 12 seconds the bug runs no more', () => {
    const resting = chaseState({ bugX: 630 });
    expect(bugFrame(resting, 11999).chase.bugMotion).toBe('running');
    expect(bugFrame(resting, 12000).chase.bugMotion).toBe('resting');
  });
});

describe('Flint in the chase', () => {
  test('Flint walks after the bug at the walk speed, with narrowed, slanted eyes under the Surprised emote', () => {
    const run = chasing();
    const before = run.state().motion.positionX;
    const walking = run.frame();
    expect(walking.motion.walkDirection).toBe(1);
    expect(walking.motion.positionX - before).toBeCloseTo(220 * FRAME_MILLISECONDS / 1000, 10);
    const { part } = chaseBugPartOf(chaseOf(walking), { state: walking, elapsedMilliseconds: run.elapsedMilliseconds(), reducedMotion: false });
    expect(part?.eyes).toEqual({ height: 4, slantDegrees: 12 });
  });

  test('Flint jumps when the bug changes side within 30 units', () => {
    const run = chasing({ kind: 'none' });
    run.change((state) => ({
      ...state,
      behaviour: {
        ...chaseOf(state), bugX: 590, bugSide: 1, runCount: 1
      }
    }));
    expect(JumpMotionUtil.isAirborne(run.frame().motion.jump)).toBe(true);
  });

  test('Flint grabs at the bug within the catch distance, and grabs again only after the grab and its pause', () => {
    const run = chasing({ kind: 'none' }, true);
    const grab = run.state().gesture;
    expect([grab?.intent, chaseOf(run.state()).nextGrabAtMilliseconds]).toEqual(['grab', run.elapsedMilliseconds() + 900 + 300]);
  });

  test('a grab that closes on nothing shows the Annoyed emote, one time in the chase', () => {
    const run = chasing({ kind: 'none' }, true);
    const flee = (state: SpriteMindState): SpriteMindState => withChase(state, { bugX: 900 });
    run.change(flee);
    run.runFor(320);
    expect([run.state().gesture?.verdict, run.state().emote?.name]).toEqual([false, 'annoyed']);
    run.change((state) => ({ ...withChase(state, { bugX: 630, nextGrabAtMilliseconds: 0 }), emote: null }));
    run.runUntil((state) => state.gesture === null);
    run.runUntil((state) => state.gesture !== null);
    run.change(flee);
    run.runFor(320);
    expect([run.state().gesture?.verdict, run.state().emote]).toEqual([false, null]);
  });
});

describe('the catch and the ticket', () => {
  function caught(target: PerceivedTarget = ELEMENT): MindRun {
    const run = chasing(target, true);
    run.perceive({ reducedMotion: false });
    run.runUntil((state) => chaseOf(state).step === 'caught');
    return run;
  }

  function partNow(run: MindRun): ReturnType<typeof chaseBugPartOf> {
    return chaseBugPartOf(chaseOf(run.state()), { state: run.state(), elapsedMilliseconds: run.elapsedMilliseconds(), reducedMotion: false });
  }

  function handsMiddleOf(run: MindRun): Point {
    const { part } = partNow(run);
    const near = part?.nearHand ?? { centreX: 0, centreY: 0 };
    const far = part?.farHand ?? { centreX: 0, centreY: 0 };
    return { x: (near.centreX + far.centreX) / 2, y: (near.centreY + far.centreY) / 2 };
  }

  test('the grab that has the bug ends in Flint holding it between its closed hands for 600 ms; Flint stops, eye height 6', () => {
    const run = caught();
    expect([run.state().gesture, run.state().motion.walkDirection]).toEqual([null, 0]);
    const { part, page } = partNow(run);
    expect([part?.eyes?.height, part?.nearHand?.cornerCount, part?.farHand?.cornerCount]).toEqual([6, 5, 5]);
    const handsMiddle = handsMiddleOf(run);
    expect(part?.props?.heldBug).toMatchObject({ shown: 1, scale: 1.5 });
    expect(part?.props?.heldBug?.x).toBeCloseTo(handsMiddle.x, 10);
    expect(part?.props?.heldBug?.y).toBeCloseTo(handsMiddle.y, 10);
    expect(page?.shapes.some((shape) => shape.key === 'bug')).toBe(false);
    const { bugX, bugY } = chaseOf(run.state());
    const originY = run.state().motion.floorY - (6 + (3 * Math.sin(run.elapsedMilliseconds() / 400)));
    expect(run.state().motion.positionX + (run.state().motion.facing * handsMiddle.x)).toBeCloseTo(bugX, 5);
    expect(originY + handsMiddle.y).toBeCloseTo(bugY, 5);
    const enteredAt = run.elapsedMilliseconds();
    run.runUntil((state) => chaseOf(state).step !== 'caught');
    expect(run.elapsedMilliseconds() - enteredAt).toBeGreaterThanOrEqual(600);
    expect(run.elapsedMilliseconds() - enteredAt).toBeLessThan(600 + (2 * FRAME_MILLISECONDS));
  });

  test('a caught bug wiggles twice as fast', () => {
    const chase = chaseState({ step: 'caught', handsClosedAt: { x: 30, y: -10 } });
    const heldBug = chaseBugPartOf(chase, { state: STANDING, elapsedMilliseconds: 40, reducedMotion: false }).part?.props?.heldBug;
    expect(heldBug?.turnDegrees).toBe(BugShapeUtil.wiggleDegreesAt(80));
  });

  test('the hands stay closed on the bug while the line links it and until it has shrunk away in the ticket', () => {
    const run = caught();
    run.runUntil((state) => chaseOf(state).step === 'link');
    expect([partNow(run).part?.nearHand?.cornerCount, partNow(run).part?.props?.heldBug?.scale]).toEqual([5, 1.5]);
    run.runUntil((state) => chaseOf(state).step === 'ticket');
    run.runFor(150);
    expect(partNow(run).part?.nearHand?.cornerCount).toBe(5);
    expect(partNow(run).part?.props?.heldBug?.scale).toBeCloseTo(1.5 * (1 - ((150 + FRAME_MILLISECONDS) / 300)), 1);
    run.runFor(160);
    expect([partNow(run).part?.nearHand, partNow(run).part?.props?.heldBug, partNow(run).part?.eyes?.height]).toEqual([undefined, undefined, 6]);
  });

  test('with an element, a dashed crimson line links the bug to its bottom centre for 600 ms, then the bug becomes a ticket', () => {
    const run = caught();
    run.runUntil((state) => chaseOf(state).step === 'link');
    const link = pageShapesNow(run).find((shape) => shape.key === 'link');
    const { bugX, bugY } = chaseOf(run.state());
    expect(link).toMatchObject({
      kind: 'line', x1: bugX, y1: bugY, x2: 800, y2: 580, stroke: 'alarm', strokeWidth: 1, dash: [2, 2],
    });
    const linkedAt = run.elapsedMilliseconds();
    run.runUntil((state) => chaseOf(state).step === 'ticket');
    expect(run.elapsedMilliseconds() - linkedAt).toBeGreaterThanOrEqual(600);
  });

  test('with no element there is no link: the bug becomes a ticket at once', () => {
    const run = caught({ kind: 'none' });
    run.runUntil((state) => chaseOf(state).step !== 'caught');
    expect(chaseOf(run.state()).step).toBe('ticket');
  });

  test('the ticket starts with its lowest corner at the bug\'s lowest point, rises 12 and fades out in 700 ms; Flint is happy, and then rests', () => {
    const run = caught({ kind: 'none' });
    run.runUntil((state) => chaseOf(state).step === 'ticket');
    expect(run.state().emote?.name).toBe('happy');
    const { bugY } = chaseOf(run.state());
    run.runFor(320);
    const ticket = pageShapesNow(run).find((shape) => shape.key === 'ticket');
    expect(ticket?.opacity).toBeGreaterThan(0.9);
    const startCentreY = bugY + (2.2 * 1.5) - MINI_SHEET_LOWEST_BELOW_CENTRE_UNITS;
    expect(ticket?.transform?.[0]).toMatchObject({ translateY: expect.closeTo(startCentreY - (12 * (336 / 700)), 0) });
    run.runUntil((state) => state.behaviour.name !== 'chase-bug');
    expect(run.state().behaviour.name).toBe('wander');
  });

  test('a ticket of a bug on the floor starts on the floor, never below it', () => {
    const chase = chaseState({ step: 'ticket', stepStartedAtMilliseconds: 0 });
    const ticket = chaseBugPartOf(chase, { state: STANDING, elapsedMilliseconds: 0, reducedMotion: true }).page?.shapes.find((shape) => shape.key === 'ticket');
    expect(ticket?.transform?.[0]).toMatchObject({ translateY: expect.closeTo(700 - MINI_SHEET_LOWEST_BELOW_CENTRE_UNITS, 10) });
  });
});

describe('the endings', () => {
  test('a drag ends the chase, and the bug fades out in 200 ms', () => {
    const run = chasing();
    run.frame({ happenings: [{ kind: 'drag-started' }], pointer: { x: 500, y: 400, hasMoved: true } });
    expect(run.state().behaviour.name).toBe('carried');
    expect(chaseBugPartOf(chaseState({}), { state: STANDING, elapsedMilliseconds: 0, reducedMotion: false }).page?.fadeOutMilliseconds).toBe(200);
  });

  function grabbing(): MindRun {
    const run = chasing({ kind: 'none' }, true);
    expect(run.state().gesture?.intent).toBe('grab');
    return run;
  }

  test('a new intent ends the chase and its grab, and is carried out', () => {
    const run = grabbing();
    run.give('happy');
    const ended = run.frame();
    expect([ended.behaviour.name, ended.gesture, ended.emote?.name]).toEqual(['wander', null, 'happy']);
  });

  test('a habitat that is gone ends the chase, and so does an element that is gone, each with its grab', () => {
    const inChat = createMindRun(undefined, perceptionOf({ target: ELEMENT }));
    inChat.frame({ storedHabitatId: 'chat' });
    inChat.give('chase-bug');
    expect(inChat.frame().behaviour.name).toBe('chase-bug');
    expect(inChat.frame({ habitats: [] }).behaviour.name).toBe('wander');
    const run = chasing();
    expect(run.frame({ target: { kind: 'gone' } }).behaviour.name).toBe('wander');
    const homeless = grabbing();
    const ended = homeless.frame({ home: null });
    expect([ended.behaviour.name, ended.gesture]).toEqual(['wander', null]);
  });

  test('a second chase is refused while one runs', () => {
    const run = chasing();
    const { startedAtMilliseconds } = chaseOf(run.state());
    run.give('chase-bug');
    expect(chaseOf(run.frame()).startedAtMilliseconds).toBe(startedAtMilliseconds);
  });
});

describe('the floor', () => {
  test('a chase started above the floor brings Flint down at the body rate, not in one frame', () => {
    const run = createMindRun(undefined, perceptionOf({ home: WIDE_HOME, target: ELEMENT }));
    run.frame();
    run.change((state) => ({ ...state, motion: { ...state.motion, floorY: 630 } }));
    run.give('chase-bug');
    expect(run.frame().motion.floorY).toBeLessThan(640);
    run.runFor(1000);
    expect(run.state().motion.floorY).toBe(700);
  });

  test('under reduced motion the chase puts Flint on its floor at once', () => {
    const run = createMindRun(undefined, perceptionOf({ home: WIDE_HOME, target: ELEMENT, reducedMotion: true }));
    run.frame();
    run.change((state) => ({ ...state, motion: { ...state.motion, floorY: 630 } }));
    run.give('chase-bug');
    expect(run.frame().motion.floorY).toBe(700);
  });
});

describe('under reduced motion', () => {
  test('the bug does not run: it rests 30 ahead of Flint, and Flint grabs it one time and has it', () => {
    const run = chasing(ELEMENT, true);
    expect([chaseOf(run.state()).bugX, chaseOf(run.state()).bugMotion]).toEqual([630, 'resting']);
    run.runUntil((state) => chaseOf(state).step === 'caught');
    expect(chaseOf(run.state()).runCount).toBe(0);
    expect(run.state().motion.positionX).toBe(600);
  });

  test('the link and the ticket follow, and the ticket does not rise', () => {
    const run = chasing(ELEMENT, true);
    run.runUntil((state) => chaseOf(state).step === 'ticket');
    const { bugY } = chaseOf(run.state());
    run.runFor(400);
    const ticket = targetPoseOfMind(run.state(), run.elapsedMilliseconds(), true).page.shapes.find((shape) => shape.key === 'ticket');
    expect(ticket?.transform?.[0]).toMatchObject({ translateY: expect.closeTo(bugY + (2.2 * 1.5) - MINI_SHEET_LOWEST_BELOW_CENTRE_UNITS, 10) });
  });
});
