/**
 * The visit and its pop-in around a corner, on the pure mind: the steps in order with their points, speeds and times, the facing and
 * drawing order, and entry through the edge of a habitat that keeps Flint inside, so Flint never shows over the content around it.
 */
import { describe, expect, test } from 'bun:test';

import { targetPoseOfMind }     from '../../SpriteMind.ts';
import type { SpriteMindState } from '../../mind/MindState.ts';
import type { MindRun }         from '../../testing/MindRun.ts';
import {
  CHAT,
  createMindRun,
  FRAME_MILLISECONDS,
  habitatOf,
  perceptionOf
} from '../../testing/MindRun.ts';
import type { PopInStep, VisitState } from './VisitBehaviour.ts';
import { turningWidthAt }             from './VisitBehaviour.ts';

/** On the home's floor line (700), left of the home, so Flint walks to its right edge at 800. */
const NEIGHBOUR = habitatOf('neighbour', {
  leftX: 500, rightX: 800, topY: 400, floorY: 700,
});
const EDGE_X = 800;

interface StepRecord {
  readonly step:                  PopInStep;
  readonly enteredAtMilliseconds: number;
  readonly offsetUnits:           number;
  readonly facing:                number;
}

function visitOf(state: SpriteMindState): VisitState {
  if (state.behaviour.name !== 'visit') throw new Error(`Flint ${state.behaviour.name}s, it does not visit`);
  return state.behaviour as VisitState;
}

function startedVisit(): MindRun {
  const run = createMindRun(undefined, perceptionOf({ habitats: [CHAT, NEIGHBOUR] }));
  run.frame();
  run.give('visit', 'neighbour');
  run.frame();
  return run;
}

function stepsOfWholeVisit(run: MindRun): readonly StepRecord[] {
  const steps: StepRecord[] = [];
  while (run.state().behaviour.name === 'visit') {
    const visit = visitOf(run.state());
    if (steps.at(-1)?.step !== visit.step) {
      steps.push({
        step: visit.step, enteredAtMilliseconds: run.elapsedMilliseconds(), offsetUnits: visit.offsetUnits, facing: run.state().motion.facing,
      });
    }
    run.frame();
  }
  return steps;
}

function stepLengthOf(steps: readonly StepRecord[], step: PopInStep): number {
  const index = steps.findIndex((record) => record.step === step);
  const next = steps[index + 1];
  const entered = steps[index];
  if (entered === undefined || next === undefined) throw new Error(`no step after ${step}`);
  return next.enteredAtMilliseconds - entered.enteredAtMilliseconds;
}

describe('the pop-in on the same floor line', () => {
  test('the steps come in their order: go, go behind, wait, peek, duck, peek again, wave, move in', () => {
    const steps = stepsOfWholeVisit(startedVisit());
    expect(steps.map((record) => record.step)).toEqual(['go', 'go-behind', 'wait', 'peek', 'duck', 'peek-again', 'wave', 'move-in']);
  });

  test('step 1 walks at the walk speed to 28 units outside the edge, facing the way it walks', () => {
    const run = startedVisit();
    const startX = run.state().motion.positionX;
    run.frame();
    expect(startX - run.state().motion.positionX).toBeCloseTo(220 * FRAME_MILLISECONDS / 1000, 5);
    expect(run.state().motion.facing).toBe(-1);
    run.runUntil((state) => visitOf(state).step === 'go-behind');
    expect(run.state().motion.positionX).toBeCloseTo(EDGE_X + 28, 5);
  });

  test('step 2 goes behind to 30 units inside at 110 units a second, facing in, and turns from 100% to 80% wide', () => {
    const run = startedVisit();
    run.runUntil((state) => visitOf(state).step === 'go-behind');
    const before = visitOf(run.state()).offsetUnits;
    run.frame();
    expect(before - visitOf(run.state()).offsetUnits).toBeCloseTo(110 * FRAME_MILLISECONDS / 1000, 5);
    expect(run.state().motion.facing).toBe(-1);
    expect(turningWidthAt(28)).toBe(1);
    expect(turningWidthAt(15.75)).toBeCloseTo(0.9, 10);
    expect(turningWidthAt(3.5)).toBe(0.8);
    expect(turningWidthAt(-30)).toBe(0.8);
    run.runUntil((state) => visitOf(state).step === 'wait');
    expect(run.state().motion.positionX).toBeCloseTo(EDGE_X - 30, 5);
  });

  test('the wait, the peek, the duck, the second peek and the wave last 0.6, 1.1, 0.6, 0.9 and 2.2 seconds', () => {
    const steps = stepsOfWholeVisit(startedVisit());
    const lengths = (['wait', 'peek', 'duck', 'peek-again', 'wave'] as const).map((step) => stepLengthOf(steps, step));
    [600, 1100, 600, 900, 2200].forEach((milliseconds, i) => {
      expect(lengths[i]).toBeGreaterThanOrEqual(milliseconds);
      expect(lengths[i]).toBeLessThan(milliseconds + FRAME_MILLISECONDS);
    });
  });

  test('Flint faces out from the peek on, peeks at 3.5 units outside and ducks to 20 units inside', () => {
    const steps = stepsOfWholeVisit(startedVisit());
    const byStep = new Map(steps.map((record) => [record.step, record]));
    expect(byStep.get('wait')?.facing).toBe(-1);
    expect([byStep.get('peek')?.facing, byStep.get('peek')?.offsetUnits]).toEqual([1, 3.5]);
    expect(byStep.get('duck')?.offsetUnits).toBe(-20);
    expect(byStep.get('peek-again')?.offsetUnits).toBe(3.5);
  });

  test('the peek eases the position at the peek rate, with narrow eyes, a 5 degree lean and the eye shift 2', () => {
    const run = startedVisit();
    run.runUntil((state) => visitOf(state).step === 'peek');
    const pose = targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false);
    expect(pose.body.positionEasing).toBe('peek');
    expect(pose.body.positionX).toBeCloseTo(EDGE_X + 3.5, 5);
    expect([pose.eyes.height, pose.eyes.shift, pose.body.leanDegrees, pose.body.sidewaysWidth]).toEqual([6, 2, 5, 0.8]);
    expect(pose.exactFields).toContain('sideways-width');
  });

  test('the component is drawn in front of Flint, on the inside of its edge, for the whole sequence', () => {
    const run = startedVisit();
    while (run.state().behaviour.name === 'visit') {
      expect(targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).occlusion).toEqual({ edgeX: EDGE_X, hiddenSide: -1 });
      run.frame();
    }
    expect(targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).occlusion).toBeNull();
  });

  test('the wave step waves with the wave gesture, and moving in ends it', () => {
    const run = startedVisit();
    run.runUntil((state) => visitOf(state).step === 'wave');
    expect(run.state().gesture?.intent).toBe('wave');
    run.runUntil((state) => visitOf(state).step === 'move-in');
    expect(run.state().gesture).toBeNull();
  });

  test('step 8 moves in at 50 units a second, widening as it goes, and Flint then lives there, greeted, and hears arrived', () => {
    const run = startedVisit();
    run.runUntil((state) => visitOf(state).step === 'move-in');
    const before = visitOf(run.state()).offsetUnits;
    run.frame();
    const visit = visitOf(run.state());
    expect(visit.offsetUnits - before).toBeCloseTo(50 * FRAME_MILLISECONDS / 1000, 5);
    expect(targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false).body.sidewaysWidth).toBeCloseTo(turningWidthAt(visit.offsetUnits), 10);
    const arrived = run.runUntil((state) => state.behaviour.name !== 'visit');
    expect([arrived.livesIn, arrived.behaviour.name, arrived.arrivalGreeting, arrived.directorInbox]).toEqual(['neighbour', 'wander', 'wave', ['arrived']]);
    expect(arrived.motion.positionX).toBeCloseTo(EDGE_X + 28, 5);
  });
});

describe('the pop-in from elsewhere', () => {
  test('from another floor line Flint starts hidden 30 units inside the nearer fitting edge, facing in, at the wait', () => {
    const run = createMindRun();
    run.frame();
    run.give('visit', 'chat');
    const visit = visitOf(run.frame());
    expect([visit.step, visit.edgeSide, visit.edgeX, run.state().motion.facing]).toEqual(['wait', 1, 600, -1]);
    expect([run.state().motion.positionX, run.state().motion.floorY]).toEqual([570, 500]);
  });

  test('a habitat with no room on its right is entered around its left edge', () => {
    const atTheRight = habitatOf('side', {
      leftX: 900, rightX: 1180, topY: 100, floorY: 300,
    });
    const run = createMindRun(undefined, perceptionOf({ habitats: [atTheRight] }));
    run.frame();
    run.give('visit', 'side');
    expect(visitOf(run.frame()).edgeSide).toBe(-1);
    expect(run.state().motion.positionX).toBe(930);
  });

  test('a habitat that leaves the page ends the visit', () => {
    const run = startedVisit();
    run.frame({ habitats: [CHAT] });
    expect([run.state().behaviour.name, run.state().livesIn]).toEqual(['wander', null]);
  });
});

describe('the pop-in into a habitat that keeps Flint inside', () => {
  /** A slot of 133 by 133 units on the home's floor line, with content around it: Flint may stand from 520 to 613. */
  const SLOT = habitatOf('slot', {
    leftX: 500, rightX: 633, topY: 567, floorY: 700,
  }, { keepsFlintInside: true });
  const SLOT_EDGE_X = 633;
  const HALF_BODY_WIDTH_UNITS = 20;

  function startedSlotVisit(): MindRun {
    const run = createMindRun(undefined, perceptionOf({ habitats: [CHAT, SLOT] }));
    run.frame();
    run.give('visit', 'slot');
    run.frame();
    return run;
  }

  test('Flint waits hidden outside the edge, peeks in, ducks out, peeks again, waves and moves in, with no walk outside the box', () => {
    const steps = stepsOfWholeVisit(startedSlotVisit());
    expect(steps.map((record) => record.step)).toEqual(['wait', 'peek', 'duck', 'peek-again', 'wave', 'move-in']);
    const byStep = new Map(steps.map((record) => [record.step, record]));
    expect([byStep.get('wait')?.facing, byStep.get('peek')?.facing, byStep.get('peek')?.offsetUnits]).toEqual([1, -1, 3.5]);
  });

  test('on every frame the page outside the box is drawn in front of Flint, and Flint stands inside the box', () => {
    const run = startedSlotVisit();
    while (run.state().behaviour.name === 'visit') {
      const pose = targetPoseOfMind(run.state(), run.elapsedMilliseconds(), false);
      expect(pose.occlusion).toEqual({ edgeX: SLOT_EDGE_X, hiddenSide: 1 });
      expect(pose.body.positionX - (HALF_BODY_WIDTH_UNITS * pose.body.sidewaysWidth)).toBeGreaterThanOrEqual(SLOT.box.leftX);
      run.frame();
    }
  });

  test('Flint arrives 28 units inside the edge, lives there and stays put, with no walk back into its box', () => {
    const run = startedSlotVisit();
    const arrived = run.runUntil((state) => state.behaviour.name !== 'visit');
    expect([arrived.livesIn, arrived.motion.positionX]).toEqual(['slot', SLOT_EDGE_X - 28]);
    run.runFor(500);
    expect([run.state().motion.positionX, run.state().motion.walkDirection]).toEqual([SLOT_EDGE_X - 28, 0]);
  });
});

test('under reduced motion Flint arrives at once, on the floor of the habitat, and the arrival is not counted as greeted', () => {
  const run = createMindRun(undefined, perceptionOf({ reducedMotion: true }));
  run.frame();
  run.give('visit', 'chat');
  const arrived = run.frame();
  expect([arrived.livesIn, arrived.behaviour.name, arrived.arrivalGreeting, arrived.motion.floorY]).toEqual(['chat', 'wander', null, 500]);
});

test('a wave asked for right after the pop-in repeats its greeting and is dropped once; the next wave is carried out', () => {
  const run = startedVisit();
  run.runUntil((state) => state.behaviour.name !== 'visit');
  run.give('wave');
  expect([run.frame().gesture, run.state().arrivalGreeting]).toEqual([null, null]);
  run.runUntil((state) => state.motion.walkDirection === 0);
  run.give('wave');
  expect(run.frame().gesture?.intent).toBe('wave');
});
